"use client";

import { PointerEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dolz.module.css";
import type { DolzChannel, DolzEvent, DolzHolding, DolzReport } from "@/app/lib/dolzPortfolio";
import SniperTab from "./SniperTab";

type ApiResponse = { ok: boolean; data?: DolzReport; error?: string };

// The last report, shown right away on the next visit while a current one loads.
const REPORT_STORAGE_KEY = "dolz-report-v1";
type Unit = "usd" | "dolz";

// Categorical slots (dark steps) in fixed order; validated against the page surface.
const CHANNEL_COLORS: Record<DolzChannel, string> = {
  card: "#3987e5",
  "dolz-market": "#d95926",
  auction: "#199e70",
  opensea: "#c98500",
  mint: "#d55181",
  free: "#9085e9",
};
const DOLZ_CHANNEL_LABELS: Record<DolzChannel, string> = {
  "dolz-market": "DOLZ market",
  opensea: "OpenSea",
  mint: "Mint",
  card: "Karta (DOLZ app)",
  auction: "Aukcie / dropy",
  free: "Zadarmo / reward",
};

const CHANNEL_ORDER: DolzChannel[] = ["card", "dolz-market", "auction", "opensea", "mint", "free"];
const SERIES_A = "#3987e5";
const SERIES_B = "#d95926";

const VALUE_SOURCE_LABELS: Record<DolzHolding["valueSource"], string> = {
  "card-usdc": "predaje karty (USDC)",
  "card-dolz": "predaje karty (DOLZ éra)",
  "season-tier": "sezóna + tier",
  tier: "rovnaký tier",
  cost: "bez predajov – nákupná cena",
};

const EVENT_LABELS: Record<DolzEvent["type"], string> = {
  buy: "Nákup",
  sell: "Predaj",
  "auction-bid": "Aukcia – príhoz",
  "auction-refund": "Aukcia – vrátené",
  "transfer-in": "Prijaté",
  "transfer-out": "Odoslané",
};

function formatUsd(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatDolz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M DOLZ`;
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(1)}k DOLZ`;
  return `${sign}${Math.round(abs).toLocaleString("en-US")} DOLZ`;
}

function formatUnit(value: number | null | undefined, unit: Unit): string {
  return unit === "usd" ? formatUsd(value) : formatDolz(value);
}

function formatCompact(value: number, unit: Unit): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const prefix = unit === "usd" ? "$" : "";
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${prefix}${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${prefix}${Math.round(abs)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value));
}

function formatMonth(month: string): string {
  const [year, mon] = month.split("-");
  return `${mon}/${year.slice(2)}`;
}

function pnlClass(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || Math.abs(value) < 0.5) return undefined;
  return value > 0 ? styles.goodText : styles.badText;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + step * 1e-6; tick += step) ticks.push(Number(tick.toFixed(10)));
  return ticks;
}

// ---------------------------------------------------------------------------

type LineSeries = { key: string; label: string; color: string; values: number[] };

