import { Pool } from "pg";

export type SentimentPrediction = {
  run_id: string;
  trade_date: string;
  ticker: string;
  asset_type: string | null;
  decision: string;
  up_probability: string | number | null;
  sideways_probability: string | number | null;
  down_probability: string | number | null;
  confidence: string | number | null;
  entry_price: string | number | null;
  reference_price: string | number | null;
  status: string | null;
  data_json: unknown;
  reasoning_json: unknown;
  created_at: string;
  updated_at: string;
};

export type SentimentLiveTrade = {
  id: number;
  prediction_run_id: string;
  trade_date: string;
  ticker: string;
  symbol: string | null;
  decision: string;
  order_side: string | null;
  close_side: string | null;
  entry_price: string | number | null;
  current_price: string | number | null;
  exit_price: string | number | null;
  current_pnl_pct: string | number | null;
  realized_pnl_pct: string | number | null;
  max_profit_pct: string | number | null;
  max_loss_pct: string | number | null;
  position_size_usd: string | number | null;
  leverage: string | number | null;
  effective_notional_usd: string | number | null;
  size_base: string | number | null;
  native_take_profit_pct: string | number | null;
  native_stop_loss_pct: string | number | null;
  take_profit_price: string | number | null;
  stop_loss_price: string | number | null;
  status: string;
  close_reason: string | null;
  strategy_id: string | null;
  client_order_id: string | null;
  primary_order_id: string | null;
  tp_order_id: string | null;
  sl_order_id: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

export type SentimentSnapshot = {
  id: number;
  prediction_run_id: string;
  ticker: string;
  price: string | number | null;
  pnl_pct: string | number | null;
  data_json: unknown;
  created_at: string;
};

export type SentimentEvaluation = {
  id: number;
  prediction_run_id: string;
  trade_date: string;
  ticker: string;
  decision: string;
  reference_price: string | number | null;
  evaluation_price: string | number | null;
  result_pct: string | number | null;
  actual_outcome: string | null;
  hit: boolean | null;
  evaluated_at: string;
};

export type SentimentPerformance = {
  predictions_total: string;
  trade_count: string;
  closed_count: string;
  open_count: string;
  winners: string;
  losers: string;
  avg_realized_pnl_pct: string | null;
  total_realized_pnl_pct: string | null;
  best_trade_pct: string | null;
  worst_trade_pct: string | null;
  evaluated_count: string;
  evaluated_hits: string;
  evaluated_misses: string;
  evaluation_hit_rate_pct: string | null;
};

export type SentimentStatus = {
  generatedAt: string;
  latestDate: string | null;
  latest: SentimentPrediction[];
  history: SentimentPrediction[];
  liveTrades: SentimentLiveTrade[];
  latestSnapshots: SentimentSnapshot[];
  evaluations: SentimentEvaluation[];
  performance: SentimentPerformance;
};

const globalForPg = globalThis as unknown as { sentimentDashboardPool?: Pool };

function getPool() {
  const connectionString = process.env.STRIKEBOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing STRIKEBOT_DATABASE_URL or DATABASE_URL");

  if (!globalForPg.sentimentDashboardPool) {
    globalForPg.sentimentDashboardPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalForPg.sentimentDashboardPool;
}

function emptyPerformance(): SentimentPerformance {
  return {
    predictions_total: "0",
    trade_count: "0",
    closed_count: "0",
    open_count: "0",
    winners: "0",
    losers: "0",
    avg_realized_pnl_pct: "0",
    total_realized_pnl_pct: "0",
    best_trade_pct: null,
    worst_trade_pct: null,
    evaluated_count: "0",
    evaluated_hits: "0",
    evaluated_misses: "0",
    evaluation_hit_rate_pct: null,
  };
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)::boolean AS exists",
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

export async function getSentimentStatus(): Promise<SentimentStatus> {
  const pool = getPool();

  const [predictionsExist, liveTradesExist, snapshotsExist, evaluationsExist] = await Promise.all([
    tableExists(pool, "sentiment_daily_predictions"),
    tableExists(pool, "sentiment_live_trades"),
    tableExists(pool, "sentiment_trade_snapshots"),
    tableExists(pool, "sentiment_daily_evaluations"),
  ]);

  if (!predictionsExist) {
    return {
      generatedAt: new Date().toISOString(),
      latestDate: null,
      latest: [],
      history: [],
      liveTrades: [],
      latestSnapshots: [],
      evaluations: [],
      performance: emptyPerformance(),
    };
  }

  const latestDateResult = await pool.query<{ trade_date: string }>(
    "SELECT MAX(trade_date)::text AS trade_date FROM sentiment_daily_predictions",
  );
  const latestDate = latestDateResult.rows[0]?.trade_date ?? null;

  const latestQuery = latestDate
    ? pool.query<SentimentPrediction>(
        `
        SELECT run_id, trade_date::text AS trade_date, ticker, asset_type, decision,
               up_probability, sideways_probability, down_probability, confidence,
               entry_price, reference_price, status, data_json, reasoning_json,
               created_at::text AS created_at, updated_at::text AS updated_at
        FROM sentiment_daily_predictions
        WHERE trade_date = $1::date
        ORDER BY ticker ASC
        `,
        [latestDate],
      )
    : Promise.resolve({ rows: [] as SentimentPrediction[] });

  const historyQuery = pool.query<SentimentPrediction>(
    `
    SELECT run_id, trade_date::text AS trade_date, ticker, asset_type, decision,
           up_probability, sideways_probability, down_probability, confidence,
           entry_price, reference_price, status, data_json, reasoning_json,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM sentiment_daily_predictions
    ORDER BY trade_date DESC, ticker ASC
    LIMIT 300
    `,
  );

  const liveTradesQuery = liveTradesExist
    ? pool.query<SentimentLiveTrade>(
        `
        SELECT id, prediction_run_id, trade_date::text AS trade_date, ticker, symbol, decision,
               order_side, close_side, entry_price, current_price, exit_price,
               current_pnl_pct, realized_pnl_pct, max_profit_pct, max_loss_pct,
               position_size_usd, leverage, effective_notional_usd, size_base,
               native_take_profit_pct, native_stop_loss_pct, take_profit_price, stop_loss_price,
               status, close_reason, strategy_id, client_order_id, primary_order_id, tp_order_id, sl_order_id,
               opened_at::text AS opened_at, closed_at::text AS closed_at, updated_at::text AS updated_at
        FROM sentiment_live_trades
        ORDER BY opened_at DESC
        LIMIT 300
        `,
      )
    : Promise.resolve({ rows: [] as SentimentLiveTrade[] });

  const snapshotsQuery = snapshotsExist
    ? pool.query<SentimentSnapshot>(
        `
        SELECT DISTINCT ON (prediction_run_id)
               id, prediction_run_id, ticker, price, pnl_pct, data_json, created_at::text AS created_at
        FROM sentiment_trade_snapshots
        ORDER BY prediction_run_id, created_at DESC
        `,
      )
    : Promise.resolve({ rows: [] as SentimentSnapshot[] });

  const evaluationsQuery = evaluationsExist
    ? pool.query<SentimentEvaluation>(
        `
        SELECT id, prediction_run_id, trade_date::text AS trade_date, ticker, decision,
               reference_price, evaluation_price, result_pct, actual_outcome, hit,
               evaluated_at::text AS evaluated_at
        FROM sentiment_daily_evaluations
        ORDER BY evaluated_at DESC
        LIMIT 200
        `,
      )
    : Promise.resolve({ rows: [] as SentimentEvaluation[] });

  const performanceQuery = liveTradesExist
    ? pool.query<SentimentPerformance>(
        `
        SELECT
          (SELECT COUNT(*)::text FROM sentiment_daily_predictions) AS predictions_total,
          COUNT(*)::text AS trade_count,
          COUNT(*) FILTER (WHERE status = 'LIVE_CLOSED')::text AS closed_count,
          COUNT(*) FILTER (WHERE status = 'LIVE_OPEN')::text AS open_count,
          COUNT(*) FILTER (WHERE status = 'LIVE_CLOSED' AND COALESCE(realized_pnl_pct, 0) > 0)::text AS winners,
          COUNT(*) FILTER (WHERE status = 'LIVE_CLOSED' AND COALESCE(realized_pnl_pct, 0) < 0)::text AS losers,
          COALESCE(AVG(realized_pnl_pct) FILTER (WHERE status = 'LIVE_CLOSED'), 0)::text AS avg_realized_pnl_pct,
          COALESCE(SUM(realized_pnl_pct) FILTER (WHERE status = 'LIVE_CLOSED'), 0)::text AS total_realized_pnl_pct,
          MAX(realized_pnl_pct) FILTER (WHERE status = 'LIVE_CLOSED')::text AS best_trade_pct,
          MIN(realized_pnl_pct) FILTER (WHERE status = 'LIVE_CLOSED')::text AS worst_trade_pct,
          ${evaluationsExist ? "(SELECT COUNT(*)::text FROM sentiment_daily_evaluations)" : "'0'"} AS evaluated_count,
          ${evaluationsExist ? "(SELECT COUNT(*) FILTER (WHERE hit IS TRUE)::text FROM sentiment_daily_evaluations)" : "'0'"} AS evaluated_hits,
          ${evaluationsExist ? "(SELECT COUNT(*) FILTER (WHERE hit IS FALSE)::text FROM sentiment_daily_evaluations)" : "'0'"} AS evaluated_misses,
          ${evaluationsExist ? "(SELECT CASE WHEN COUNT(*) FILTER (WHERE hit IS NOT NULL) > 0 THEN ((COUNT(*) FILTER (WHERE hit IS TRUE)::numeric / COUNT(*) FILTER (WHERE hit IS NOT NULL)::numeric) * 100)::text ELSE NULL END FROM sentiment_daily_evaluations)" : "NULL"} AS evaluation_hit_rate_pct
        FROM sentiment_live_trades
        `,
      )
    : Promise.resolve({ rows: [emptyPerformance()] as SentimentPerformance[] });

  const [latest, history, liveTrades, latestSnapshots, evaluations, performance] = await Promise.all([
    latestQuery,
    historyQuery,
    liveTradesQuery,
    snapshotsQuery,
    evaluationsQuery,
    performanceQuery,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    latestDate,
    latest: latest.rows,
    history: history.rows,
    liveTrades: liveTrades.rows,
    latestSnapshots: latestSnapshots.rows,
    evaluations: evaluations.rows,
    performance: performance.rows[0] ?? emptyPerformance(),
  };
}
