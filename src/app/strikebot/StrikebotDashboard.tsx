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

  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getCount(counts: EventCount[], eventType: string): number {
  const row = counts.find((item) => item.event_type === eventType);
  return Number(row?.count ?? 0);
}

function classForSide(side: string | null | undefined): string {
  if (side === "LONG") return styles.goodText;
  if (side === "SHORT") return styles.badText;
  return styles.mutedText;
}

export default function StrikebotDashboard({ token }: { token: string }) {
  const [data, setData] = useState<StrikebotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

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
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadData]);

  const stats = useMemo(() => {
    const counts = data?.eventCounts ?? [];
    const longSignals = getCount(counts, "DRY_RUN_ORDER_CREATED") + getCount(counts, "LIVE_ORDER_SENT");
    const noSignals = getCount(counts, "NO_SIGNAL");
    const rejected = getCount(counts, "SIGNAL_REJECTED");
    const totalEvents = counts.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const positionStats = data?.positionStats;
    const winners = Number(positionStats?.winners ?? 0);
    const losers = Number(positionStats?.losers ?? 0);
    const closed = winners + losers;
    const winRate = closed > 0 ? (winners / closed) * 100 : 0;

    return {
      totalEvents,
      noSignals,
      rejected,
      validSignals: longSignals,
      orderCount: data?.orderCount ?? 0,
      openPositions: Number(positionStats?.open_positions ?? 0),
      totalPnl: Number(positionStats?.total_pnl_usd ?? 0),
      winRate,
    };
  }, [data]);

  const latestEvent = data?.recentEvents?.[0] ?? null;
  const tradingEnabled = latestEvent?.trading_enabled ?? false;
  const dryRun = latestEvent?.dry_run ?? true;

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>matotam.io private monitor</p>
          <h1 className={styles.title}>STRIKE BOT <span>LIVE DASHBOARD</span></h1>
          <p className={styles.subtitle}>Read-only status dashboard. Žiadne ovládanie orderov.</p>
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
            Auto 60s
          </label>
          <p className={styles.updatedText}>
            Updated CET: {lastRefresh ? formatDateTime(lastRefresh.toISOString()) : "—"}
          </p>
        </div>
      </header>

      {error ? <section className={styles.errorBox}>{error}</section> : null}

      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Status</span>
          <strong className={tradingEnabled ? styles.goodText : styles.warnText}>
            {tradingEnabled ? "LIVE" : "SAFE"}
          </strong>
          <small>{dryRun ? "DRY-RUN" : "REAL ORDERS ENABLED"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Premium</span>
          <strong>{formatPct(data?.latestSnapshot?.premium_pct)}</strong>
          <small>latest snapshot #{data?.latestSnapshot?.id ?? "—"}</small>
        </article>
        <article className={styles.metricCard}>
          <span>Current Price</span>
          <strong>{formatNumber(data?.latestSnapshot?.binance_adausdt, 6)}</strong>
          <small>ADA/USD</small>
        </article>
        <article className={styles.metricCard}>
          <span>Total Events</span>
          <strong>{stats.totalEvents}</strong>
          <small>live_runtime_events</small>
        </article>
        <article className={styles.metricCard}>
          <span>Orders</span>
          <strong>{stats.orderCount}</strong>
          <small>open + close</small>
        </article>
        <article className={styles.metricCard}>
          <span>Open Positions</span>
          <strong>{stats.openPositions}</strong>
          <small>live_positions</small>
        </article>
        <article className={styles.metricCard}>
          <span>Total PnL</span>
          <strong className={stats.totalPnl >= 0 ? styles.goodText : styles.badText}>
            {stats.totalPnl.toFixed(4)}
          </strong>
          <small>USD</small>
        </article>
        <article className={styles.metricCard}>
          <span>Win Rate</span>
          <strong>{stats.winRate.toFixed(1)}%</strong>
          <small>closed positions</small>
        </article>
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.panel}>
          <h2>Signals Summary</h2>
          <div className={styles.statRows}>
            <div><span>Valid order events</span><strong className={styles.goodText}>{stats.validSignals}</strong></div>
            <div><span>Rejected signals</span><strong className={styles.warnText}>{stats.rejected}</strong></div>
            <div><span>No signal</span><strong>{stats.noSignals}</strong></div>
            <div><span>Total events</span><strong>{stats.totalEvents}</strong></div>
          </div>
        </article>

        <article className={styles.panelWide}>
          <h2>Recent Live Events</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Time CET</th>
                  <th>Event</th>
                  <th>Message</th>
                  <th>Premium</th>
                  <th>Z</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentEvents ?? []).slice(0, 10).map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.created_at)}</td>
                    <td>{event.event_type}</td>
                    <td>{event.message ?? "—"}</td>
                    <td>{formatPct(event.premium_pct)}</td>
                    <td>{formatNumber(event.premium_z, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                {(data?.recentPositions ?? []).length === 0 ? (
                  <tr><td colSpan={8} className={styles.emptyCell}>No positions yet</td></tr>
                ) : (
                  (data?.recentPositions ?? []).slice(0, 10).map((position) => (
                    <tr key={position.id}>
                      <td>{position.id}</td>
                      <td>{position.status}</td>
                      <td className={classForSide(position.side)}>{position.side}</td>
                      <td>{formatNumber(position.entry_price, 6)}</td>
                      <td>{formatNumber(position.exit_price, 6)}</td>
                      <td className={toNumber(position.pnl_usd) !== null && Number(position.pnl_usd) >= 0 ? styles.goodText : styles.badText}>
                        {formatNumber(position.pnl_usd, 4)}
                      </td>
                      <td>{formatPct(position.pnl_pct)}</td>
                      <td>{position.exit_reason ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panelWide}>
          <h2>Orders</h2>
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
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentOrders ?? []).length === 0 ? (
                  <tr><td colSpan={7} className={styles.emptyCell}>No orders yet</td></tr>
                ) : (
                  (data?.recentOrders ?? []).slice(0, 10).map((order) => (
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
      </section>

      <footer className={styles.footer}>
        Tento dashboard je read-only. Reálne obchodovanie sa riadi iba Railway executorom a Strike API nastaveniami.
      </footer>
    </main>
  );
}
