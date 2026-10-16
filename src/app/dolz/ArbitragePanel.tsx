"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzArbitrage, DolzArbitrageListing, DolzSellResult } from "@/app/lib/dolzSniper";

const DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc";
const RARITIES = ["Limited", "Rare", "Epic", "Legendary"] as const;
const TOPS = [20, 50, 100];

function formatUsd(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`;
}

function serialLabel(listing: DolzArbitrageListing): string {
  return listing.serial != null ? `#${listing.serial}${listing.tier ? `/${listing.tier}` : ""}` : `#${listing.token_id}`;
}

/**
 * Arbitrage: per card number, the cheapest live listing of one rarity against the second cheapest, biggest gap
 * (in %) first. The cheapest one can be bought straight from the hot wallet (same path as Kúpiť elsewhere).
 */
export default function ArbitragePanel({ token }: { token: string }) {
  const [rarity, setRarity] = useState<string>("Limited");
  const [top, setTop] = useState(20);
  const [data, setData] = useState<DolzArbitrage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bought, setBought] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/dolz/sniper?token=${encodeURIComponent(token)}&view=arbitrage&rarity=${rarity.toLowerCase()}&top=${top}`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as { ok: boolean; arbitrage?: DolzArbitrage; error?: string };
      if (!response.ok || !json.ok || !json.arbitrage) throw new Error(json.error || `HTTP ${response.status}`);
      setData(json.arbitrage);
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Arbitráž sa nepodarilo načítať." });
    } finally {
      setLoading(false);
    }
  }, [token, rarity, top]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const buy = async (row: DolzArbitrage["rows"][number]) => {
    const item = row.cheapest;
    if (!window.confirm(`Kúpiť ${row.card} ${row.name ?? ""} ${row.rarity ?? ""} ${serialLabel(item)} za ${formatUsd(item.price_usd)} z hot walletu?`)) return;
    setBusy(item.token_id);
    setNotice(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=buy`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        // The exact listed price (USDC has 6 decimals); the sniper buys only at this price.
        body: JSON.stringify({ link: item.token_id, price_raw: String(Math.round(item.price_usd * 1e6)) }),
      });
      const json = (await response.json()) as { ok: boolean; results?: DolzSellResult[]; error?: string };
      const result = json.results?.[0];
      if (!response.ok || !json.ok || !result?.ok) throw new Error(result?.error || json.error || `HTTP ${response.status}`);
      setBought((current) => [...current, item.token_id]);
      setNotice({ ok: true, text: `Kúpené: ${row.card} ${row.name ?? ""} ${serialLabel(item)} za ${formatUsd(item.price_usd)}.` });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Nákup zlyhal." });
    } finally {
      setBusy(null);
    }
  };

  const rows = data?.rows ?? [];

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Arbitráž</h2>
        <span className={styles.mutedText}>
          {data ? `${data.cards} čísel kariet s aspoň dvoma ponukami · ${new Date(data.updatedAt).toLocaleTimeString("sk-SK")}` : ""}
        </span>
      </div>
      <p className={styles.chartNote}>
        Pre každé číslo karty vybranej rarity: najlacnejšia živá ponuka oproti druhej najlacnejšej, zoradené podľa rozdielu v %. Pri vzácnych kartách
        s pár kópiami môže byť druhá ponuka prestrelená, rozhoduj aj podľa rozdielu v $ a počtu ponúk. Pri preklopení odrátaj poplatky marketu.
        Údaje sa prepočítajú najviac raz za 5 minút.
      </p>

      <div className={styles.sellBulk}>
        <div className={styles.segmented} role="group" aria-label="Rarita">
          {RARITIES.map((item) => (
            <button key={item} type="button" className={rarity === item ? styles.segmentActive : styles.segment} onClick={() => setRarity(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label="Počet">
          {TOPS.map((item) => (
            <button key={item} type="button" className={top === item ? styles.segmentActive : styles.segment} onClick={() => setTop(item)}>
              Top {item}
            </button>
          ))}
        </div>
        <button type="button" className={styles.refreshButton} disabled={loading} onClick={() => void load()}>
          {loading ? "Načítavam…" : "Obnoviť"}
        </button>
      </div>
      {notice ? <p className={notice.ok ? styles.goodText : styles.badText}>{notice.text}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.sellTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Karta</th>
              <th className={styles.num}>Ponúk</th>
              <th>Najlacnejšia</th>
              <th>Druhá</th>
              <th className={styles.num}>Rozdiel</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  {loading ? "Načítavam ponuky (prvé načítanie trvá asi 10 s)…" : "Žiadne číslo karty nemá aspoň dve živé ponuky tejto rarity."}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const done = bought.includes(row.cheapest.token_id);
                return (
                  <tr key={row.card}>
                    <td className={styles.mutedText}>{index + 1}</td>
                    <td>
                      {row.name ?? "—"}
                      <small className={styles.mutedText}> · {row.card}</small>
                    </td>
                    <td className={styles.num}>{row.listings}</td>
                    <td>
                      <a href={`https://dolz.io/market/asset/${DOLZ_NFT}/${row.cheapest.token_id}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                        {formatUsd(row.cheapest.price_usd)}
                      </a>
                      <small className={styles.mutedText}> {serialLabel(row.cheapest)}</small>
                    </td>
                    <td>
                      <a href={`https://dolz.io/market/asset/${DOLZ_NFT}/${row.second.token_id}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                        {formatUsd(row.second.price_usd)}
                      </a>
                      <small className={styles.mutedText}> {serialLabel(row.second)}</small>
                    </td>
                    <td className={styles.num}>
                      <strong className={styles.goodText}>{row.gap_pct != null ? `+${row.gap_pct.toFixed(1)} %` : "—"}</strong>
                      <small className={styles.mutedText}> {formatUsd(row.gap_usd)}</small>
                    </td>
                    <td>
                      <button type="button" className={styles.primaryButton} disabled={!!busy || done} onClick={() => void buy(row)}>
                        {done ? "Kúpené" : busy === row.cheapest.token_id ? "Kupujem…" : `Kúpiť ${formatUsd(row.cheapest.price_usd)}`}
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
  );
}
