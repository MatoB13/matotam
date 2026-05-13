"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./strikebot.module.css";

type RuntimeEvent = {
  id: number;
  created_at: string;
  run_name: string | null;
  config_name: string | null;
  event_type: string;
  severity: string | null;
  message: string | null;
  signal: string | null;
  premium_pct: string | number | null;
  premium_z: string | number | null;
  price: string | number | null;
  dry_run: boolean | null;
  trading_enabled: boolean | null;
};

type Snapshot = {
  id: number;
  ts: string | number | null;
  premium_pct: string | number | null;
  binance_adausdt: string | number | null;
  mark_price: string | number | null;
  index_price: string | number | null;
  funding_rate: string | number | null;
};

type EventCount = {
  event_type: string;
  count: string;
};

type Order = {
  id: number;
  run_name?: string | null;
  config_name?: string | null;
  created_at: string;
  status: string;
  side: string;
  order_type: string | null;
  price: string | number | null;
  premium_pct: string | number | null;
  premium_z: string | number | null;
  size_usd: string | number | null;
  leverage: string | number | null;
  dry_run: boolean | null;
  trading_enabled: boolean | null;
};

type Position = {
  id: number;
  run_name?: string | null;
  config_name?: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  side: string;
  entry_price: string | number | null;
  exit_price: string | number | null;
  pnl_pct: string | number | null;
  pnl_usd: string | number | null;
  exit_reason: string | null;
  size_usd: string | number | null;
  leverage: string | number | null;
  dry_run: boolean | null;
  trading_enabled: boolean | null;
};

type PositionStats = {
  open_positions: string;
  closed_positions: string;
  winners: string;
  losers: string;
  total_pnl_usd: string | null;
  avg_pnl_usd: string | null;
};

type StrikebotData = {
  generatedAt: string;
  latestSnapshot: Snapshot | null;
  recentEvents: RuntimeEvent[];
  allEvents?: RuntimeEvent[];
  eventCounts: EventCount[];
  recentOrders: Order[];
  recentPositions: Position[];
  orderCount: number;
  positionStats: PositionStats | null;
};

type ApiResponse = {
  ok: boolean;
  data?: StrikebotData;
  error?: string;
};

const REFRESH_SECONDS = 60;
const CURRENT_RUN_NAME = "live_v1";
const PAGE_SIZE = 20;

function isCurrentRun(item: { run_name?: string | null }): boolean {
  return !item.run_name || item.run_name === CURRENT_RUN_NAME;
}

function isLiveRow(item: { run_name?: string | null; dry_run?: boolean | null; trading_enabled?: boolean | null }): boolean {
  return isCurrentRun(item) && item.dry_run === false && item.trading_enabled === true;
}

function isWithinHours(value: string | null | undefined, hours: number): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: string | number | null | undefined, digits = 4): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return parsed.toFixed(digits);
}

