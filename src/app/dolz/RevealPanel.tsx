"use client";

import { useCallback, useEffect, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import type { DolzRevealConfig, DolzRevealStatus } from "@/app/lib/dolzSniper";

type Draft = { card: string; rare: string; epic: string; legendary: string; hours: string; priority: string };

const toDraft = (config: DolzRevealConfig): Draft => ({
  card: config.card,
  rare: config.limits.rare != null ? String(config.limits.rare) : "",
  epic: config.limits.epic != null ? String(config.limits.epic) : "",
  legendary: config.limits.legendary != null ? String(config.limits.legendary) : "",
  hours: String(config.hours ?? 72),
  priority: String(config.priority_gwei ?? 300),
});

function remaining(seconds: number): string {
  if (seconds <= 0) return "skončilo";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Reveal watch: the sniper re-reads the listed, still unrevealed cards of one card number every second and
 * buys one that reveals as Rare/Epic/Legendary within its limit (within the daily budget).
 */
export default function RevealPanel({ token }: { token: string }) {
  const [reveal, setReveal] = useState<DolzRevealStatus | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&view=reveal`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; reveal?: DolzRevealStatus; error?: string };
      if (!response.ok || !json.ok || !json.reveal) throw new Error(json.error || `HTTP ${response.status}`);
      setReveal(json.reveal);
      setClock(Date.now());
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Odhalenie sa nepodarilo načítať." });
    }
  }, [token]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 10_000);
    const tick = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    if (dirty || !reveal?.config) return;
    const id = window.setTimeout(() => setDraft(toDraft(reveal.config)), 0);
    return () => window.clearTimeout(id);
  }, [reveal, dirty]);

  const edit = (key: keyof Draft) => (event: { target: { value: string } }) => {
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));
    setDirty(true);
  };

  const save = async (enabled: boolean) => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const limits: Record<string, number> = {};
      for (const rarity of ["rare", "epic", "legendary"] as const) {
        if (draft[rarity].trim() !== "") limits[rarity] = Number(draft[rarity]);
      }
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=reveal`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify({ enabled, card: draft.card, limits, hours: Number(draft.hours), priority_gwei: Number(draft.priority) }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setDirty(false);
      setMessage({ ok: true, text: enabled ? `Uložené, bot sleduje odhalenie ${draft.card}.` : "Sledovanie odhalenia je vypnuté." });
      void load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Uloženie zlyhalo." });
    } finally {
      setSaving(false);
    }
  };

  const nowSec = (clock || 0) / 1000;
  const until = reveal?.until ?? reveal?.config.until;
  const running = !!reveal?.active;
  const prices = reveal?.prices ?? [];

  return (
    <section className={styles.panelFull}>
      <div className={styles.panelTitleRow}>
        <h2>Odhalenie</h2>
        <span className={running ? styles.goodText : styles.mutedText}>
          ● {running ? `sleduje ${reveal?.config.card} · ešte ${until ? remaining(until - nowSec) : "—"}` : "vypnuté"}
        </span>
      </div>
      <p className={styles.chartNote}>
        Nové karty sú na markete najprv „Not revealed“. Bot každú sekundu číta údaje vystavených neodhalených kariet zadaného čísla priamo z DOLZ a kartu,
        ktorá sa odhalí ako Rare, Epic alebo Legendary, hneď kúpi, ak je jej cena v limite danej rarity. Raritu bez limitu nekupuje. Nákupy sa rátajú do
        denného rozpočtu snipera a prídu ti na Discord.
      </p>

      <div className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Karta</span>
          <strong>{reveal?.config.card ?? "—"}</strong>
          <small>{until ? `do ${new Date(until * 1000).toLocaleString("sk-SK")}` : ""}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Sledované ponuky</span>
          <strong>{running ? (reveal?.candidates ?? 0) : "—"}</strong>
          <small>{prices.length ? `od $${prices[0].toFixed(2)} do $${prices[prices.length - 1].toFixed(2)}` : "neodhalené, v limite"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Limity</span>
          <strong style={{ fontSize: "1rem" }}>
            {(["rare", "epic", "legendary"] as const)
              .filter((rarity) => reveal?.config.limits[rarity] != null)
              .map((rarity) => `${rarity[0].toUpperCase()}${rarity.slice(1)} $${reveal?.config.limits[rarity]}`)
              .join(" · ") || "—"}
          </strong>
          <small>priorita {reveal?.config.priority_gwei ?? "—"} gwei</small>
        </article>
      </div>

      {draft ? (
        <div className={styles.sellBulk}>
          <input className={styles.quickBuyInput} aria-label="Číslo karty" placeholder="karta, napr. g0208" value={draft.card} onChange={edit("card")} style={{ maxWidth: 150 }} />
          <label className={styles.moneyInput} title="Rare kúpi najviac za túto cenu; prázdne = Rare nekupovať">
            <span>Rare $</span>
            <input type="number" min="0" step="1" aria-label="Limit Rare v USD" value={draft.rare} onChange={edit("rare")} style={{ paddingLeft: 62 }} />
          </label>
          <label className={styles.moneyInput} title="Epic kúpi najviac za túto cenu; prázdne = Epic nekupovať">
            <span>Epic $</span>
            <input type="number" min="0" step="1" aria-label="Limit Epic v USD" value={draft.epic} onChange={edit("epic")} style={{ paddingLeft: 58 }} />
          </label>
          <label className={styles.moneyInput} title="Legendary kúpi najviac za túto cenu; prázdne = Legendary nekupovať">
            <span>Leg. $</span>
            <input type="number" min="0" step="1" aria-label="Limit Legendary v USD" value={draft.legendary} onChange={edit("legendary")} style={{ paddingLeft: 56 }} />
          </label>
          <label className={styles.moneyInput} title="Ako dlho sledovať od zapnutia">
            <span>hod.</span>
            <input type="number" min="1" max="336" step="1" aria-label="Trvanie v hodinách" value={draft.hours} onChange={edit("hours")} style={{ paddingLeft: 48 }} />
          </label>
          <label className={styles.moneyInput} title="Poplatok za prednosť pri nákupe">
            <span>gwei</span>
            <input type="number" min="30" max="3000" step="50" aria-label="Priority fee v gwei" value={draft.priority} onChange={edit("priority")} style={{ paddingLeft: 48 }} />
          </label>
          <button type="button" className={styles.primaryButton} disabled={saving || !/^g\d{4}$/i.test(draft.card.trim())} onClick={() => void save(true)}>
            {saving ? "Ukladám…" : running && !dirty ? "Uložiť a spustiť znova" : "Spustiť sledovanie"}
          </button>
          {running ? (
            <button type="button" className={styles.refreshButton} disabled={saving} onClick={() => void save(false)}>
              Vypnúť
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <p className={message.ok ? styles.goodText : styles.badText}>{message.text}</p> : null}
    </section>
  );
}
