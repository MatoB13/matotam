"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dolz.module.css";
import type { DolzWalletCard } from "@/app/lib/dolzWalletCards";
import ShieldPanel from "./ShieldPanel";
import { floorClass } from "./floor";
import { errorText, estimateGas, POLYGON, polygonFees, provider, short, waitForReceipt, word, type Eip1193 } from "./metamask";

const CARDS_STORAGE_KEY = "dolz-mm-cards-v1";
const PAGE_SIZE = 10;
type MetaMaskView = "cards" | "shield";
const VIEWS: { id: MetaMaskView; label: string }[] = [
  { id: "cards", label: "Karty" },
  { id: "shield", label: "Povolenia a štít" },
];
// The portfolio tab keeps its last report here; its holdings name cards Blockscout has no metadata for.
const REPORT_STORAGE_KEY = "dolz-report-v1";

type ReportHolding = {
  token: string;
  id: string;
  name: string | null;
  card: string | null;
  tier: string | null;
  rarity: string | null;
  serial: string | null;
  valueUsd: number;
  costUsd: number;
  channel: string;
};

const CHANNEL_LABELS: Record<string, string> = {
  "dolz-market": "DOLZ market",
  opensea: "OpenSea",
  mint: "mint",
  card: "kartou",
  auction: "aukcia",
  free: "zadarmo",
};

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

type Floors = Record<string, number>;

/** Market floor of the same card and rarity ("g0131|limited"), once the card number and rarity are known. */
function withFloor(card: DolzWalletCard, floors: Floors): DolzWalletCard {
  const key = card.card && card.rarity ? `${card.card.toLowerCase()}|${card.rarity.toLowerCase()}` : null;
  return { ...card, floorUsd: card.floorUsd ?? (key ? floors[key] : undefined) ?? null };
}

/** Fill names, rarity and value from the stored portfolio report, then the market floor; sort by card name and serial. */
function enrich(cards: DolzWalletCard[], floors: Floors = {}): DolzWalletCard[] {
  const holdings = readStorage<{ holdings?: ReportHolding[] }>(REPORT_STORAGE_KEY)?.holdings ?? [];
  const byKey = new Map(holdings.map((holding) => [`${holding.token.toLowerCase()}:${holding.id}`, holding]));
  return cards
    .map((card) => {
      const holding = byKey.get(`${card.contract}:${card.id}`);
      if (!holding) return withFloor(card, floors);
      return withFloor({
        ...card,
        name: card.name ?? holding.name?.trim() ?? null,
        card: card.card ?? holding.card,
        tier: card.tier ?? holding.tier,
        rarity: card.rarity ?? holding.rarity,
        serial: card.serial ?? holding.serial,
        valueUsd: holding.valueUsd ?? card.valueUsd,
        costUsd: holding.costUsd,
        channel: holding.channel,
      }, floors);
    })
    .sort(
      (a, b) =>
        (a.name ?? "\uffff").localeCompare(b.name ?? "\uffff", "sk") ||
        Number(a.serial ?? Infinity) - Number(b.serial ?? Infinity) ||
        Number(a.id) - Number(b.id),
    );
}
const SAFE_TRANSFER_FROM = "0x42842e0e"; // safeTransferFrom(address,address,uint256)

function transferCall(card: DolzWalletCard, from: string, to: string) {
  return { to: card.contract, data: `${SAFE_TRANSFER_FROM}${word(from)}${word(to)}${word(BigInt(card.id).toString(16))}`, value: "0x0" };
}

