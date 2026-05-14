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
type PgPositionStatsRow = {
  open_positions: string;
  closed_positions: string;
  winners: string;
  losers: string;
  total_pnl_usd: string | null;
  avg_pnl_usd: string | null;
};

type PgConfigNameRow = {
  config_name: string | null;
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
    `),
    pool.query<StrikebotRuntimeEvent>(`
      SELECT id, created_at, run_name, config_name, event_type, severity, message,
             signal, premium_pct, premium_z, price, dry_run, trading_enabled, metadata
      FROM live_runtime_events
      ORDER BY id DESC
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
    `),
    pool.query<StrikebotPosition>(`
      SELECT id, created_at, updated_at, run_name, config_name, status, side,
             entry_price, exit_price, pnl_pct, pnl_usd, exit_reason, size_usd,
             leverage, dry_run, trading_enabled
      FROM live_positions
      ORDER BY id DESC
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
      SELECT
        $1::text AS config_name,
        COUNT(o.*)::text AS orders_total,
        COUNT(o.*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '24 hours')::text AS orders_24h,
        COUNT(p.*) FILTER (WHERE p.status = 'CLOSED')::text AS closed_total,
        COUNT(p.*) FILTER (WHERE p.status = 'CLOSED' AND p.updated_at >= NOW() - INTERVAL '24 hours')::text AS closed_24h,
        COUNT(p.*) FILTER (WHERE p.status = 'CLOSED' AND COALESCE(p.pnl_usd, 0) > 0)::text AS winners_total,
        COUNT(p.*) FILTER (WHERE p.status = 'CLOSED' AND p.updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(p.pnl_usd, 0) > 0)::text AS winners_24h,
        COALESCE(SUM(p.pnl_usd) FILTER (WHERE p.status = 'CLOSED'), 0)::text AS pnl_total,
        COALESCE(SUM(p.pnl_usd) FILTER (WHERE p.status = 'CLOSED' AND p.updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS pnl_24h
      FROM
        (SELECT 1) anchor
      LEFT JOIN live_orders o
        ON ($1::text IS NULL OR o.config_name = $1::text)
       AND o.dry_run = FALSE
       AND o.trading_enabled = TRUE
      LEFT JOIN live_positions p
        ON ($1::text IS NULL OR p.config_name = $1::text)
       AND p.dry_run = FALSE
       AND p.trading_enabled = TRUE
      `,
      [currentConfigName],
    ),
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
  };
}