function LineChart({
  dates,
  series,
  unit,
  formatValue,
  title,
  note,
  formatTick,
}: {
  dates: string[];
  series: LineSeries[];
  unit: Unit;
  formatValue: (value: number) => string;
  title: string;
  note?: string;
  formatTick?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 30, left: 68 };

  const all = series.flatMap((line) => line.values);
  if (!dates.length || !all.length) return <div className={styles.emptyBox}>Žiadne dáta.</div>;

  const rawMin = Math.min(0, ...all);
  const rawMax = Math.max(0, ...all);
  const ticks = niceTicks(rawMin, rawMax);
  const min = Math.min(rawMin, ticks[0]);
  const max = Math.max(rawMax, ticks[ticks.length - 1]);
  const range = max - min || 1;
  const toX = (index: number) => pad.left + (index / Math.max(1, dates.length - 1)) * (width - pad.left - pad.right);
  const toY = (value: number) => pad.top + ((max - value) / range) * (height - pad.top - pad.bottom);

  const monthTicks = dates
    .map((date, index) => ({ date, index }))
    .filter(({ date }, i, list) => date.endsWith("-01") || i === 0 || i === list.length - 1)
    .filter((_, i, list) => list.length <= 8 || i % Math.ceil(list.length / 8) === 0);

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (x - pad.left) / (width - pad.left - pad.right)));
    setHover(Math.round(ratio * (dates.length - 1)));
  }

  const hoverX = hover === null ? 0 : toX(hover);
  const tooltipLeft = hover === null ? 0 : (hoverX / width) * 100;

  return (
    <div className={styles.chartBox}>
      <div className={styles.chartHeader}>
        <h3>{title}</h3>
        {series.length > 1 ? (
          <ul className={styles.legend}>
            {series.map((line) => (
              <li key={line.key}>
                <span className={styles.legendSwatch} style={{ background: line.color }} />
                {line.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className={styles.chartFrame}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.chartSvg}
          role="img"
          aria-label={title}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={toY(tick)} y2={toY(tick)} className={tick === 0 ? styles.zeroLine : styles.gridLine} />
              <text x={pad.left - 8} y={toY(tick) + 4} textAnchor="end" className={styles.axisText}>
                {formatTick ? formatTick(tick) : formatCompact(tick, unit)}
              </text>
            </g>
          ))}
          {monthTicks.map(({ date, index }) => (
            <text key={date} x={toX(index)} y={height - 8} textAnchor="middle" className={styles.axisText}>
              {formatMonth(date.slice(0, 7))}
            </text>
          ))}
          {series.map((line) => (
            <polyline
              key={line.key}
              points={line.values.map((value, index) => `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {series.map((line) => {
            const last = line.values.length - 1;
            return <circle key={`${line.key}-end`} cx={toX(last)} cy={toY(line.values[last])} r="4" fill={line.color} className={styles.markRing} />;
          })}
          {hover !== null ? (
            <g>
              <line x1={hoverX} x2={hoverX} y1={pad.top} y2={height - pad.bottom} className={styles.hoverLine} />
              {series.map((line) => (
                <circle key={`${line.key}-hover`} cx={hoverX} cy={toY(line.values[hover])} r="5" fill={line.color} className={styles.markRing} />
              ))}
            </g>
          ) : null}
          <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="transparent" />
        </svg>
        {hover !== null ? (
          <div className={styles.tooltip} style={{ left: `${tooltipLeft}%`, transform: `translateX(${tooltipLeft > 60 ? "-105%" : "5%"})` }}>
            <strong>{formatDate(dates[hover])}</strong>
            {series.map((line) => (
              <div key={line.key} className={styles.tooltipRow}>
                <span className={styles.legendSwatch} style={{ background: line.color }} />
                <span>{line.label}</span>
                <b>{formatValue(line.values[hover])}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {note ? <p className={styles.chartNote}>{note}</p> : null}
    </div>
  );
}

type BarStack = { key: string; label: string; color: string; values: number[] };

function StackedBars({
  labels,
  stacks,
  unit,
  title,
  note,
}: {
  labels: string[];
  stacks: BarStack[];
  unit: Unit;
  title: string;
  note?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 30, left: 68 };
  const visible = stacks.filter((stack) => stack.values.some((value) => value > 0));
  const totals = labels.map((_, index) => visible.reduce((acc, stack) => acc + Math.max(0, stack.values[index]), 0));
  if (!labels.length) return <div className={styles.emptyBox}>Žiadne dáta.</div>;

  const ticks = niceTicks(0, Math.max(...totals, 1));
  const max = Math.max(...totals, ticks[ticks.length - 1]);
  const plotWidth = width - pad.left - pad.right;
  const slot = plotWidth / labels.length;
  const barWidth = Math.min(40, slot * 0.7);
  const labelEvery = labels.length > 8 ? 2 : 1;
  const toY = (value: number) => pad.top + ((max - value) / max) * (height - pad.top - pad.bottom);

  return (
    <div className={styles.chartBox}>
      <div className={styles.chartHeader}>
        <h3>{title}</h3>
        <ul className={styles.legend}>
          {visible.map((stack) => (
            <li key={stack.key}>
              <span className={styles.legendSwatch} style={{ background: stack.color }} />
              {stack.label}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.chartFrame}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg} role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={toY(tick)} y2={toY(tick)} className={tick === 0 ? styles.zeroLine : styles.gridLine} />
              <text x={pad.left - 8} y={toY(tick) + 4} textAnchor="end" className={styles.axisText}>
                {formatCompact(tick, unit)}
              </text>
            </g>
          ))}
          {labels.map((label, index) => {
            const x = pad.left + slot * index + (slot - barWidth) / 2;
            let base = 0;
            const segments = visible
              .map((stack) => ({ stack, value: Math.max(0, stack.values[index]) }))
              .filter((segment) => segment.value > 0);
            return (
              <g key={label} onPointerEnter={() => setHover(index)} opacity={hover === null || hover === index ? 1 : 0.55}>
                <rect x={pad.left + slot * index} y={pad.top} width={slot} height={height - pad.top - pad.bottom} fill="transparent" />
                {segments.map((segment, segmentIndex) => {
                  const y0 = toY(base);
                  base += segment.value;
                  const y1 = toY(base);
                  const isTop = segmentIndex === segments.length - 1;
                  const h = Math.max(0, y0 - y1 - (isTop ? 0 : 2));
                  return (
                    <path
                      key={segment.stack.key}
                      d={isTop && h > 4
                        ? `M${x},${y0} V${y1 + 4} Q${x},${y1} ${x + 4},${y1} H${x + barWidth - 4} Q${x + barWidth},${y1} ${x + barWidth},${y1 + 4} V${y0} Z`
                        : `M${x},${y0} V${y0 - h} H${x + barWidth} V${y0} Z`}
                      fill={segment.stack.color}
                    />
                  );
                })}
                {(labels.length - 1 - index) % labelEvery === 0 ? (
                  <text x={pad.left + slot * index + slot / 2} y={height - 8} textAnchor="middle" className={styles.axisText}>
                    {formatMonth(label)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <div
            className={styles.tooltip}
            style={{ left: `${((pad.left + slot * (hover + 0.5)) / width) * 100}%`, transform: `translateX(${hover > labels.length / 2 ? "-105%" : "5%"})` }}
          >
            <strong>{formatMonth(labels[hover])} · spolu {formatUnit(totals[hover], unit)}</strong>
            {visible
              .filter((stack) => stack.values[hover] > 0)
              .map((stack) => (
                <div key={stack.key} className={styles.tooltipRow}>
                  <span className={styles.legendSwatch} style={{ background: stack.color }} />
                  <span>{stack.label}</span>
                  <b>{formatUnit(stack.values[hover], unit)}</b>
                </div>
              ))}
          </div>
        ) : null}
      </div>
      {note ? <p className={styles.chartNote}>{note}</p> : null}
    </div>
  );
}

function MetricCard({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong className={className}>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

// ---------------------------------------------------------------------------

export default function DolzDashboard({ token }: { token: string }) {
  const [data, setData] = useState<DolzReport | null>(null);
  const [tab, setTab] = useState<"portfolio" | "sniper">("portfolio");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState<Unit>("usd");
  const [activityFilter, setActivityFilter] = useState<"all" | "buy" | "sell" | "other">("all");

  const loadData = useCallback(async () => {
    if (!token) {
      setError("Chýba token v URL (?token=…).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dolz/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok || !json.data) throw new Error(json.error || `HTTP ${response.status}`);
      setData(json.data);
      try {
        window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(json.data));
      } catch {
        // Storage full or blocked: the page just loads from the server next time.
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nepodarilo sa načítať dáta.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Defer so the loading state is not set synchronously inside the effect.
    const id = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(REPORT_STORAGE_KEY);
        if (stored) setData((current) => current ?? (JSON.parse(stored) as DolzReport));
      } catch {
        // Unreadable copy: wait for the server.
      }
      void loadData();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadData]);

  const totals = data?.totals;
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const dates = useMemo(() => daily.map((point) => point.date), [daily]);
  const isUsd = unit === "usd";

  const flowSeries: LineSeries[] = useMemo(
    () => [
      { key: "invested", label: "Investované", color: SERIES_A, values: daily.map((p) => (isUsd ? p.investedUsd : p.investedDolz)) },
      { key: "proceeds", label: "Získané z predajov", color: SERIES_B, values: daily.map((p) => (isUsd ? p.proceedsUsd : p.proceedsDolz)) },
    ],
    [daily, isUsd],
  );

  const pnlSeries: LineSeries[] = useMemo(
    () => [
      {
        key: "pnl-mark",
        label: isUsd ? "PnL pri odhade držby" : "PnL pri nákladovej hodnote",
        color: SERIES_A,
        values: daily.map((p) => (isUsd ? p.proceedsUsd - p.investedUsd + p.markUsd : p.proceedsDolz - p.investedDolz + p.bookDolz)),
      },
      { key: "realized", label: "Realizovaný PnL", color: SERIES_B, values: daily.map((p) => (isUsd ? p.realizedUsd : p.realizedDolz)) },
    ],
    [daily, isUsd],
  );

  const valueSeries: LineSeries[] = useMemo(
    () => [
      { key: "book", label: "Nákladová hodnota", color: SERIES_A, values: daily.map((p) => p.bookUsd) },
      { key: "mark", label: "Odhad trhovej hodnoty", color: SERIES_B, values: daily.map((p) => p.markUsd) },
    ],
    [daily],
  );

  const holdingsSeries: LineSeries[] = useMemo(
    () => [{ key: "holdings", label: "Kusov v držbe", color: SERIES_A, values: daily.map((p) => p.holdings) }],
    [daily],
  );

  const priceSeries: LineSeries[] = useMemo(
    () => [{ key: "price", label: "DOLZ / USD", color: SERIES_A, values: daily.map((p) => p.dolzPrice ?? 0) }],
    [daily],
  );

  const monthly = useMemo(() => data?.monthly ?? [], [data]);
  const spendStacks: BarStack[] = useMemo(
    () =>
      CHANNEL_ORDER.filter((channel) => channel !== "free").map((channel) => ({
        key: channel,
        label: DOLZ_CHANNEL_LABELS[channel],
        color: CHANNEL_COLORS[channel],
        values: monthly.map((month) => (isUsd ? month.spendUsd[channel] : month.spendDolz[channel])),
      })),
    [monthly, isUsd],
  );

  // One row per card and rarity tier: that is the level the market prices at.
  const positions = useMemo(() => {
    type Position = {
      key: string;
      name: string;
      card: string | null;
      tier: string | null;
      rarity: string | null;
      serials: string[];
      count: number;
      costUsd: number;
      costDolz: number;
      valueUsd: number;
      source: DolzHolding["valueSource"];
      sales: number;
    };
    const groups = new Map<string, Position>();
    for (const holding of data?.holdings ?? []) {
      const name = holding.name?.trim() || `${holding.collection} #${holding.id}`;
      const key = `${name}|${holding.tier ?? ""}`;
      const entry = groups.get(key) ?? {
        key,
        name,
        card: holding.card,
        tier: holding.tier,
        rarity: holding.rarity && holding.rarity !== "Not revealed" ? holding.rarity : null,
        serials: [],
        count: 0,
        costUsd: 0,
        costDolz: 0,
        valueUsd: 0,
        source: holding.valueSource,
        sales: holding.valueSales,
      };
      entry.count += 1;
      entry.costUsd += holding.costUsd;
      entry.costDolz += holding.costDolz;
      entry.valueUsd += holding.valueUsd;
      if (holding.serial) entry.serials.push(holding.serial);
      groups.set(key, entry);
    }
    return [...groups.values()].sort((a, b) => b.valueUsd - a.valueUsd);
  }, [data]);

  const sales = useMemo(() => (data?.events ?? []).filter((event) => event.type === "sell"), [data]);
  const activity = useMemo(() => {
    const events = data?.events ?? [];
    const filtered = events.filter((event) => {
      if (activityFilter === "all") return true;
      if (activityFilter === "buy") return event.type === "buy";
      if (activityFilter === "sell") return event.type === "sell";
      return event.type !== "buy" && event.type !== "sell";
    });
    return filtered.slice(0, 80);
  }, [data, activityFilter]);

  const valueOf = (usd: number, dolz: number) => (isUsd ? formatUsd(usd) : formatDolz(dolz));
  const fmt = (value: number) => formatUnit(value, unit);

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>matotam.io private monitor</p>
          <h1 className={styles.title}>
            DOLZ <span>NFT PORTFÓLIO</span>
          </h1>
          <p className={styles.subtitle}>
            Investované, predaje a PnL z on-chain histórie na Polygone — minty, DOLZ market, kartové nákupy, aukcie a OpenSea.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.segmented} role="group" aria-label="Mena">
            <button className={isUsd ? styles.segmentActive : styles.segment} onClick={() => setUnit("usd")}>USD</button>
            <button className={!isUsd ? styles.segmentActive : styles.segment} onClick={() => setUnit("dolz")}>DOLZ</button>
          </div>
          <button className={styles.refreshButton} onClick={() => void loadData()} disabled={loading}>
            {loading ? (data ? "Aktualizujem…" : "Načítavam…") : "Obnoviť"}
          </button>
          <p className={styles.updatedText}>
            Stav: {data ? new Date(data.generatedAt).toLocaleString("sk-SK") : "—"} · DOLZ {data?.dolzPriceNow ? `$${data.dolzPriceNow.toFixed(5)}` : "—"}
          </p>
        </div>
      </header>

      <nav className={styles.tabBar} role="tablist" aria-label="Sekcie">
        <button type="button" role="tab" aria-selected={tab === "portfolio"} className={tab === "portfolio" ? styles.tabActive : styles.tab} onClick={() => setTab("portfolio")}>
          Portfólio
        </button>
        <button type="button" role="tab" aria-selected={tab === "sniper"} className={tab === "sniper" ? styles.tabActive : styles.tab} onClick={() => setTab("sniper")}>
          Sniper
        </button>
      </nav>

      {tab === "sniper" ? <SniperTab token={token} /> : null}

      {tab === "portfolio" && error ? <section className={styles.errorBox}>{error}</section> : null}
      {tab === "portfolio" && !data && loading ? <section className={styles.loadingBox}>Sťahujem históriu z Polygonu… prvé načítanie môže trvať aj minútu.</section> : null}

      {tab === "portfolio" && totals ? (
        <>
          <section className={styles.metricsGrid}>
            <MetricCard label="Investované" value={valueOf(totals.investedUsd, totals.investedDolz)} detail={isUsd ? formatDolz(totals.investedDolz) : formatUsd(totals.investedUsd)} />
            <MetricCard label="Získané z predajov" value={valueOf(totals.proceedsUsd, totals.proceedsDolz)} detail={`${totals.sold} predaných NFT`} />
            <MetricCard
              label="Čistý cash flow"
              value={valueOf(totals.netCashUsd, totals.netCashDolz)}
              detail="predaje − investície"
              className={pnlClass(totals.netCashUsd)}
            />
            <MetricCard
              label="Realizovaný PnL"
              value={valueOf(totals.realizedUsd, totals.realizedDolz)}
              detail="predaje vs. ich nákupná cena"
              className={pnlClass(totals.realizedUsd)}
            />
            <MetricCard label="NFT v držbe" value={String(totals.holdings)} detail={`${totals.acquired} získaných celkovo`} />
            <MetricCard label="Držba v nákupných cenách" value={valueOf(totals.bookUsd, totals.bookDolz)} detail={isUsd ? formatDolz(totals.bookDolz) : formatUsd(totals.bookUsd)} />
            <MetricCard
              label="Odhad hodnoty držby"
              value={formatUsd(totals.markUsd)}
              detail={`${totals.valuationSources["card-usdc"] + totals.valuationSources["card-dolz"]} z ${totals.holdings} kariet podľa reálnych predajov`}
            />
            <MetricCard
              label="Celkový PnL (odhad)"
              value={formatUsd(totals.pnlAtMarkUsd)}
              detail={totals.breakEvenPerNftUsd !== null ? `break-even ${formatUsd(totals.breakEvenPerNftUsd)} / NFT` : undefined}
              className={pnlClass(totals.pnlAtMarkUsd)}
            />
          </section>

          <section className={styles.chartGrid}>
            <LineChart
              title="Investované vs. predaje (kumulatívne)"
              dates={dates}
              series={flowSeries}
              unit={unit}
              formatValue={fmt}
            />
            <LineChart
              title="PnL v čase"
              dates={dates}
              series={pnlSeries}
              unit={unit}
              formatValue={fmt}
              note={isUsd
                ? "PnL pri odhade = predaje − investície + odhad hodnoty držby. Do 22. 9. sa karty hýbu s kurzom DOLZ, od prechodu marketu na USDC (23. 9.) podľa mediánu predajov rovnakej karty a rarity na DOLZ markete."
                : "V DOLZ: predaje − investície + držba v nákupných cenách. Realizovaný = predaje mínus ich nákupná cena."}
            />
            <LineChart title="Počet NFT v držbe" dates={dates} series={holdingsSeries} unit="dolz" formatValue={(value) => `${Math.round(value)} ks`} />
            <StackedBars
              title="Mesačné investície podľa kanála"
              labels={monthly.map((month) => month.month)}
              stacks={spendStacks}
              unit={unit}
              note="Aukcie = príhozy mínus vrátené sumy. Karta = platby kartou v DOLZ appke (USDT)."
            />
            <LineChart
              title="Hodnota držby (USD)"
              dates={dates}
              series={valueSeries}
              unit="usd"
              formatValue={(value) => formatUsd(value)}
              note="Nákladová hodnota = koľko si za držané NFT zaplatil. Trhová hodnota od 23. 9. = medián predajov rovnakej karty v rovnakom rarity tieri na DOLZ markete; predtým nákupná cena v DOLZ × kurz DOLZ."
            />
            <LineChart
              title="Kurz DOLZ"
              dates={dates}
              series={priceSeries}
              unit="usd"
              formatValue={(value) => `$${value.toFixed(5)}`}
              formatTick={(value) => `$${value.toFixed(3)}`}
              note="Medián swapov v Uniswap pooli DOLZ/USDT0 na Polygone."
            />
          </section>

          <section className={styles.panelFull}>
            <div className={styles.panelTitleRow}>
              <h2>Podľa kanála</h2>
              <span>{isUsd ? "USD v čase transakcie" : "DOLZ (kartové a USDC/WETH platby prepočítané kurzom)"}</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Kanál</th>
                    <th className={styles.num}>Získané ks</th>
                    <th className={styles.num}>Investované</th>
                    <th className={styles.num}>Ø / ks</th>
                    <th className={styles.num}>Predané ks</th>
                    <th className={styles.num}>Z predajov</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.channels ?? []).map((channel) => (
                    <tr key={channel.channel}>
                      <td>
                        <span className={styles.legendSwatch} style={{ background: CHANNEL_COLORS[channel.channel] }} /> {DOLZ_CHANNEL_LABELS[channel.channel]}
                      </td>
                      <td className={styles.num}>{channel.bought}</td>
                      <td className={styles.num}>{valueOf(channel.spentUsd, channel.spentDolz)}</td>
                      <td className={styles.num}>
                        {channel.bought ? valueOf(channel.spentUsd / channel.bought, channel.spentDolz / channel.bought) : "—"}
                      </td>
                      <td className={styles.num}>{channel.sold || "—"}</td>
                      <td className={styles.num}>{channel.sold ? valueOf(channel.proceedsUsd, channel.proceedsDolz) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totals.unallocatedAuctionUsd > 0.5 ? (
              <p className={styles.chartNote}>
                {formatUsd(totals.unallocatedAuctionUsd)} ({formatDolz(totals.unallocatedAuctionDolz)}) z aukcií nemá priradené žiadne získané NFT — počíta sa ako realizovaná strata.
              </p>
            ) : null}
          </section>

          <div className={styles.panelFull}>
            <div className={styles.panelTitleRow}>
              <h2>Predaje</h2>
              <span>{sales.length} transakcií</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Dátum</th>
                    <th>NFT</th>
                    <th>Kanál</th>
                    <th className={styles.num}>Predaj</th>
                    <th className={styles.num}>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr><td colSpan={5} className={styles.emptyCell}>Zatiaľ žiadne predaje.</td></tr>
                  ) : sales.map((event) => (
                    <tr key={event.hash}>
                      <td>{formatDate(event.ts)}</td>
                      <td>{event.tokens.map((token) => token.name?.trim() || `#${token.id}`).join(", ")}</td>
                      <td>{DOLZ_CHANNEL_LABELS[event.channel]}</td>
                      <td className={styles.num}>{valueOf(event.usd, event.dolz)}</td>
                      <td className={`${styles.num} ${pnlClass(isUsd ? event.realizedUsd : event.realizedDolz) ?? ""}`}>
                        {valueOf(event.realizedUsd ?? 0, event.realizedDolz ?? 0)}
                        {event.unknownBasis ? <small className={styles.mutedText} title="Nákup tohto NFT chýba v indexovanej histórii, nákupná cena braná ako 0."> *</small> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sales.some((event) => event.unknownBasis) ? (
              <p className={styles.chartNote}>* nákup tohto NFT chýba v histórii Blockscoutu, PnL ráta s nákupnou cenou 0.</p>
            ) : null}
          </div>


          <section className={styles.panelFull}>
            <div className={styles.panelTitleRow}>
              <h2>Pozície a trhová hodnota</h2>
              <span>
                {positions.length} kariet · {data?.totals.marketSalesSinceSwitch ?? 0} predajov na DOLZ markete od 23. 9.
                {data?.totals.marketLatestSale ? ` · posledný ${formatDate(data.totals.marketLatestSale)}` : ""}
              </span>
            </div>
            <div className={`${styles.tableWrap} ${styles.scrollBox}`}>
              <table>
                <thead>
                  <tr>
                    <th>Karta</th>
                    <th>Rarita</th>
                    <th className={styles.num}>Ks</th>
                    <th className={styles.num}>Nákupná cena</th>
                    <th className={styles.num}>Trhová hodnota</th>
                    <th className={styles.num}>Rozdiel</th>
                    <th>Ocenenie podľa</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.key}>
                      <td>
                        {position.name}
                        {position.card ? <small className={styles.mutedText}> · {position.card}</small> : null}
                      </td>
                      <td>
                        {[position.rarity, position.tier ? `/${position.tier}` : null].filter(Boolean).join(" ") || "—"}
                        {position.serials.length ? (
                          <small className={styles.mutedText}> · #{position.serials.slice(0, 4).join(", #")}{position.serials.length > 4 ? "…" : ""}</small>
                        ) : null}
                      </td>
                      <td className={styles.num}>{position.count}</td>
                      <td className={styles.num}>{formatUsd(position.costUsd)}</td>
                      <td className={styles.num}>{formatUsd(position.valueUsd)}</td>
                      <td className={`${styles.num} ${pnlClass(position.valueUsd - position.costUsd) ?? ""}`}>{formatUsd(position.valueUsd - position.costUsd)}</td>
                      <td className={styles.mutedText}>
                        {VALUE_SOURCE_LABELS[position.source]}
                        {position.sales ? ` (${position.sales})` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.chartNote}>
              Trhová hodnota = medián reálnych predajov rovnakej karty v rovnakom rarity tieri (číslo za lomkou je počet kusov v tieri). V zátvorke je počet predajov, z ktorých je medián.
              Sériové číslo v rámci tieru (napr. #1) môže cenu zvýšiť, s tým odhad nepočíta.
            </p>
          </section>

          <section className={styles.panelFull}>
            <div className={styles.panelTitleRow}>
              <h2>Aktivita</h2>
              <div className={styles.segmented} role="group" aria-label="Filter aktivity">
                {(["all", "buy", "sell", "other"] as const).map((filter) => (
                  <button key={filter} className={activityFilter === filter ? styles.segmentActive : styles.segment} onClick={() => setActivityFilter(filter)}>
                    {{ all: "Všetko", buy: "Nákupy", sell: "Predaje", other: "Ostatné" }[filter]}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Dátum</th>
                    <th>Typ</th>
                    <th>Kanál</th>
                    <th>NFT</th>
                    <th>Platba</th>
                    <th className={styles.num}>Suma</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((event, index) => (
                    <tr key={`${event.hash}-${event.type}-${index}`}>
                      <td>{formatDate(event.ts)}</td>
                      <td>{EVENT_LABELS[event.type]}</td>
                      <td>{DOLZ_CHANNEL_LABELS[event.channel]}</td>
                      <td>{event.tokens.length ? event.tokens.map((token) => token.name?.trim() || `#${token.id}`).join(", ") : "—"}</td>
                      <td>{event.paidWith ?? "—"}</td>
                      <td className={styles.num}>{event.usd || event.dolz ? valueOf(event.usd, event.dolz) : "—"}</td>
                      <td>
                        <a href={`https://polygonscan.com/tx/${event.hash}`} target="_blank" rel="noreferrer" className={styles.txLink}>
                          {event.hash.slice(0, 8)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className={styles.footerNote}>
            Wallety: {data?.wallets.map((wallet) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`).join(", ")}. Zdroj: Blockscout (Polygon). Presuny medzi vlastnými walletmi sa ignorujú;
            NFT od DOLZ bez platby (rewardy, airdropy) majú nákupnú cenu 0. Ceny v USD podľa kurzu v deň transakcie.
          </p>
        </>
      ) : null}
    </main>
  );
}