export default function MetaMaskTab({ token }: { token: string }) {
  const [address, setAddress] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [cards, setCards] = useState<DolzWalletCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<MetaMaskView>("cards");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dolz/wallet-cards?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; address?: string; target?: string; cards?: DolzWalletCard[]; floors?: Floors; error?: string };
      if (!response.ok || !json.ok || !json.cards) throw new Error(json.error || `HTTP ${response.status}`);
      setAddress(json.address ?? null);
      setTarget(json.target ?? null);
      setCards(enrich(json.cards, json.floors));
      setError(null);
      try {
        window.localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify({ address: json.address, target: json.target, cards: json.cards, floors: json.floors }));
      } catch {
        // Storage full or blocked: the list just loads from the server next time.
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať karty.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      // Show the last list at once while the current one loads.
      const stored = readStorage<{ address?: string; target?: string; cards?: DolzWalletCard[]; floors?: Floors }>(CARDS_STORAGE_KEY);
      if (stored?.cards) {
        setAddress((current) => current ?? stored.address ?? null);
        setTarget((current) => current ?? stored.target ?? null);
        setCards((current) => (current.length ? current : enrich(stored.cards ?? [], stored.floors)));
      }
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // Follow account switches in MetaMask.
  useEffect(() => {
    const eth = provider();
    if (!eth?.on) return;
    const onAccounts = (...args: unknown[]) => setAccount(((args[0] as string[] | undefined)?.[0] ?? null)?.toLowerCase() ?? null);
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const connect = async (): Promise<{ eth: Eip1193; from: string } | null> => {
    const eth = provider();
    if (!eth) {
      setNotice({ ok: false, text: "MetaMask sa v tomto prehliadači nenašiel. Otvor stránku v prehliadači s MetaMaskom." });
      return null;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const from = accounts[0]?.toLowerCase() ?? null;
    setAccount(from);
    if (!from) return null;
    const chain = (await eth.request({ method: "eth_chainId" })) as string;
    if (chain.toLowerCase() !== POLYGON) await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON }] });
    return { eth, from };
  };

  const transfer = async (ids: string[], label: string) => {
    if (!address || !target || !ids.length) return;
    setBusy(label);
    setNotice(null);
    // Cards already moved stay moved even if a later one in the batch fails or is rejected.
    const moved: string[] = [];
    const dropMoved = () => {
      if (!moved.length) return;
      setCards((current) => current.filter((card) => !moved.includes(`${card.contract}:${card.id}`)));
      setSelected((current) => new Set([...current].filter((key) => !moved.includes(key))));
    };
    try {
      const connected = await connect();
      if (!connected) return;
      const { eth, from } = connected;
      if (from !== address) {
        setNotice({ ok: false, text: `V MetaMasku je vybraný účet ${short(from)}. Prepni na ${short(address)} a skús znova.` });
        return;
      }
      const chosen = cards.filter((card) => ids.includes(`${card.contract}:${card.id}`));
      const calls = chosen.map((card) => transferCall(card, from, target));
      // One MetaMask confirmation per card, in order; a rejection or failure stops the rest.
      for (const [index, call] of calls.entries()) {
        setNotice({ ok: true, text: calls.length > 1 ? `Podpíš v MetaMasku kartu ${index + 1} z ${calls.length}…` : "Podpíš presun v MetaMasku…" });
        const tx = { from, ...call };
        let gas: string;
        try {
          gas = await estimateGas(eth, tx);
        } catch (estimateError) {
          throw new Error(`Karta #${chosen[index].id} sa nedá presunúť: ${errorText(estimateError)}`);
        }
        const fees = await polygonFees(eth);
        const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ ...tx, gas, ...fees }] })) as string;
        if (!(await waitForReceipt(eth, hash))) throw new Error(`Presun karty #${chosen[index].id} neprešiel.`);
        moved.push(`${chosen[index].contract}:${chosen[index].id}`);
      }
      dropMoved();
      setNotice({ ok: true, text: `Presunuté na ${short(target)}: ${moved.length} ${moved.length === 1 ? "karta" : moved.length < 5 ? "karty" : "kariet"}.` });
    } catch (transferError) {
      dropMoved();
      setNotice({ ok: false, text: (moved.length ? `Presunuté ${moved.length}, potom: ` : "") + errorText(transferError) });
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) => [card.name, card.card, card.rarity, card.id].some((value) => value?.toLowerCase().includes(query)));
  }, [cards, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageCards = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const allVisibleSelected = visible.length > 0 && visible.every((card) => selected.has(`${card.contract}:${card.id}`));
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={styles.sniperTab}>
      <nav className={`${styles.tabBar} ${styles.subTabBar}`} role="tablist" aria-label="MetaMask">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? styles.tabActive : styles.tab}
            onClick={() => setView(item.id)}
          >
            {item.label}
            {item.id === "cards" && cards.length ? ` (${cards.length})` : ""}
          </button>
        ))}
      </nav>

      {view === "shield" ? <ShieldPanel token={token} /> : null}
      <section className={styles.panelFull} hidden={view !== "cards"}>
        <div className={styles.panelTitleRow}>
          <h2>Karty v MetaMasku</h2>
          <span>
            {address ? `${short(address)} · ${cards.length} kariet` : ""}
            {account ? <span className={account === address ? styles.goodText : styles.badText}> · pripojený {short(account)}</span> : null}
          </span>
        </div>
        <p className={styles.chartNote}>
          Presun posiela karty na Rabby wallet {target ? <code>{target}</code> : "…"}. Každý presun podpisuješ sám v MetaMasku, stránka nemá žiadny kľúč.
          Pri hromadnom presune potvrdíš v MetaMasku každú kartu zvlášť, jednu po druhej.
          Kartu vystavenú na markete najprv stiahni z predaja na dolz.io, inak by ponuka ostala visieť.
        </p>
        {error ? <p className={styles.badText}>{error}</p> : null}

        <div className={styles.sellBulk}>
          <input
            className={styles.quickBuyInput}
            placeholder="Hľadať meno, číslo karty, raritu…"
            aria-label="Filtrovať karty"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
          <span className={styles.mutedText}>Vybrané: {selected.size}</span>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!!busy || selected.size === 0 || !target}
            onClick={() => void transfer([...selected], "bulk")}
          >
            {busy === "bulk" ? "Čakám na MetaMask…" : `Presunúť vybrané (${selected.size})`}
          </button>
          <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading || !!busy}>
            {loading ? "Načítavam…" : "Obnoviť"}
          </button>
        </div>
        {notice ? (
          // Fixed to the bottom of the screen, so the result shows next to whichever row was clicked.
          <div className={`${styles.toast} ${notice.ok ? styles.toastOk : styles.toastBad}`} role="status">
            <span>{notice.text}</span>
            <button type="button" className={styles.iconButton} onClick={() => setNotice(null)} aria-label="Zavrieť">
              ✕
            </button>
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <table className={styles.sellTable}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Vybrať všetky karty vo filtri (na všetkých stranách)"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const card of visible) {
                          if (allVisibleSelected) next.delete(`${card.contract}:${card.id}`);
                          else next.add(`${card.contract}:${card.id}`);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <th>Karta</th>
                <th>Rarita</th>
                <th className={styles.num}>Kúpené</th>
                <th className={styles.num} title="Najnižšia aktuálna ponuka rovnakej karty a rarity na DOLZ markete">Najnižšia</th>
                <th className={styles.num}>Odhad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!visible.length ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    {loading ? "Načítavam karty z blockchainu…" : filter ? "Nič nezodpovedá filtru." : "V tomto wallete nie sú žiadne DOLZ karty."}
                  </td>
                </tr>
              ) : (
                pageCards.map((card) => {
                  const key = `${card.contract}:${card.id}`;
                  return (
                    <tr key={key} className={selected.has(key) ? styles.sellSelected : undefined}>
                      <td>
                        <input type="checkbox" aria-label={`Vybrať ${card.name ?? card.id}`} checked={selected.has(key)} onChange={() => toggle(key)} />
                      </td>
                      <td>
                        {card.name ?? `${card.collection} #${card.id}`}
                        <small className={styles.mutedText}>
                          {" "}
                          · {card.card ?? card.collection} · #{card.id}
                        </small>
                      </td>
                      <td>
                        {[card.rarity, card.tier ? `/${card.tier}` : null].filter(Boolean).join(" ") || "—"}
                        {card.serial ? <small className={styles.mutedText}> · #{card.serial}</small> : null}
                      </td>
                      <td className={styles.num} title={card.channel ? `Získané: ${CHANNEL_LABELS[card.channel] ?? card.channel}` : undefined}>
                        {card.costUsd != null ? `$${card.costUsd.toFixed(2)}` : "—"}
                        {card.channel ? <small className={styles.mutedText}> · {CHANNEL_LABELS[card.channel] ?? card.channel}</small> : null}
                      </td>
                      <td
                        className={`${styles.num} ${floorClass(card.floorUsd, card.costUsd)}`}
                        title="Najnižšia aktuálna ponuka rovnakej karty a rarity na DOLZ markete"
                      >
                        {card.floorUsd != null ? `$${card.floorUsd.toFixed(2)}` : "—"}
                      </td>
                      <td className={styles.num}>{card.valueUsd != null ? `$${card.valueUsd.toFixed(2)}` : "—"}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.refreshButton}
                          disabled={!!busy || !target}
                          onClick={() => void transfer([key], key)}
                        >
                          {busy === key ? "Čakám…" : "Presunúť"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {visible.length > PAGE_SIZE ? (
          <div className={styles.sellBulk}>
            <button type="button" className={styles.refreshButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              ‹ Predošlá
            </button>
            <span className={styles.mutedText}>
              Strana {currentPage + 1} z {pageCount} · {visible.length} {filter ? "kariet vo filtri" : "kariet"}
            </span>
            <button type="button" className={styles.refreshButton} disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
              Ďalšia ›
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