function formatPct(value: string | number | null | undefined, digits = 4): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return `${parsed.toFixed(digits)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatTimeOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function ageSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
}

function classForSide(side: string | null | undefined): string {
  if (side === "LONG") return styles.goodText;
  if (side === "SHORT") return styles.badText;
  return styles.mutedText;
}

function classForPnl(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  if (parsed === null) return styles.mutedText;
  return parsed >= 0 ? styles.goodText : styles.badText;
}

function pageCount(items: unknown[]): number {
  return Math.max(1, Math.ceil(items.length / PAGE_SIZE));
}

function pageItems<T>(items: T[], page: number): T[] {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

function Pager({ page, totalItems, onChange }: { page: number; totalItems: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  if (pages <= 1) return null;

  return (
    <div className={styles.pager}>
      <button type="button" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}>Prev</button>
      <span>Page {page + 1} / {pages}</span>
      <button type="button" onClick={() => onChange(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Next</button>
    </div>
  );
}

function PremiumSparkline({ events }: { events: RuntimeEvent[] }) {
  const points = events
    .slice(0, 288)
    .reverse()
    .map((event) => toNumber(event.premium_pct))
    .filter((value): value is number => value !== null);

  if (points.length < 2) {
    return <div className={styles.emptyChart}>Not enough premium data yet</div>;
  }

  const width = 900;
  const height = 210;
  const padding = 18;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;

  const coords = points.map((value, index) => {
    const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
    const y = padding + ((max - value) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const zeroY = padding + ((max - 0) / range) * (height - padding * 2);
  const latest = points[points.length - 1];

  return (
    <div className={styles.chartBox}>
      <div className={styles.chartHeaderRow}>
        <span>Premium sparkline · running 24h</span>
        <strong className={latest >= 0 ? styles.goodText : styles.badText}>{latest.toFixed(4)}%</strong>
      </div>
      <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="24 hour premium sparkline">
        <defs>
          <linearGradient id="premiumLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5ba0ff" />
            <stop offset="100%" stopColor="#45ef6c" />
          </linearGradient>
        </defs>
        <line x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} className={styles.zeroLine} />
        <polyline points={coords.join(" ")} fill="none" stroke="url(#premiumLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((coord, index) => {
          const [x, y] = coord.split(",");
          return <circle key={`${coord}-${index}`} cx={x} cy={y} r={index === coords.length - 1 ? 5 : 2.2} className={styles.sparkDot} />;
        })}
      </svg>
      <div className={styles.chartFooterRow}>
        <span>min {min.toFixed(4)}%</span>
        <span>max {max.toFixed(4)}%</span>
      </div>
    </div>
  );
}

export default function StrikebotDashboard({ token }: { token: string }) {
  const [data, setData] = useState<StrikebotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [openPositionPage, setOpenPositionPage] = useState(0);
  const [signalPage, setSignalPage] = useState(0);

  const loadData = useCallback(async () => {
    if (!token) {
      setError("Missing dashboard token in URL.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/strikebot/status?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || `Request failed: ${response.status}`);
      }

      setData(payload.data);
      setError(null);
      setLastRefresh(new Date());
      setCountdown(REFRESH_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void loadData();
    }, REFRESH_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const currentEvents = useMemo(() => {
    return (data?.recentEvents ?? []).filter((event) => isCurrentRun(event));
  }, [data]);

  const liveEvents = useMemo(() => {
    return currentEvents.filter((event) => event.dry_run === false && event.trading_enabled === true);
  }, [currentEvents]);

  const allEvents = useMemo(() => {
    return (data?.allEvents ?? data?.recentEvents ?? []).filter((event) => isCurrentRun(event));
  }, [data]);

  const signalHistory = useMemo(() => {
    return allEvents.filter((event) => event.event_type !== "NO_SIGNAL");
  }, [allEvents]);

  const visibleOrders = useMemo(() => {
    return (data?.recentOrders ?? []).filter((order) => {
      if (!isLiveRow(order)) return false;
      const status = String(order.status ?? "").toUpperCase();
      return !status.includes("DRY_RUN") && !status.includes("FAILED") && !status.includes("UNCONFIRMED");
    });
  }, [data]);

  const visibleOrders24h = useMemo(() => {
    return visibleOrders.filter((order) => isWithinHours(order.created_at, 24));
  }, [visibleOrders]);

  const visiblePositions = useMemo(() => {
    return (data?.recentPositions ?? []).filter((position) => isLiveRow(position));
  }, [data]);

  const positions24h = useMemo(() => {
    return visiblePositions.filter((position) => isWithinHours(position.updated_at || position.created_at, 24));
  }, [visiblePositions]);

  const openPositions = useMemo(() => {
    return visiblePositions.filter((position) => position.status === "OPEN");
  }, [visiblePositions]);

  useEffect(() => {
    setOpenPositionPage((page) => Math.min(page, pageCount(openPositions) - 1));
  }, [openPositions]);

  useEffect(() => {
    setSignalPage((page) => Math.min(page, pageCount(signalHistory) - 1));
  }, [signalHistory]);

  const stats = useMemo(() => {
    const orderEvents = liveEvents.filter((event) => {
      const type = event.event_type;
      return (
        type === "LIVE_ORDER_ATTEMPTED" ||
        type === "LIVE_ORDER_SENT" ||
        type === "LIVE_ORDER_PLACED" ||
        type === "LIVE_POSITION_OPENED" ||
        type === "LIVE_POSITION_OPEN_CONFIRMED" ||
        type === "LIVE_POSITION_CLOSE_ATTEMPTED" ||
        type === "LIVE_POSITION_CLOSED"
      );
    }).length;

    const noSignals = currentEvents.filter((event) => event.event_type === "NO_SIGNAL").length;
    const rejected = currentEvents.filter((event) => event.event_type === "SIGNAL_REJECTED").length;
    const totalEvents = currentEvents.length;

    const closedPositions = positions24h.filter((position) => position.status === "CLOSED");
    const winners = closedPositions.filter((position) => (toNumber(position.pnl_usd) ?? 0) > 0).length;
    const losers = closedPositions.filter((position) => (toNumber(position.pnl_usd) ?? 0) < 0).length;
    const closed = winners + losers;
    const totalPnl = closedPositions.reduce((sum, position) => sum + (toNumber(position.pnl_usd) ?? 0), 0);
    const avgPnl = closedPositions.length > 0 ? totalPnl / closedPositions.length : 0;
    const winRate = closed > 0 ? (winners / closed) * 100 : 0;

    return {
      totalEvents,
      noSignals,
      rejected,
      orderEvents,
      orderCount: visibleOrders24h.length,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalPnl,
      avgPnl,
      winRate,
    };
  }, [currentEvents, liveEvents, visibleOrders24h, positions24h, openPositions]);

  const latestEvent = currentEvents[0] ?? allEvents[0] ?? null;
  const tradingEnabled = latestEvent?.trading_enabled ?? false;
  const dryRun = latestEvent?.dry_run ?? true;
  const latestEventAge = ageSeconds(latestEvent?.created_at);
  const heartbeatOk = latestEventAge !== null && latestEventAge < 180;
  const latestZ = toNumber(latestEvent?.premium_z);
  const visibleOpenPositionsPage = pageItems(openPositions, openPositionPage);
  const visibleSignalsPage = pageItems(signalHistory, signalPage);

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>matotam.io private monitor</p>
          <h1 className={styles.title}>STRIKE BOT <span>LIVE DASHBOARD</span></h1>
          <p className={styles.subtitle}>Read-only status dashboard. No order controls.</p>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.refreshButton} onClick={() => void loadData()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto {autoRefresh ? `${countdown}s` : "off"}
          </label>
          <p className={styles.updatedText}>
            Updated CET: {lastRefresh ? formatDateTime(lastRefresh.toISOString()) : "—"}
          </p>
        </div>
      </header>

      {error ? <section className={styles.errorBox}>{error}</section> : null}

      <section className={styles.metricsGrid}>
        <article className={`${styles.metricCard} ${styles.statusCard}`}>
          <span>Status</span>
          <strong className={tradingEnabled ? styles.goodText : styles.warnText}>
            <span className={heartbeatOk ? styles.liveDot : styles.staleDot} />
            {tradingEnabled ? "LIVE" : "SAFE"}
          </strong>
          <small>{dryRun ? "DRY-RUN" : "REAL ORDERS ENABLED"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Heartbeat</span>
          <strong className={heartbeatOk ? styles.goodText : styles.badText}>
            {latestEventAge === null ? "—" : `${latestEventAge}s`}
          </strong>
          <small>latest live event</small>
        </article>
        <article className={styles.metricCard}>
          <span>Premium</span>
          <strong className={toNumber(data?.latestSnapshot?.premium_pct) !== null && Number(data?.latestSnapshot?.premium_pct) >= 0 ? styles.goodText : styles.badText}>
            {formatPct(data?.latestSnapshot?.premium_pct)}
          </strong>
          <small>snapshot #{data?.latestSnapshot?.id ?? "—"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Z-score</span>
          <strong className={latestZ !== null && Math.abs(latestZ) >= 2 ? styles.warnText : undefined}>
            {formatNumber(latestEvent?.premium_z, 3)}
          </strong>
          <small>latest event</small>
        </article>
        <article className={styles.metricCard}>
          <span>Current Price</span>
          <strong>{formatNumber(data?.latestSnapshot?.binance_adausdt, 6)}</strong>
          <small>ADA/USD</small>
        </article>
        <article className={styles.metricCard}>
          <span>Orders 24h</span>
          <strong>{stats.orderCount}</strong>
          <small>open + close</small>
        </article>
        <article className={styles.metricCard}>
          <span>Open Positions</span>
          <strong>{stats.openPositions}</strong>
          <small>all live positions</small>
        </article>
        <article className={styles.metricCard}>
          <span>PnL 24h</span>
          <strong className={stats.totalPnl >= 0 ? styles.goodText : styles.badText}>
            {stats.totalPnl.toFixed(4)}
          </strong>
          <small>USD</small>
        </article>
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.panel}>
          <h2>Signals Summary · Running 24h</h2>
          <div className={styles.statRows}>
            <div><span>Order events</span><strong className={styles.goodText}>{stats.orderEvents}</strong></div>
            <div><span>Rejected signals</span><strong className={styles.warnText}>{stats.rejected}</strong></div>
            <div><span>No signal</span><strong>{stats.noSignals}</strong></div>
            <div><span>Total events</span><strong>{stats.totalEvents}</strong></div>
            <div><span>Win rate</span><strong>{stats.winRate.toFixed(1)}%</strong></div>
            <div><span>Avg PnL</span><strong className={stats.avgPnl >= 0 ? styles.goodText : styles.badText}>{stats.avgPnl.toFixed(4)}</strong></div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.rulesPanel}`}>
          <h2>Bot Rules</h2>
          <div className={styles.rulesCompact}>
            <div><span>LONG</span><strong>premium ≤ -0.60% · z ≤ -2.5</strong></div>
            <div><span>SHORT</span><strong>premium ≥ +0.60% · z ≥ +2.5</strong></div>
            <div><span>Size</span><strong>11 USD · 2x</strong></div>
            <div><span>TP / SL</span><strong>0.30% / 0.45%</strong></div>
            <div><span>Hold / cooldown</span><strong>240m / 30m</strong></div>
            <div><span>Limits</span><strong>3 open · 10/day · -8 USD/day</strong></div>
            <div><span>Loss stop</span><strong>4 consecutive losses</strong></div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.chartPanel}`}>
          <h2>Premium Live Chart · Running 24h</h2>
          <PremiumSparkline events={currentEvents} />
        </article>

        <article className={styles.panelFull}>
          <div className={styles.panelTitleRow}>
            <h2>Open Positions</h2>
            <span>{openPositions.length} total</span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Size</th>
                  <th>Lev</th>
                  <th>Created CET</th>
                  <th>Updated CET</th>
                </tr>
              </thead>
              <tbody>
                {visibleOpenPositionsPage.length === 0 ? (
                  <tr><td colSpan={7} className={styles.emptyCell}>No open positions</td></tr>
                ) : (
                  visibleOpenPositionsPage.map((position) => (
                    <tr key={position.id}>
                      <td>{position.id}</td>
                      <td className={classForSide(position.side)}>{position.side}</td>
                      <td>{formatNumber(position.entry_price, 6)}</td>
                      <td>{formatNumber(position.size_usd, 2)} USD</td>
                      <td>{formatNumber(position.leverage, 1)}x</td>
                      <td>{formatDateTime(position.created_at)}</td>
                      <td>{formatDateTime(position.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager page={openPositionPage} totalItems={openPositions.length} onChange={setOpenPositionPage} />
        </article>

        <article className={styles.panelWide}>
          <h2>Positions</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>PnL USD</th>
                  <th>PnL %</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {positions24h.length === 0 ? (
                  <tr><td colSpan={8} className={styles.emptyCell}>No 24h positions yet</td></tr>
                ) : (
                  positions24h.slice(0, 20).map((position) => (
                    <tr key={position.id}>
                      <td>{position.id}</td>
                      <td>{position.status}</td>
                      <td className={classForSide(position.side)}>{position.side}</td>
                      <td>{formatNumber(position.entry_price, 6)}</td>
                      <td>{formatNumber(position.exit_price, 6)}</td>
                      <td className={classForPnl(position.pnl_usd)}>{formatNumber(position.pnl_usd, 4)}</td>
                      <td className={classForPnl(position.pnl_pct)}>{formatPct(position.pnl_pct)}</td>
                      <td>{position.exit_reason ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panelWide}>
          <h2>Orders · Running 24h</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Side</th>
                  <th>Price</th>
                  <th>Size</th>
                  <th>Lev</th>
                  <th>Created CET</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders24h.length === 0 ? (
                  <tr><td colSpan={7} className={styles.emptyCell}>No 24h orders yet</td></tr>
                ) : (
                  visibleOrders24h.slice(0, 20).map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.status}</td>
                      <td className={classForSide(order.side)}>{order.side}</td>
                      <td>{formatNumber(order.price, 6)}</td>
                      <td>{formatNumber(order.size_usd, 2)}</td>
                      <td>{formatNumber(order.leverage, 1)}x</td>
                      <td>{formatDateTime(order.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panelFull}>
          <div className={styles.panelTitleRow}>
            <h2>All Captured Signals</h2>
            <span>{signalHistory.length} total · 20 per page</span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Time CET</th>
                  <th>Event</th>
                  <th>Signal</th>
                  <th>Message</th>
                  <th>Premium</th>
                  <th>Z</th>
                  <th>Price</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {visibleSignalsPage.length === 0 ? (
                  <tr><td colSpan={9} className={styles.emptyCell}>No captured signals yet</td></tr>
                ) : (
                  visibleSignalsPage.map((event) => (
                    <tr key={event.id}>
                      <td>{event.id}</td>
                      <td>{formatDateTime(event.created_at)}</td>
                      <td><span className={`${styles.eventPill} ${styles[`event_${event.event_type}`] ?? ""}`}>{event.event_type}</span></td>
                      <td>{event.signal ?? "—"}</td>
                      <td className={styles.messageCell}>{event.message ?? "—"}</td>
                      <td>{formatPct(event.premium_pct)}</td>
                      <td>{formatNumber(event.premium_z, 3)}</td>
                      <td>{formatNumber(event.price, 6)}</td>
                      <td>{event.dry_run ? "DRY" : event.trading_enabled ? "LIVE" : "SAFE"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager page={signalPage} totalItems={signalHistory.length} onChange={setSignalPage} />
        </article>
      </section>

      <footer className={styles.footer}>
        Read-only dashboard. Live trading is controlled only by the Railway executor and Strike API settings.
      </footer>
    </main>
  );
}
