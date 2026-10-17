"use client";

import { useState } from "react";
import styles from "./dolz.module.css";
import type { DolzConfigChange } from "@/app/lib/dolzSniper";

const SETTING_LABELS: Record<string, string> = {
  enabled: "sniper zapnutý",
  dry_run: "dry run",
  daily_budget_usd: "denný rozpočet $",
  max_buys_per_day: "max nákupov za deň",
};

function formatValue(value: unknown): string {
  if (value === true) return "áno";
  if (value === false) return "nie";
  return value === null || value === undefined ? "—" : String(value);
}

/** When the sniper settings were saved and what changed each time (loaded on demand). */
export default function ConfigHistory({ token }: { token: string }) {
  const [history, setHistory] = useState<DolzConfigChange[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=config_history`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; history?: DolzConfigChange[]; error?: string };
      if (!response.ok || !json.ok || !json.history) throw new Error(json.error || `HTTP ${response.status}`);
      setHistory(json.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Históriu sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>História nastavení</h2>
        <button type="button" className={styles.refreshButton} disabled={loading} onClick={() => void load()}>
          {loading ? "Načítavam…" : history ? "Obnoviť" : "Zobraziť"}
        </button>
      </div>
      <p className={styles.chartNote}>Každé uloženie nastavení snipera (čas podľa slovenského času) a čo sa v ňom zmenilo oproti predchádzajúcemu.</p>
      {error ? <p className={styles.badText}>{error}</p> : null}
      {history ? (
        history.length ? (
          <ul className={styles.chartNote}>
            {history.map((item) => (
              <li key={item.at} style={{ marginBottom: 8 }}>
                <strong>{new Date(item.at).toLocaleString("sk-SK")}</strong>
                <small className={styles.mutedText}>
                  {" "}
                  · {item.first ? "prvé známe nastavenia" : item.source} · {item.rules} pravidiel
                </small>
                {item.added.map((name) => (
                  <div key={`a-${name}`} className={styles.goodText}>
                    + {name}
                  </div>
                ))}
                {item.removed.map((name) => (
                  <div key={`r-${name}`} className={styles.badText}>
                    − {name}
                  </div>
                ))}
                {!item.first
                  ? Object.entries(item.settings).map(([key, value]) => {
                      const [before, after] = Array.isArray(value) ? value : [undefined, value];
                      return (
                        <div key={`s-${key}`} className={styles.mutedText}>
                          {SETTING_LABELS[key] ?? key}: {formatValue(before)} → {formatValue(after)}
                        </div>
                      );
                    })
                  : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.mutedText}>Žiadne uložené nastavenia.</p>
        )
      ) : null}
    </section>
  );
}
