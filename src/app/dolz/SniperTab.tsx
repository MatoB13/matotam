"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionHeaders } from "./actionPassword";
import styles from "./dolz.module.css";
import OfferPanel from "./OfferPanel";
import QuickBuy from "./QuickBuy";
import SellPanel from "./SellPanel";
import { DOLZ_CARD_CATALOG } from "@/app/lib/dolzCardCatalog";
import type { DolzSniperCatalogCard, DolzSniperConfig, DolzSniperRule, DolzSniperStatus } from "@/app/lib/dolzSniper";

const RARITIES = ["Limited", "Rare", "Epic", "Legendary"] as const;
const MAX_RULES = 20;

// Seasons as cards carry them; numbered seasons first, then the special series.
const SEASONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "OG", "Special Edition", "Off-Season"];

/** Known seasons plus any new one the sniper has seen on cards, numbered ones first. */
function seasonOptions(catalog: CatalogCard[]): string[] {
  const seasons = new Set(SEASONS);
  for (const item of catalog) if (item.season) seasons.add(item.season);
  return [...seasons].sort((a, b) => {
    const [na, nb] = [Number(a), Number(b)];
    if (Number.isInteger(na) && Number.isInteger(nb)) return na - nb;
    if (Number.isInteger(na) !== Number.isInteger(nb)) return Number.isInteger(na) ? -1 : 1;
    return SEASONS.indexOf(a) - SEASONS.indexOf(b) || a.localeCompare(b);
  });
}

const RARITY_LABELS: Record<string, string> = {
  "": "Akákoľvek rarita",
  Limited: "Limited a vyššie (všetky)",
  Rare: "Rare, Epic, Legendary",
  Epic: "Epic, Legendary",
  Legendary: "Legendary",
};

const STATUS_LABELS: Record<string, string> = {
  bought: "kúpené",
  pending: "odosiela sa",
  unconfirmed: "nepotvrdené",
  failed: "zlyhalo",
  missed: "niekto bol rýchlejší",
  error: "chyba",
  skipped_budget: "denný limit",
  skipped_balance: "málo USDC",
  dry_run: "dry run",
};

type ApiResponse = { ok: boolean; sniper?: DolzSniperStatus | null; deployed?: boolean; reachable?: boolean; error?: string; updatedAt?: string };

/** Form state: numbers stay as strings while the user types. */
type RuleDraft = { id: number; enabled: boolean; card: string; min_rarity: string; season: string; max_price: string; max_serial: string };
type ConfigDraft = { enabled: boolean; dry_run: boolean; daily_budget_usd: string; max_buys_per_day: string; rules: RuleDraft[] };

let nextRuleId = 1;

type SniperView = "settings" | "purchases" | "sell";
const VIEWS: { id: SniperView; label: string }[] = [
  { id: "settings", label: "Nastavenia" },
  { id: "purchases", label: "Nákupy a pokusy" },
  { id: "sell", label: "Predaj" },
];

type CatalogCard = { card: string; name: string; season: string | null; tiers: string[] };

/** Built-in catalog plus every card the sniper has seen on the market (newer cards included). */
function mergeCatalog(seen: DolzSniperCatalogCard[] | undefined): CatalogCard[] {
  const cards = new Map<string, CatalogCard>(
    DOLZ_CARD_CATALOG.map((item) => [item.card, { card: item.card, name: item.name.trim(), season: item.season, tiers: Object.keys(item.tiers) }]),
  );
  for (const item of seen ?? []) {
    const card = item.card?.toLowerCase();
    if (card && item.name && !cards.has(card)) cards.set(card, { card, name: item.name.trim(), season: item.season, tiers: [] });
  }
  return [...cards.values()].sort((a, b) => a.card.localeCompare(b.card));
}

function catalogLabel(card: string, catalog: CatalogCard[], fallbackName?: string | null): string {
  const entry = catalog.find((item) => item.card === card.toLowerCase());
  const name = entry?.name ?? fallbackName?.trim();
  return name ? `${card.toLowerCase()} · ${name}` : card;
}

