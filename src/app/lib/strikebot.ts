import { Pool } from "pg";

export type StrikebotSnapshot = {
  id: number;
  ts: string | number | null;
  premium_pct: string | number | null;
  binance_adausdt: string | number | null;
  mark_price: string | number | null;
  index_price: string | number | null;
  funding_rate: string | number | null;
};

export type StrikebotRuntimeEvent = {
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
  metadata: unknown;
};

export type StrikebotOrder = {
  id: number;
  run_name: string | null;
  config_name: string | null;
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

export type StrikebotPosition = {
  id: number;
  run_name: string | null;
  config_name: string | null;
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

type PgCountRow = { count: string };
type PgEventCountRow = { event_type: string; count: string };
type PgConfigNameRow = { config_name: string | null };
type PgBurstSnapshotRow = {
  id: number;
  ts: string | number | null;
  premium_pct: string | number | null;
};

type PgPositionStatsRow = {
  open_positions: string;
  closed_positions: string;
  winners: string;
  losers: string;
  total_pnl_usd: string | null;
  avg_pnl_usd: string | null;
};

export type StrikebotOrderSummary = {
  config_name: string | null;
  orders_total: string;
  orders_24h: string;
  closed_total: string;
  closed_24h: string;
  winners_total: string;
  winners_24h: string;
  pnl_total: string | null;
  pnl_24h: string | null;
};

export type StrikebotCollectorState = {
  mode: string | null;
  premium_pct: string | number | null;
  updated_at: string | null;
};

export type StrikebotBurstSummary = {
  total: number;
  last24h: number;
  avgDurationSeconds: number;
  avgPeakAbs: number | null;
  lastPeak: number | null;
  active: boolean;
};

const globalForPg = globalThis as unknown as {
  strikebotPool?: Pool;
};

function getPool() {
  const connectionString = process.env.STRIKEBOT_DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing STRIKEBOT_DATABASE_URL");
  }

  if (!globalForPg.strikebotPool) {
    globalForPg.strikebotPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalForPg.strikebotPool;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeBurstSummaryFromSnapshots(rows: PgBurstSnapshotRow[]): StrikebotBurstSummary {
  const enterAbs = 0.45;
  const maxFastGapSeconds = 15;
  const minFastPoints = 3;
  const activeGraceSeconds = 30;
  const now = Date.now();

  const points = rows
    .map((row) => {
      const time = toFiniteNumber(row.ts);
      const premium = toFiniteNumber(row.premium_pct);

      if (time === null || premium === null) return null;

      return {
        id: row.id,
        time,
        premium,
        absPremium: Math.abs(premium),
      };
    })
    .filter(
      (point): point is { id: number; time: number; premium: number; absPremium: number } =>
        point !== null,
    )
    .sort((a, b) => a.time - b.time);

  const fastSegments: Array<Array<{ time: number; premium: number; absPremium: number }>> = [];
  let currentSegment: Array<{ time: number; premium: number; absPremium: number }> = [];

  for (const point of points) {
    const previous = currentSegment[currentSegment.length - 1] ?? null;
    const gapSeconds = previous ? (point.time - previous.time) / 1000 : null;

    if (!previous || (gapSeconds !== null && gapSeconds <= maxFastGapSeconds)) {
      currentSegment.push(point);
      continue;
    }

    if (currentSegment.length >= minFastPoints) {
      fastSegments.push(currentSegment);
    }

    currentSegment = [point];
  }

  if (currentSegment.length >= minFastPoints) {
    fastSegments.push(currentSegment);
  }

  const bursts = fastSegments
    .map((segment) => {
      const peakPoint = segment.reduce((best, point) =>
        point.absPremium > best.absPremium ? point : best,
      );

      return {
        start: segment[0].time,
        end: segment[segment.length - 1].time,
        peak: peakPoint.premium,
        peakAbs: peakPoint.absPremium,
        pointCount: segment.length,
      };
    })
    .filter((segment) => segment.peakAbs >= enterAbs);

  const last24Cutoff = now - 24 * 60 * 60 * 1000;
  const bursts24h = bursts.filter((burst) => burst.start >= last24Cutoff);

  const durations = bursts
    .map((burst) => (burst.end - burst.start) / 1000)
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  const avgDurationSeconds =
    durations.length > 0
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      : 0;

  const avgPeakAbs =
    bursts.length > 0
      ? bursts.reduce((sum, burst) => sum + burst.peakAbs, 0) / bursts.length
      : null;

  const lastBurst = bursts[bursts.length - 1] ?? null;
  const active = lastBurst ? now - lastBurst.end <= activeGraceSeconds * 1000 : false;

  return {
    total: bursts.length,
    last24h: bursts24h.length,
    avgDurationSeconds,
    avgPeakAbs,
    lastPeak: lastBurst?.peak ?? null,
    active,
  };
}

export async function getStrikebotStatus() {
  const pool = getPool();

  const currentConfigResult = await pool.query<PgConfigNameRow>(`
    SELECT config_name
    FROM (
      SELECT config_name, created_at FROM live_runtime_events WHERE config_name IS NOT NULL
      UNION ALL
      SELECT config_name, created_at FROM live_orders WHERE config_name IS NOT NULL
      UNION ALL
      SELECT config_name, created_at FROM live_positions WHERE config_name IS NOT NULL
    ) configs
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const currentConfigName = currentConfigResult.rows[0]?.config_name ?? null;

  const [
    latestSnapshot,
    recentEvents,
    allEvents,
    eventCounts,
    recentOrders,
    recentPositions,
    orderCount,
    positionStats,
    orderSummary,
    burstSnapshots,
  ] = await Promise.all([
    pool.query<StrikebotSnapshot>(`
      SELECT id, ts, premium_pct, binance_adausdt, mark_price, index_price, funding_rate
      FROM market_snapshots
      ORDER BY id DESC
      LIMIT 1
    `),
    pool.query<StrikebotRuntimeEvent>(`
      SELECT id, created_at, run_name, config_name, event_type, severity, message,
             signal, premium_pct, premium_z, price, dry_run, trading_enabled, metadata
      FROM live_runtime_events
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY id DESC
      LIMIT 2000
    `),
    pool.query<StrikebotRuntimeEvent>(`
      SELECT id, created_at, run_name, config_name, event_type, severity, message,
             signal, premium_pct, premium_z, price, dry_run, trading_enabled, metadata
      FROM live_runtime_events
      ORDER BY id DESC
      LIMIT 5000
    `),
    pool.query<PgEventCountRow>(`
      SELECT event_type, COUNT(*)::text AS count
      FROM live_runtime_events
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY count DESC
    `),
    pool.query<StrikebotOrder>(`
      SELECT id, created_at, run_name, config_name, status, side, order_type,
             price, premium_pct, premium_z, size_usd, leverage, dry_run, trading_enabled
      FROM live_orders
      ORDER BY id DESC
      LIMIT 1000
    `),
    pool.query<StrikebotPosition>(`
      SELECT id, created_at, updated_at, run_name, config_name, status, side,
             entry_price, exit_price, pnl_pct, pnl_usd, exit_reason, size_usd,
             leverage, dry_run, trading_enabled
      FROM live_positions
      ORDER BY id DESC
      LIMIT 1000
    `),
    pool.query<PgCountRow>(`
      SELECT COUNT(*)::text AS count
      FROM live_orders
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `),
    pool.query<PgPositionStatsRow>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'OPEN')::text AS open_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS closed_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) > 0)::text AS winners,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) < 0)::text AS losers,
        COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS total_pnl_usd,
        COALESCE(AVG(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS avg_pnl_usd
      FROM live_positions
    `),
    pool.query<StrikebotOrderSummary>(
      `
      WITH order_agg AS (
        SELECT
          COUNT(*)::text AS orders_total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS orders_24h
        FROM live_orders
        WHERE ($1::text IS NULL OR config_name = $1::text)
          AND dry_run = FALSE
          AND trading_enabled = TRUE
      ),
      position_agg AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'CLOSED')::text AS closed_total,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS closed_24h,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND COALESCE(pnl_usd, 0) > 0)::text AS winners_total,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) > 0)::text AS winners_24h,
          COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED'), 0)::text AS pnl_total,
          COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS pnl_24h
        FROM live_positions
        WHERE ($1::text IS NULL OR config_name = $1::text)
          AND dry_run = FALSE
          AND trading_enabled = TRUE
      )
      SELECT
        $1::text AS config_name,
        order_agg.orders_total,
        order_agg.orders_24h,
        position_agg.closed_total,
        position_agg.closed_24h,
        position_agg.winners_total,
        position_agg.winners_24h,
        position_agg.pnl_total,
        position_agg.pnl_24h
      FROM order_agg
      CROSS JOIN position_agg
      `,
      [currentConfigName],
    ),
    pool.query<PgBurstSnapshotRow>(`
      SELECT id, ts, premium_pct
      FROM market_snapshots
      WHERE ts >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '72 hours') * 1000)
      ORDER BY ts ASC
      LIMIT 250000
    `),
  ]);

  const latestPremium = latestSnapshot.rows[0]?.premium_pct ?? null;
  const latestPremiumNumber =
    latestPremium === null || latestPremium === undefined ? null : Number(latestPremium);
  const collectorState: StrikebotCollectorState | null =
    latestPremiumNumber !== null && Number.isFinite(latestPremiumNumber)
      ? {
          mode: Math.abs(latestPremiumNumber) >= 0.45 ? "BURST" : "NORMAL",
          premium_pct: latestPremium,
          updated_at: new Date().toISOString(),
        }
      : null;

  const burstSummary = computeBurstSummaryFromSnapshots(burstSnapshots.rows);

  return {
    generatedAt: new Date().toISOString(),
    latestSnapshot: latestSnapshot.rows[0] ?? null,
    recentEvents: recentEvents.rows,
    allEvents: allEvents.rows,
    eventCounts: eventCounts.rows,
    recentOrders: recentOrders.rows,
    recentPositions: recentPositions.rows,
    orderCount: Number(orderCount.rows[0]?.count ?? 0),
    positionStats: positionStats.rows[0] ?? null,
    currentConfigName,
    orderSummary: orderSummary.rows[0] ?? null,
    collectorState,
    burstSummary,
  };
}
