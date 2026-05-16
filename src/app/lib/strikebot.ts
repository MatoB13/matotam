import { Pool } from "pg";

export type StrikebotAsset = "ADA" | "BTC" | "ZEC";

export type StrikebotSnapshot = {
  id: number;
  asset?: string | null;
  ts: string | number | null;
  premium_pct: string | number | null;
  binance_adausdt: string | number | null;
  mark_price: string | number | null;
  index_price: string | number | null;
  funding_rate: string | number | null;
};

export type StrikebotRuntimeEvent = {
  id: number;
  asset?: string | null;
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
  asset?: string | null;
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
  asset?: string | null;
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
  lastStart: string | null;
  lastEnd: string | null;
  lastDurationSeconds: number | null;
  active: boolean;
};

export type StrikebotRuntimeConfig = {
  updated_at: string | null;
  run_name: string | null;
  config_name: string | null;
  executor_enabled: boolean | null;
  trading_enabled: boolean | null;
  dry_run: boolean | null;
  interval_seconds: string | number | null;
  burst_interval_seconds: string | number | null;
  lookback_rows: string | number | null;
  max_snapshot_age_seconds: string | number | null;
  position_size_usd: string | number | null;
  leverage: string | number | null;
  max_open_trades: string | number | null;
  entry_premium_threshold: string | number | null;
  entry_zscore_threshold: string | number | null;
  entry_zscore_mode: string | null;
  take_profit_pct: string | number | null;
  stop_loss_pct: string | number | null;
  max_hold_minutes: string | number | null;
  cooldown_minutes: string | number | null;
  max_daily_trades: string | number | null;
  max_daily_loss_usd: string | number | null;
  max_consecutive_losses: string | number | null;
  use_strike_native_tp_sl: boolean | null;
  bot_managed_price_exits_enabled: boolean | null;
  refresh_open_position_rules: boolean | null;
  config_json: unknown;
};

const SUPPORTED_ASSETS: StrikebotAsset[] = ["ADA", "BTC", "ZEC"];

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

