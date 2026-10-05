"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dolz.module.css";
import type { DolzWalletCard } from "@/app/lib/dolzWalletCards";

// Every transfer is signed by the user in MetaMask; nothing here holds a key.
type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193[];
};
type RpcError = { code?: number; message?: string };

const POLYGON = "0x89";
const SAFE_TRANSFER_FROM = "0x42842e0e"; // safeTransferFrom(address,address,uint256)

function provider(): Eip1193 | null {
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!injected) return null;
  // With several wallet extensions installed, prefer MetaMask's own provider.
  return injected.providers?.find((item) => item.isMetaMask) ?? injected;
}

const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function transferCall(card: DolzWalletCard, from: string, to: string) {
  return { to: card.contract, data: `${SAFE_TRANSFER_FROM}${word(from)}${word(to)}${word(BigInt(card.id).toString(16))}`, value: "0x0" };
}

function errorText(error: unknown): string {
  const rpc = error as RpcError;
  if (rpc?.code === 4001) return "Zamietnuté v MetaMasku.";
  return rpc?.message || (error instanceof Error ? error.message : "Presun zlyhal.");
}

async function waitForReceipt(eth: Eip1193, hash: string): Promise<boolean> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status?: string } | null;
    if (receipt?.status) return receipt.status === "0x1";
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Transakcia sa zatiaľ nepotvrdila, skontroluj ju v MetaMasku.");
}

/** wallet_sendCalls (EIP-5792): one MetaMask confirmation for the whole batch, where the wallet supports it. */
async function sendBatch(eth: Eip1193, from: string, calls: ReturnType<typeof transferCall>[]): Promise<boolean> {
  const result = (await eth.request({
    method: "wallet_sendCalls",
    params: [{ version: "2.0.0", chainId: POLYGON, from, atomicRequired: true, calls }],
  })) as { id: string } | string;
  const id = typeof result === "string" ? result : result.id;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = (await eth.request({ method: "wallet_getCallsStatus", params: [id] }).catch(() => null)) as { status?: number | string } | null;
    const code = Number(status?.status);
    if (code === 200 || status?.status === "CONFIRMED") return true;
    if (code >= 400) return false;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Hromadný presun sa zatiaľ nepotvrdil, skontroluj ho v MetaMasku.");
}

function batchUnsupported(error: unknown): boolean {
  const rpc = error as RpcError;
  return [4100, 4200, 5700, 5710, 5750, -32601, -32602].includes(Number(rpc?.code)) || /not supported|unsupported|does not exist/i.test(rpc?.message ?? "");
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
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dolz/wallet-cards?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; address?: string; target?: string; cards?: DolzWalletCard[]; error?: string };
      if (!response.ok || !json.ok || !json.cards) throw new Error(json.error || `HTTP ${response.status}`);
      setAddress(json.address ?? null);
      setTarget(json.target ?? null);
      setCards(json.cards);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať karty.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
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
      let moved: string[] = [];
      if (calls.length > 1) {
        try {
          setNotice({ ok: true, text: `Potvrď v MetaMasku presun ${calls.length} kariet jednou transakciou…` });
          if (await sendBatch(eth, from, calls)) moved = ids;
          else throw new Error("Hromadný presun neprešiel.");
        } catch (batchError) {
          if (!batchUnsupported(batchError)) throw batchError;
          // The wallet cannot batch: one confirmation per card instead.
        }
      }
      if (!moved.length) {
        for (const [index, call] of calls.entries()) {
          setNotice({ ok: true, text: calls.length > 1 ? `Podpíš v MetaMasku kartu ${index + 1} z ${calls.length}…` : "Podpíš presun v MetaMasku…" });
          const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, ...call }] })) as string;
          if (!(await waitForReceipt(eth, hash))) throw new Error(`Presun karty #${chosen[index].id} neprešiel.`);
          moved.push(`${chosen[index].contract}:${chosen[index].id}`);
        }
      }
      setCards((current) => current.filter((card) => !moved.includes(`${card.contract}:${card.id}`)));
      setSelected((current) => new Set([...current].filter((key) => !moved.includes(key))));
      setNotice({ ok: true, text: `Presunuté na ${short(target)}: ${moved.length} ${moved.length === 1 ? "karta" : moved.length < 5 ? "karty" : "kariet"}.` });
    } catch (transferError) {
      setNotice({ ok: false, text: errorText(transferError) });
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) => [card.name, card.card, card.rarity, card.id].some((value) => value?.toLowerCase().includes(query)));
  }, [cards, filter]);
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
      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Karty v MetaMasku</h2>
          <span>
            {address ? `${short(address)} · ${cards.length} kariet` : ""}
            {account ? <span className={account === address ? styles.goodText : styles.badText}> · pripojený {short(account)}</span> : null}
          </span>
        </div>
        <p className={styles.chartNote}>
          Presun posiela karty na Rabby wallet {target ? <code>{target}</code> : "…"}. Každý presun podpisuješ sám v MetaMasku, stránka nemá žiadny kľúč.
          Pri hromadnom presune MetaMask, ak to vie, ponúkne jednu transakciu pre všetky karty, inak potvrdíš každú kartu zvlášť.
          Kartu vystavenú na markete najprv stiahni z predaja na dolz.io, inak by ponuka ostala visieť.
        </p>
        {error ? <p className={styles.badText}>{error}</p> : null}

        <div className={styles.sellBulk}>
          <input
            className={styles.quickBuyInput}
            placeholder="Hľadať meno, číslo karty, raritu…"
            aria-label="Filtrovať karty"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
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
        {notice ? <p className={notice.ok ? styles.goodText : styles.badText}>{notice.text}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.sellTable}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Vybrať všetky zobrazené karty"
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
                <th className={styles.num}>Odhad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!visible.length ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    {loading ? "Načítavam karty z blockchainu…" : filter ? "Nič nezodpovedá filtru." : "V tomto wallete nie sú žiadne DOLZ karty."}
                  </td>
                </tr>
              ) : (
                visible.map((card) => {
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
      </section>
    </div>
  );
}