function toDraft(config: DolzSniperConfig, catalog: CatalogCard[]): ConfigDraft {
  return {
    enabled: config.enabled,
    dry_run: config.dry_run,
    daily_budget_usd: String(config.daily_budget_usd),
    max_buys_per_day: String(config.max_buys_per_day),
    rules: config.rules.map((rule) => ({
      id: nextRuleId++,
      enabled: rule.enabled !== false,
      card: rule.card ? catalogLabel(rule.card, catalog, rule.card_name) : "",
      min_rarity: rule.min_rarity ?? "",
      season: rule.season ?? "",
      max_price: String(rule.max_price),
      max_serial: rule.max_serial ? String(rule.max_serial) : "",
    })),
  };
}

/** "g0177 · Lea PAM - …" or "g0177" -> "g0177"; empty -> any card. */
function cardFromInput(value: string, catalog: CatalogCard[]): { card: string | null; card_name: string | null } {
  const match = value.trim().toLowerCase().match(/^g\d{3,5}/);
  if (!match) return { card: null, card_name: null };
  const entry = catalog.find((item) => item.card === match[0]);
  return { card: match[0], card_name: entry?.name ?? null };
}

function fromDraft(draft: ConfigDraft, catalog: CatalogCard[]) {
  return {
    enabled: draft.enabled,
    dry_run: draft.dry_run,
    daily_budget_usd: draft.daily_budget_usd,
    max_buys_per_day: draft.max_buys_per_day,
    rules: draft.rules.map((rule) => ({
      enabled: rule.enabled,
      ...cardFromInput(rule.card, catalog),
      min_rarity: rule.min_rarity || null,
      season: rule.season || null,
      max_price: rule.max_price,
      max_serial: rule.max_serial || null,
    })),
  };
}

function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function describe(rule: DolzSniperRule, catalog: CatalogCard[]): string {
  const card = rule.card ? catalogLabel(rule.card, catalog, rule.card_name) : "akákoľvek karta";
  const rarity = rule.min_rarity ? RARITY_LABELS[rule.min_rarity] : "akákoľvek rarita";
  const season = rule.season ? ` · ${/^\d+$/.test(rule.season) ? `Season ${rule.season}` : rule.season}` : "";
  return `${card}${season} · ${rarity}${rule.max_serial ? ` · sériové č. ≤ ${rule.max_serial}` : ""} do ${formatUsd(rule.max_price)}`;
}

