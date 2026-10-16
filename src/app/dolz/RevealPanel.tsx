"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./dolz.module.css";
import type { DolzRevealStatus } from "@/app/lib/dolzSniper";

/**
 * Reveal overview. The sniper reads a revealed card's rarity and serial from the dolz.io market itself and,
 * when a card number reveals, checks its listed cards against the normal sniper rules. Nothing to set here.
 */
export default function RevealPanel({ token }: { token: string }) {
  const [reveal, setReveal] = useState<DolzRevealStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=reveal`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; reveal?: DolzRevealStatus; error?: string };
      if (!response.ok || !json.ok || !json.reveal) throw new Error(json.error || `HTTP ${response.status}`);
      setReveal(json.reveal);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odhalenie sa nepodarilo načítať.");
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);

  const watching = Object.entries(reveal?.watching ?? {});
  const recent = reveal?.recent ?? [];

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Odhalenie</h2>
        <span className={watching.length ? styles.goodText : styles.mutedText}>
          ● {watching.length ? `sleduje ${watching.map(([card]) => card).join(", ")}` : "žiadne neodhalené karty"}
        </span>
      </div>
      <p className={styles.chartNote}>
        Nové karty sú najprv „Not revealed“. Bot každých {reveal?.poll_seconds ?? 5} s pýta DOLZ market na jednu neodhalenú kartu z každého čísla.
        Keď sa číslo odhalí, načíta raritu a skutočné poradové číslo všetkých jej kariet a vystavené karty hneď skontroluje podľa bežných pravidiel
        snipera (rovnaký denný rozpočet, nákupy prídu na Discord). Na nákup odhalených kariet teda stačí mať pravidlo v Nastaveniach.
      </p>

      <div className={styles.metricsGrid}>
        {watching.length ? (
          watching.map(([card, count]) => (
            <article key={card} className={styles.metricCard}>
              <span>Čaká na odhalenie</span>
              <strong>{card}</strong>
              <small>{count} známych kariet</small>
            </article>
          ))
        ) : (
          <article className={styles.metricCard}>
            <span>Čaká na odhalenie</span>
            <strong>—</strong>
            <small>všetky známe karty sú odhalené</small>
          </article>
        )}
      </div>

      <h3 className={styles.chartNote}>Posledné odhalenia</h3>
      {recent.length ? (
        <ul className={styles.chartNote}>
          {recent.map((item) => (
            <li key={`${item.card}-${item.at}`}>
              {new Date(item.at * 1000).toLocaleString("sk-SK")} · <strong>{item.card}</strong> ·{" "}
              {Object.entries(item.rarities)
                .map(([rarity, count]) => `${rarity} ${count}`)
                .join(", ") || "—"}{" "}
              · {item.listed} vystavených skontrolovaných
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.mutedText}>Od posledného spustenia bota sa nič neodhalilo.</p>
      )}
      {error ? <p className={styles.badText}>{error}</p> : null}
    </section>
  );
}
