"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dolz.module.css";
import { DOLZ_CARD_CATALOG } from "@/app/lib/dolzCardCatalog";
import type { DolzCollection, DolzCollectionFloor, DolzSellResult, DolzSniperConfig, DolzSniperStatus } from "@/app/lib/dolzSniper";

const DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc";
const MAX_RULES = 20;

type MissingCard = { card: string; name: string; season: string | null; floor: DolzCollectionFloor | null };

function seasonLabel(season: string | null): string {
  if (!season) return "Neznáma sezóna";
  return /^\d+$/.test(season) ? `Season ${season}` : season;
}

/** Numbered seasons first, then OG, Special Edition, Off-Season and anything else. */
function seasonOrder(season: string | null): number {
  if (season && /^\d+$/.test(season)) return Number(season);
  return { OG: 100, "Special Edition": 101, "Off-Season": 102 }[season ?? ""] ?? 200;
}

function formatUsd(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`;
}

export default function MissingCardsTab({ token }: { token: string }) {
  const [collection, setCollection] = useState<DolzCollection | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [onlyListed, setOnlyListed] = useState(false);

  const api = useCallback((path: string, init?: RequestInit) => fetch(`${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, { cache: "no-store", ...init }), [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api("/api/dolz/collection");
      const json = (await response.json()) as { ok: boolean; collection?: DolzCollection | null; refreshing?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setCollection(json.collection ?? null);
      setRefreshing(!!json.refreshing);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať zbierku.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    // While the sniper recomputes, check back until the new result is in.
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);

  const { missing, ownedCount, total } = useMemo(() => {
    const catalog = new Map<string, { name: string; season: string | null }>();
    for (const item of DOLZ_CARD_CATALOG) catalog.set(item.card, { name: item.name.trim(), season: item.season });
    for (const item of collection?.catalog ?? []) {
      if (!catalog.has(item.card) && item.name) catalog.set(item.card, { name: item.name.trim(), season: item.season });
    }
    for (const item of collection?.owned ?? []) {
      if (!catalog.has(item.card)) catalog.set(item.card, { name: item.name?.trim() ?? item.card, season: item.season });
    }
    const owned = new Set((collection?.owned ?? []).map((item) => item.card));
    const list: MissingCard[] = [...catalog.entries()]
      .filter(([card]) => !owned.has(card))
      .map(([card, meta]) => ({ card, name: meta.name, season: meta.season, floor: collection?.floors[card] ?? null }))
      .sort((a, b) => seasonOrder(a.season) - seasonOrder(b.season) || a.card.localeCompare(b.card));
    return { missing: list, ownedCount: owned.size, total: catalog.size };
  }, [collection]);

  const visible = onlyListed ? missing.filter((item) => item.floor) : missing;
  const groups = useMemo(() => {
    const map = new Map<string, MissingCard[]>();
    for (const item of visible) map.set(seasonLabel(item.season), [...(map.get(seasonLabel(item.season)) ?? []), item]);
    return [...map.entries()];
  }, [visible]);
  const listedCost = missing.reduce((sum, item) => sum + (item.floor?.price_usd ?? 0), 0);

  const refresh = async () => {
    setNotice(null);
    try {
      const response = await api("/api/dolz/collection", { method: "POST" });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setRefreshing(true);
      setNotice({ ok: true, text: "Sniper prepočítava zbierku, výsledok sa ukáže o minútu–dve." });
    } catch (refreshError) {
      setNotice({ ok: false, text: refreshError instanceof Error ? refreshError.message : "Obnovenie zlyhalo." });
    }
  };

  const buy = async (item: MissingCard) => {
    if (!item.floor) return;
    if (!window.confirm(`Kúpiť ${item.card} ${item.name} (#${item.floor.token_id}) za ${formatUsd(item.floor.price_usd)} z hot walletu?`)) return;
    setBusy(item.card);
    setNotice(null);
    try {
      const response = await api("/api/dolz/sniper?action=buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link: item.floor.token_id, price_raw: item.floor.price_raw }),
      });
      const json = (await response.json()) as { ok: boolean; results?: DolzSellResult[]; error?: string };
      const result = json.results?.[0];
      if (!response.ok || !json.ok || !result?.ok) throw new Error(result?.error || json.error || `HTTP ${response.status}`);
      setNotice({ ok: true, text: `Kúpené: ${item.card} ${item.name} za ${formatUsd(item.floor.price_usd)}. Zbierka sa aktualizuje pri ďalšom prepočte.` });
      void refresh();
    } catch (buyError) {
      setNotice({ ok: false, text: buyError instanceof Error ? buyError.message : "Nákup zlyhal." });
    } finally {
      setBusy(null);
    }
  };

  const addRule = async (item: MissingCard) => {
    const suggested = item.floor ? Math.max(0.01, Math.floor(item.floor.price_usd * 0.9 * 100) / 100) : "";
    const answer = window.prompt(`Sniper kúpi ${item.card} ${item.name} (akákoľvek rarita), keď sa objaví za najviac … USD:`, String(suggested));
    if (answer === null) return;
    const maxPrice = Number(answer.replace(",", "."));
    if (!(maxPrice > 0)) {
      setNotice({ ok: false, text: "Zadaj kladnú cenu." });
      return;
    }
    setBusy(`rule-${item.card}`);
    setNotice(null);
    try {
      const statusResponse = await api("/api/dolz/sniper");
      const status = (await statusResponse.json()) as { ok: boolean; sniper?: DolzSniperStatus | null; error?: string };
      const config: DolzSniperConfig | undefined = status.sniper?.config;
      if (!statusResponse.ok || !status.ok || !config) throw new Error(status.error || "Sniper neodpovedá.");
      if (config.rules.length >= MAX_RULES) throw new Error(`Sniper má už ${MAX_RULES} pravidiel, najprv nejaké uvoľni v Nastaveniach.`);
      const next = {
        ...config,
        rules: [...config.rules, { enabled: true, card: item.card, card_name: item.name, min_rarity: null, season: null, max_price: maxPrice, max_serial: null }],
      };
      const saveResponse = await api("/api/dolz/sniper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      const saved = (await saveResponse.json()) as { ok: boolean; error?: string };
      if (!saveResponse.ok || !saved.ok) throw new Error(saved.error || `HTTP ${saveResponse.status}`);
      setNotice({ ok: true, text: `Pravidlo pridané: ${item.card} ${item.name} do ${formatUsd(maxPrice)}.` });
    } catch (ruleError) {
      setNotice({ ok: false, text: ruleError instanceof Error ? ruleError.message : "Pravidlo sa nepodarilo pridať." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.sniperTab}>
      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Chýbajúce karty</h2>
          <span>
            {collection ? `Máš ${ownedCount} z ${total} kariet · chýba ${missing.length}` : ""}
            {collection ? ` · stav ${new Date(collection.updatedAt).toLocaleString("sk-SK")}` : ""}
            {refreshing ? " · prepočítava sa…" : ""}
          </span>
        </div>
        <p className={styles.chartNote}>
          Karty, ktoré nemáš v žiadnom zo svojich walletov (MetaMask, dolz.io a sniper/Rabby), podľa ich histórie na blockchaine. Zoznam kariet tvoria všetky karty,
          ktoré sa kedy objavili na DOLZ markete. Cena je najlacnejšia aktuálna ponuka v USDC, sniper ju prepočítava každých 10 minút.
          {missing.some((item) => item.floor) ? ` Najlacnejšie ponuky spolu: ${formatUsd(listedCost)}.` : ""}
        </p>
        {collection?.unknownTokens.length ? (
          <p className={styles.mutedText}>
            Pri {collection.unknownTokens.length} tvojich kartách ešte nepoznáme číslo karty; ak je medzi nimi niektorá z chýbajúcich, pri ďalšom prepočte zmizne zo zoznamu.
          </p>
        ) : null}
        {error ? <p className={styles.badText}>{error}</p> : null}

        <div className={styles.sellBulk}>
          <label className={styles.switchInline}>
            <input type="checkbox" checked={onlyListed} onChange={(event) => setOnlyListed(event.target.checked)} />
            Len karty, ktoré sú teraz na predaj
          </label>
          <button type="button" className={styles.refreshButton} onClick={() => void refresh()} disabled={refreshing || loading}>
            {refreshing ? "Prepočítava sa…" : "Prepočítať teraz"}
          </button>
        </div>

        {!collection ? (
          <p className={styles.chartNote}>
            {loading ? "Načítavam…" : "Sniper zbierku ešte prepočítava (prvýkrát to trvá pár minút, lebo načítava údaje všetkých tvojich kariet). Stránka to skúsi znova sama."}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.sellTable}>
              <thead>
                <tr>
                  <th>Karta</th>
                  <th>Najlacnejšia ponuka</th>
                  <th className={styles.num}>Cena</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!groups.length ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      {onlyListed ? "Žiadna z chýbajúcich kariet nie je práve na predaj." : "Máš všetky karty, ktoré poznáme. 🎉"}
                    </td>
                  </tr>
                ) : (
                  groups.map(([season, items]) => [
                    <tr key={`h-${season}`}>
                      <th colSpan={4} className={styles.groupRow}>
                        {season} · {items.length}
                      </th>
                    </tr>,
                    ...items.map((item) => (
                      <tr key={item.card}>
                        <td>
                          {item.name}
                          <small className={styles.mutedText}> · {item.card}</small>
                        </td>
                        <td>
                          {item.floor ? (
                            <a
                              href={`https://dolz.io/market/asset/${DOLZ_NFT}/${item.floor.token_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.txLink}
                            >
                              {[item.floor.rarity, item.floor.tier ? `/${item.floor.tier}` : null, item.floor.serial != null ? `#${item.floor.serial}` : null]
                                .filter(Boolean)
                                .join(" ") || `#${item.floor.token_id}`}
                            </a>
                          ) : (
                            <span className={styles.mutedText}>nie je na predaj</span>
                          )}
                          {item.floor && item.floor.listings > 1 ? <small className={styles.mutedText}> · {item.floor.listings} ponúk</small> : null}
                        </td>
                        <td className={styles.num}>{formatUsd(item.floor?.price_usd)}</td>
                        <td>
                          <span className={styles.sellActions}>
                            {item.floor ? (
                              <button type="button" className={styles.primaryButton} disabled={!!busy} onClick={() => void buy(item)}>
                                {busy === item.card ? "Kupujem…" : "Kúpiť"}
                              </button>
                            ) : null}
                            <button type="button" className={styles.refreshButton} disabled={!!busy} onClick={() => void addRule(item)}>
                              {busy === `rule-${item.card}` ? "…" : "+ Pravidlo"}
                            </button>
                          </span>
                        </td>
                      </tr>
                    )),
                  ])
                )}
              </tbody>
            </table>
          </div>
        )}
        {notice ? (
          <div className={`${styles.toast} ${notice.ok ? styles.toastOk : styles.toastBad}`} role="status">
            <span>{notice.text}</span>
            <button type="button" className={styles.iconButton} onClick={() => setNotice(null)} aria-label="Zavrieť">
              ✕
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