export default function SniperTab({ token }: { token: string }) {
  const [status, setStatus] = useState<DolzSniperStatus | null>(null);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanState, setScanState] = useState<"idle" | "sending" | "sent">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number>(0);
  const [availability, setAvailability] = useState<"loading" | "ok" | "not_deployed" | "unreachable">("loading");
  const [view, setView] = useState<SniperView>("settings");
  const catalog = useMemo(() => mergeCatalog(status?.catalog), [status]);
  const seasons = useMemo(() => seasonOptions(catalog), [catalog]);

  const load = useCallback(
    async (resetDraft: boolean) => {
      try {
        const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = (await response.json()) as ApiResponse;
        if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
        setStatus(json.sniper ?? null);
        setAvailability(json.sniper ? "ok" : json.deployed ? "unreachable" : "not_deployed");
        setCheckedAt(Date.now());
        if (json.sniper && resetDraft) setDraft(toDraft(json.sniper.config, mergeCatalog(json.sniper.catalog)));
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať snipera.");
      }
    },
    [token],
  );

  useEffect(() => {
    const first = window.setTimeout(() => void load(true), 0);
    // Keep status and purchases fresh without touching the form the user is editing.
    const id = window.setInterval(() => void load(false), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);

  const update = (patch: Partial<ConfigDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };
  const updateRule = (id: number, patch: Partial<RuleDraft>) => {
    setDraft((current) => (current ? { ...current, rules: current.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)) } : current));
    setDirty(true);
  };
  const addRule = () => {
    setDraft((current) =>
      current && current.rules.length < MAX_RULES
        ? { ...current, rules: [...current.rules, { id: nextRuleId++, enabled: true, card: "", min_rarity: "", season: "", max_price: "", max_serial: "" }] }
        : current,
    );
    setDirty(true);
  };
  const removeRule = (id: number) => {
    setDraft((current) => (current ? { ...current, rules: current.rules.filter((rule) => rule.id !== id) } : current));
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...actionHeaders() },
        body: JSON.stringify(fromDraft(draft, catalog)),
      });
      const json = (await response.json()) as ApiResponse & { config?: DolzSniperConfig };
      if (!response.ok || !json.ok || !json.config) throw new Error(json.error || `HTTP ${response.status}`);
      setDraft(toDraft(json.config, catalog));
      setDirty(false);
      setSavedAt(json.updatedAt ?? null);
      void load(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Uloženie zlyhalo.");
    } finally {
      setSaving(false);
    }
  };

  const rescan = async () => {
    setScanState("sending");
    setError(null);
    try {
      const response = await fetch(`/api/dolz/sniper?token=${encodeURIComponent(token)}&action=rescan`, { method: "POST" });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setScanState("sent");
      window.setTimeout(() => void load(false), 8_000);
    } catch (scanError) {
      setScanState("idle");
      setError(scanError instanceof Error ? scanError.message : "Prehľadanie trhu zlyhalo.");
    }
  };

  const lastBeat = status?.heartbeat ? new Date(status.heartbeat) : null;
  const alive = !!lastBeat && checkedAt - lastBeat.getTime() < 2 * 60_000;
  const applied = !!status?.configUpdatedAt && !!status?.configSeenAt && status.configSeenAt >= status.configUpdatedAt;
  const savedRules = useMemo(() => (status?.config.rules ?? []).filter((rule) => rule.enabled !== false), [status]);

  return (
    <div className={styles.sniperTab}>
      {error ? <section className={styles.errorBox}>{error}</section> : null}
      {availability === "not_deployed" ? (
        <section className={styles.loadingBox}>Sniper ešte nie je nasadený. Nastavenia sa dajú upravovať, keď bude bežať na Railway.</section>
      ) : null}
      {availability === "unreachable" ? (
        <section className={styles.errorBox}>Sniper neodpovedá. Skontroluj službu dolz-sniper na Railway; stránka to skúsi znova o 20 sekúnd.</section>
      ) : null}

      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Stav snipera</h2>
          <span>
            <span className={alive ? styles.goodText : styles.badText}>● {status?.heartbeat ? (alive ? "beží" : "nebeží") : "ešte nebežal"}</span>
            {lastBeat ? ` · naposledy ${lastBeat.toLocaleTimeString("sk-SK")}` : ""}
            {status?.wallet ? ` · hot wallet ${status.wallet}` : ""}
          </span>
        </div>
        <div className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span>Dnes minuté</span>
            <strong>{formatUsd(status?.spentTodayUsd ?? 0)}</strong>
            <small>z {formatUsd(status?.config.daily_budget_usd ?? 0, 0)} denného rozpočtu</small>
          </article>
          <article className={styles.metricCard}>
            <span>Dnes kúpené</span>
            <strong>{status?.boughtToday ?? 0}</strong>
            <small>max {status?.config.max_buys_per_day ?? 0} za deň</small>
          </article>
          <article className={styles.metricCard}>
            <span>Spolu kúpené</span>
            <strong>{status?.boughtTotal ?? 0}</strong>
            <small>{formatUsd(status?.spentTotalUsd ?? 0)}</small>
          </article>
          <article className={styles.metricCard}>
            <span>Na hot wallete</span>
            <strong>{status?.balances.usdc !== undefined ? formatUsd(status.balances.usdc) : "—"}</strong>
            <small>{status?.balances.pol !== undefined ? `${status.balances.pol.toFixed(2)} POL na gas` : "USDC a POL"}</small>
          </article>
        </div>
        {savedRules.length ? (
          <ul className={styles.ruleList}>
            {savedRules.map((rule, index) => (
              <li key={index}>{describe(rule, catalog)}</li>
            ))}
          </ul>
        ) : null}
        <div className={styles.formActions}>
          <p className={styles.chartNote}>
            Sniper kupuje nové ponuky hneď, ako sa objavia. Ponuky z poslednej hodiny prejde ešte raz pri štarte, po uložení nastavení a na toto tlačidlo.
          </p>
          <button type="button" className={styles.refreshButton} onClick={() => void rescan()} disabled={scanState === "sending" || availability !== "ok"}>
            {scanState === "sending" ? "Posielam…" : scanState === "sent" ? "Prehľadáva sa ✓" : "Prehľadať trh teraz"}
          </button>
        </div>
        <p className={styles.chartNote}>
          {status?.configUpdatedAt
            ? applied
              ? "Sniper používa aktuálne uložené nastavenia."
              : alive
                ? "Uložené nastavenia sniper načíta do pár sekúnd."
                : "Nastavenia sú uložené, sniper ich načíta po spustení."
            : "Nastavenia ešte neboli uložené, platia predvolené (akákoľvek karta do $9)."}
        </p>
      </section>

      <nav className={`${styles.tabBar} ${styles.subTabBar}`} role="tablist" aria-label="Sniper">
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
          </button>
        ))}
      </nav>

      {view !== "settings" ? null : draft ? (
        <section className={styles.panelFull}>
          <div className={styles.panelTitleRow}>
            <h2>Nastavenia</h2>
            <span>{savedAt ? `Uložené ${new Date(savedAt).toLocaleTimeString("sk-SK")}` : dirty ? "Neuložené zmeny" : ""}</span>
          </div>

          <div className={styles.settingsGrid}>
            <label className={styles.switchRow} htmlFor="sniper-enabled">
              <input id="sniper-enabled" type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
              <span>
                <strong>Sniper zapnutý</strong>
                <small>Vypnutý sniper nič nekupuje a ponuky z času vypnutia neskôr nedobieha.</small>
              </span>
            </label>
            <label className={styles.switchRow} htmlFor="sniper-dry-run">
              <input id="sniper-dry-run" type="checkbox" checked={draft.dry_run} onChange={(event) => update({ dry_run: event.target.checked })} />
              <span>
                <strong>Iba skúšobne (dry run)</strong>
                <small>Zhody sa zapíšu a pošle sa notifikácia, ale nič sa nekúpi.</small>
              </span>
            </label>
            <label className={styles.field} htmlFor="sniper-budget">
              <span>Denný rozpočet (USD)</span>
              <input id="sniper-budget" type="number" min="0" step="1" inputMode="decimal" value={draft.daily_budget_usd} onChange={(event) => update({ daily_budget_usd: event.target.value })} />
            </label>
            <label className={styles.field} htmlFor="sniper-max-buys">
              <span>Max. nákupov za deň</span>
              <input id="sniper-max-buys" type="number" min="0" step="1" inputMode="numeric" value={draft.max_buys_per_day} onChange={(event) => update({ max_buys_per_day: event.target.value })} />
            </label>
          </div>

          <h3 className={styles.subheading}>Pravidlá ({draft.rules.length}/{MAX_RULES})</h3>
          <p className={styles.chartNote}>
            Karta sa kúpi, keď spĺňa ktorékoľvek zapnuté pravidlo. Rarita je minimum: „Rare“ platí aj pre Epic a Legendary, „Epic“ aj pre Legendary.
            Prázdna karta znamená akúkoľvek kartu, sezóna obmedzí pravidlo na karty z jednej sezóny.
          </p>

          <datalist id="dolz-cards">
            {catalog.map((item) => (
              <option key={item.card} value={`${item.card} · ${item.name}`}>
                {`S${item.season ?? "?"}${item.tiers.length ? ` · tiery ${item.tiers.join(", ")}` : ""}`}
              </option>
            ))}
          </datalist>

          <div className={styles.ruleRows}>
            <div className={`${styles.ruleRow} ${styles.ruleHeader}`} aria-hidden="true">
              <span>Zap.</span>
              <span>Karta</span>
              <span>Min. rarita</span>
              <span>Sezóna</span>
              <span>Max. cena</span>
              <span>Max. sériové č.</span>
              <span />
            </div>
            {draft.rules.map((rule, index) => (
              <div key={rule.id} className={`${styles.ruleRow} ${rule.enabled ? "" : styles.ruleDisabled}`}>
                <input
                  id={`rule-${rule.id}-enabled`}
                  type="checkbox"
                  aria-label={`Pravidlo ${index + 1} zapnuté`}
                  checked={rule.enabled}
                  onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                />
                <input
                  id={`rule-${rule.id}-card`}
                  list="dolz-cards"
                  placeholder="Akákoľvek karta (alebo napíš g0177 / meno)"
                  aria-label={`Pravidlo ${index + 1} karta`}
                  value={rule.card}
                  onChange={(event) => updateRule(rule.id, { card: event.target.value })}
                />
                <select
                  id={`rule-${rule.id}-rarity`}
                  aria-label={`Pravidlo ${index + 1} minimálna rarita`}
                  value={rule.min_rarity}
                  onChange={(event) => updateRule(rule.id, { min_rarity: event.target.value })}
                >
                  <option value="">{RARITY_LABELS[""]}</option>
                  {RARITIES.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {RARITY_LABELS[rarity]}
                    </option>
                  ))}
                </select>
                <select
                  id={`rule-${rule.id}-season`}
                  aria-label={`Pravidlo ${index + 1} sezóna`}
                  value={rule.season}
                  onChange={(event) => updateRule(rule.id, { season: event.target.value })}
                >
                  <option value="">Akákoľvek sezóna</option>
                  {seasons.map((season) => (
                    <option key={season} value={season}>
                      {/^\d+$/.test(season) ? `Season ${season}` : season}
                    </option>
                  ))}
                </select>
                <label className={styles.moneyInput}>
                  <span>$</span>
                  <input
                    id={`rule-${rule.id}-price`}
                    type="number"
                    min="0.01"
                    max="200"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Pravidlo ${index + 1} maximálna cena v USD`}
                    value={rule.max_price}
                    onChange={(event) => updateRule(rule.id, { max_price: event.target.value })}
                  />
                </label>
                <input
                  id={`rule-${rule.id}-serial`}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="max. sériové č."
                  aria-label={`Pravidlo ${index + 1} maximálne sériové číslo`}
                  value={rule.max_serial}
                  onChange={(event) => updateRule(rule.id, { max_serial: event.target.value })}
                />
                <button type="button" className={styles.iconButton} onClick={() => removeRule(rule.id)} aria-label={`Odstrániť pravidlo ${index + 1}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.refreshButton} onClick={addRule} disabled={draft.rules.length >= MAX_RULES}>
              + Pridať pravidlo
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "Ukladám…" : "Uložiť nastavenia"}
            </button>
          </div>
        </section>
      ) : availability === "loading" && !error ? (
        <section className={styles.loadingBox}>Načítavam nastavenia snipera…</section>
      ) : null}

      {view === "sell" ? <SellPanel token={token} /> : null}

      {view === "purchases" ? <QuickBuy token={token} onBought={() => void load(false)} /> : null}
      {view === "purchases" ? <OfferPanel token={token} /> : null}

      {view === "purchases" ? (
      <section className={styles.panelFull}>
        <div className={styles.panelTitleRow}>
          <h2>Nákupy a pokusy</h2>
          <span>{status?.purchases.length ?? 0} posledných</span>
        </div>
        <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
          <table>
            <thead>
              <tr>
                <th>Čas</th>
                <th>Karta</th>
                <th>Rarita</th>
                <th className={styles.num}>Cena</th>
                <th>Pravidlo</th>
                <th>Výsledok</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {!status?.purchases.length ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>Zatiaľ žiadne zhody s pravidlami.</td>
                </tr>
              ) : (
                status.purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{new Date(purchase.created_at).toLocaleString("sk-SK")}</td>
                    <td>
                      {purchase.card_name?.trim() || `#${purchase.token_id}`}
                      {purchase.card_number ? <small className={styles.mutedText}> · {purchase.card_number}</small> : null}
                    </td>
                    <td>
                      {[purchase.rarity && purchase.rarity !== "Not revealed" ? purchase.rarity : null, purchase.tier ? `/${purchase.tier}` : null].filter(Boolean).join(" ") || "—"}
                      {purchase.serial != null ? <small className={styles.mutedText}> · #{purchase.serial}</small> : null}
                    </td>
                    <td className={styles.num}>{formatUsd(Number(purchase.price_usd))}</td>
                    <td>{purchase.rule_name ?? "—"}</td>
                    <td
                      className={purchase.status === "bought" ? styles.goodText : purchase.status === "failed" || purchase.status === "error" ? styles.badText : styles.mutedText}
                      title={purchase.error ?? undefined}
                    >
                      {STATUS_LABELS[purchase.status] ?? purchase.status}
                    </td>
                    <td>
                      {purchase.tx_hash ? (
                        <a href={`https://polygonscan.com/tx/${purchase.tx_hash}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                          {purchase.tx_hash.slice(0, 8)}…
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
    </div>
  );
}