function normalizeAsset(value: string | null | undefined): StrikebotAsset {
  const normalized = String(value || "ADA").trim().toUpperCase();
  return SUPPORTED_ASSETS.includes(normalized as StrikebotAsset)
    ? (normalized as StrikebotAsset)
    : "ADA";
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyOrderSummary(configName: string | null): StrikebotOrderSummary {
  return {
    config_name: configName,
    orders_total: "0",
    orders_24h: "0",
    closed_total: "0",
    closed_24h: "0",
    winners_total: "0",
    winners_24h: "0",
    pnl_total: "0",
    pnl_24h: "0",
  };
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
  const lastDurationSeconds = lastBurst ? Math.max(0, (lastBurst.end - lastBurst.start) / 1000) : null;
  const active = lastBurst ? now - lastBurst.end <= activeGraceSeconds * 1000 : false;

  return {
    total: bursts.length,
    last24h: bursts24h.length,
    avgDurationSeconds,
    avgPeakAbs,
    lastPeak: lastBurst?.peak ?? null,
    lastStart: lastBurst ? new Date(lastBurst.start).toISOString() : null,
    lastEnd: lastBurst ? new Date(lastBurst.end).toISOString() : null,
    lastDurationSeconds,
    active,
  };
}

function buildSyntheticEventsFromSnapshots(
  rows: StrikebotSnapshot[],
  asset: StrikebotAsset,
): StrikebotRuntimeEvent[] {
  const sortedRows = [...rows].sort((a, b) => {
    const aTs = toFiniteNumber(a.ts) ?? 0;
    const bTs = toFiniteNumber(b.ts) ?? 0;
    return aTs - bTs;
  });
  const premiums = sortedRows
    .map((row) => toFiniteNumber(row.premium_pct))
    .filter((value): value is number => value !== null);
  const mean = premiums.length > 0 ? premiums.reduce((sum, value) => sum + value, 0) / premiums.length : 0;
  const variance =
    premiums.length > 1
      ? premiums.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (premiums.length - 1)
      : 0;
  const std = Math.sqrt(variance) || 0;
  const premiumThreshold = 0.55;
  const zThreshold = 1.8;

  return sortedRows
    .map((row): StrikebotRuntimeEvent | null => {
      const ts = toFiniteNumber(row.ts);
      if (ts === null) return null;
      const premium = toFiniteNumber(row.premium_pct);
      const price = toFiniteNumber(row.binance_adausdt);
      const z = premium !== null && std > 0 ? (premium - mean) / std : null;
      const signal =
        premium !== null && z !== null && premium >= premiumThreshold && z >= zThreshold
          ? "SHORT"
          : premium !== null && z !== null && premium <= -premiumThreshold && z <= -zThreshold
            ? "LONG"
            : null;

      return {
        id: row.id,
        asset,
        created_at: new Date(ts).toISOString(),
        run_name: null,
        config_name: `${asset.toLowerCase()}_collector_signal_view`,
        event_type: signal ? "SIGNAL_DETECTED" : "NO_SIGNAL",
        severity: null,
        message: signal ? `${asset} collector signal candidate` : null,
        signal,
        premium_pct: premium,
        premium_z: z,
        price,
        dry_run: true,
        trading_enabled: false,
        metadata: { source: "market_snapshots" },
      };
    })
    .filter((event): event is StrikebotRuntimeEvent => event !== null)
    .reverse();
}

export async function getStrikebotStatus(assetInput?: string | null) {
  const asset = normalizeAsset(assetInput);
  const pool = getPool();
  const isLiveAsset = asset === "ADA";

  const currentConfigResult = isLiveAsset
    ? await pool.query<PgConfigNameRow>(
        `
        SELECT config_name
        FROM (
          SELECT config_name, created_at FROM live_runtime_events WHERE config_name IS NOT NULL AND asset = $1
          UNION ALL
          SELECT config_name, created_at FROM live_orders WHERE config_name IS NOT NULL AND asset = $1
          UNION ALL
          SELECT config_name, created_at FROM live_positions WHERE config_name IS NOT NULL AND asset = $1
        ) configs
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [asset],
      )
    : { rows: [] as PgConfigNameRow[] };

  const currentConfigName = currentConfigResult.rows[0]?.config_name ?? null;

  const latestSnapshotQuery = pool.query<StrikebotSnapshot>(
    `
    SELECT id, asset, ts, premium_pct, binance_adausdt, mark_price, index_price, funding_rate
    FROM market_snapshots
    WHERE asset = $1
    ORDER BY id DESC
    LIMIT 1
    `,
    [asset],
  );

  const marketEventsQuery = pool.query<StrikebotSnapshot>(
    `
    SELECT id, asset, ts, premium_pct, binance_adausdt, mark_price, index_price, funding_rate
    FROM market_snapshots
    WHERE asset = $1
      AND ts >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000)
    ORDER BY ts DESC
    LIMIT 5000
    `,
    [asset],
  );

  const burstSnapshotsQuery = pool.query<PgBurstSnapshotRow>(
    `
    SELECT id, ts, premium_pct
    FROM market_snapshots
    WHERE asset = $1
      AND ts >= (EXTRACT(EPOCH FROM NOW() - INTERVAL '72 hours') * 1000)
    ORDER BY ts ASC
    LIMIT 250000
    `,
    [asset],
  );

  if (!isLiveAsset) {
    const [latestSnapshot, marketEvents, burstSnapshots] = await Promise.all([
      latestSnapshotQuery,
      marketEventsQuery,
      burstSnapshotsQuery,
    ]);
    const syntheticEvents = buildSyntheticEventsFromSnapshots(marketEvents.rows, asset);
    const eventCounts = syntheticEvents.reduce<Record<string, number>>((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] ?? 0) + 1;
      return acc;
    }, {});
    const latestPremium = latestSnapshot.rows[0]?.premium_pct ?? null;
    const latestPremiumNumber = toFiniteNumber(latestPremium);
    const collectorState: StrikebotCollectorState | null =
      latestPremiumNumber !== null
        ? {
            mode: Math.abs(latestPremiumNumber) >= 0.45 ? "BURST" : "NORMAL",
            premium_pct: latestPremium,
            updated_at: new Date().toISOString(),
          }
        : null;

    return {
      asset,
      availableAssets: SUPPORTED_ASSETS,
      generatedAt: new Date().toISOString(),
      latestSnapshot: latestSnapshot.rows[0] ?? null,
      recentEvents: syntheticEvents,
      allEvents: syntheticEvents,
      eventCounts: Object.entries(eventCounts).map(([event_type, count]) => ({
        event_type,
        count: String(count),
      })),
      recentOrders: [] as StrikebotOrder[],
      recentPositions: [] as StrikebotPosition[],
      orderCount: 0,
      positionStats: {
        open_positions: "0",
        closed_positions: "0",
        winners: "0",
        losers: "0",
        total_pnl_usd: "0",
        avg_pnl_usd: "0",
      },
      currentConfigName: `${asset.toLowerCase()}_collector_signal_view`,
      runtimeConfig: null,
      orderSummary: emptyOrderSummary(null),
      collectorState,
      burstSummary: computeBurstSummaryFromSnapshots(burstSnapshots.rows),
    };
  }

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
    runtimeConfig,
    burstSnapshots,
  ] = await Promise.all([
    latestSnapshotQuery,
    pool.query<StrikebotRuntimeEvent>(
      `
      SELECT id, asset, created_at, run_name, config_name, event_type, severity, message,
             signal, premium_pct, premium_z, price, dry_run, trading_enabled, metadata
      FROM live_runtime_events
      WHERE asset = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY id DESC
      LIMIT 2000
      `,
      [asset],
    ),
    pool.query<StrikebotRuntimeEvent>(
      `
      SELECT id, asset, created_at, run_name, config_name, event_type, severity, message,
             signal, premium_pct, premium_z, price, dry_run, trading_enabled, metadata
      FROM live_runtime_events
      WHERE asset = $1
      ORDER BY id DESC
      LIMIT 5000
      `,
      [asset],
    ),
    pool.query<PgEventCountRow>(
      `
      SELECT event_type, COUNT(*)::text AS count
      FROM live_runtime_events
      WHERE asset = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY count DESC
      `,
      [asset],
    ),
    pool.query<StrikebotOrder>(
      `
      SELECT id, asset, created_at, run_name, config_name, status, side, order_type,
             price, premium_pct, premium_z, size_usd, leverage, dry_run, trading_enabled
      FROM live_orders
      WHERE asset = $1
      ORDER BY id DESC
      LIMIT 1000
      `,
      [asset],
    ),
    pool.query<StrikebotPosition>(
      `
      SELECT id, asset, created_at, updated_at, run_name, config_name, status, side,
             entry_price, exit_price, pnl_pct, pnl_usd, exit_reason, size_usd,
             leverage, dry_run, trading_enabled
      FROM live_positions
      WHERE asset = $1
      ORDER BY id DESC
      LIMIT 1000
      `,
      [asset],
    ),
    pool.query<PgCountRow>(
      `
      SELECT COUNT(*)::text AS count
      FROM live_orders
      WHERE asset = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
      `,
      [asset],
    ),
    pool.query<PgPositionStatsRow>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'OPEN')::text AS open_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS closed_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) > 0)::text AS winners,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) < 0)::text AS losers,
        COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS total_pnl_usd,
        COALESCE(AVG(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS avg_pnl_usd
      FROM live_positions
      WHERE asset = $1
      `,
      [asset],
    ),
    pool.query<StrikebotOrderSummary>(
      `
      WITH order_agg AS (
        SELECT
          COUNT(*)::text AS orders_total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS orders_24h
        FROM live_orders
        WHERE asset = $2
          AND ($1::text IS NULL OR config_name = $1::text)
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
        WHERE asset = $2
          AND ($1::text IS NULL OR config_name = $1::text)
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
      [currentConfigName, asset],
    ),
    pool
      .query<StrikebotRuntimeConfig>(
        `
        SELECT
          updated_at,
          run_name,
          config_name,
          executor_enabled,
          trading_enabled,
          dry_run,
          interval_seconds,
          burst_interval_seconds,
          lookback_rows,
          max_snapshot_age_seconds,
          position_size_usd,
          leverage,
          max_open_trades,
          entry_premium_threshold,
          entry_zscore_threshold,
          entry_zscore_mode,
          take_profit_pct,
          stop_loss_pct,
          max_hold_minutes,
          cooldown_minutes,
          max_daily_trades,
          max_daily_loss_usd,
          max_consecutive_losses,
          use_strike_native_tp_sl,
          bot_managed_price_exits_enabled,
          refresh_open_position_rules,
          config_json
        FROM bot_runtime_config
        WHERE id = 1
          AND asset = $1
        LIMIT 1
        `,
        [asset],
      )
      .catch(() => ({ rows: [] as StrikebotRuntimeConfig[] })),
    burstSnapshotsQuery,
  ]);

  const latestPremium = latestSnapshot.rows[0]?.premium_pct ?? null;
  const latestPremiumNumber = toFiniteNumber(latestPremium);
  const collectorState: StrikebotCollectorState | null =
    latestPremiumNumber !== null
      ? {
          mode: Math.abs(latestPremiumNumber) >= 0.45 ? "BURST" : "NORMAL",
          premium_pct: latestPremium,
          updated_at: new Date().toISOString(),
        }
      : null;

  return {
    asset,
    availableAssets: SUPPORTED_ASSETS,
    generatedAt: new Date().toISOString(),
    latestSnapshot: latestSnapshot.rows[0] ?? null,
    recentEvents: recentEvents.rows,
    allEvents: allEvents.rows,
    eventCounts: eventCounts.rows,
    recentOrders: recentOrders.rows,
    recentPositions: recentPositions.rows,
    orderCount: Number(orderCount.rows[0]?.count ?? 0),
    positionStats: positionStats.rows[0] ?? null,
    currentConfigName: runtimeConfig.rows[0]?.config_name ?? currentConfigName,
    runtimeConfig: runtimeConfig.rows[0] ?? null,
    orderSummary: orderSummary.rows[0] ?? emptyOrderSummary(currentConfigName),
    collectorState,
    burstSummary: computeBurstSummaryFromSnapshots(burstSnapshots.rows),
  };
}
