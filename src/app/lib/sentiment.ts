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

export type SentimentPaperTrade = {
  id: number;
  prediction_run_id: string;
  trade_date: string;
  ticker: string;
  decision: string;
  entry_price: string | number | null;
  current_price: string | number | null;
  exit_price: string | number | null;
  current_pnl_pct: string | number | null;
  realized_pnl_pct: string | number | null;
  max_profit_pct: string | number | null;
  max_loss_pct: string | number | null;
  status: string;
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
};

export type SentimentStatus = {
  generatedAt: string;
  latestDate: string | null;
  latest: SentimentPrediction[];
  history: SentimentPrediction[];
  paperTrades: SentimentPaperTrade[];
  latestSnapshots: SentimentSnapshot[];
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

  const [predictionsExist, tradesExist, snapshotsExist] = await Promise.all([
    tableExists(pool, "sentiment_daily_predictions"),
    tableExists(pool, "sentiment_paper_trades"),
    tableExists(pool, "sentiment_trade_snapshots"),
  ]);

  if (!predictionsExist) {
    return {
      generatedAt: new Date().toISOString(),
      latestDate: null,
      latest: [],
      history: [],
      paperTrades: [],
      latestSnapshots: [],
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
    LIMIT 200
    `,
  );

  const tradesQuery = tradesExist
    ? pool.query<SentimentPaperTrade>(
        `
        SELECT id, prediction_run_id, trade_date::text AS trade_date, ticker, decision,
               entry_price, current_price, exit_price, current_pnl_pct, realized_pnl_pct,
               max_profit_pct, max_loss_pct, status,
               opened_at::text AS opened_at, closed_at::text AS closed_at, updated_at::text AS updated_at
        FROM sentiment_paper_trades
        ORDER BY opened_at DESC
        LIMIT 200
        `,
      )
    : Promise.resolve({ rows: [] as SentimentPaperTrade[] });

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

  const performanceQuery = tradesExist
    ? pool.query<SentimentPerformance>(
        `
        SELECT
          (SELECT COUNT(*)::text FROM sentiment_daily_predictions) AS predictions_total,
          COUNT(*)::text AS trade_count,
          COUNT(*) FILTER (WHERE status = 'PAPER_CLOSED')::text AS closed_count,
          COUNT(*) FILTER (WHERE status = 'PAPER_OPEN')::text AS open_count,
          COUNT(*) FILTER (WHERE status = 'PAPER_CLOSED' AND COALESCE(realized_pnl_pct, 0) > 0)::text AS winners,
          COUNT(*) FILTER (WHERE status = 'PAPER_CLOSED' AND COALESCE(realized_pnl_pct, 0) < 0)::text AS losers,
          COALESCE(AVG(realized_pnl_pct) FILTER (WHERE status = 'PAPER_CLOSED'), 0)::text AS avg_realized_pnl_pct,
          COALESCE(SUM(realized_pnl_pct) FILTER (WHERE status = 'PAPER_CLOSED'), 0)::text AS total_realized_pnl_pct,
          MAX(realized_pnl_pct) FILTER (WHERE status = 'PAPER_CLOSED')::text AS best_trade_pct,
          MIN(realized_pnl_pct) FILTER (WHERE status = 'PAPER_CLOSED')::text AS worst_trade_pct
        FROM sentiment_paper_trades
        `,
      )
    : Promise.resolve({ rows: [emptyPerformance()] as SentimentPerformance[] });

  const [latest, history, paperTrades, latestSnapshots, performance] = await Promise.all([
    latestQuery,
    historyQuery,
    tradesQuery,
    snapshotsQuery,
    performanceQuery,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    latestDate,
    latest: latest.rows,
    history: history.rows,
    paperTrades: paperTrades.rows,
    latestSnapshots: latestSnapshots.rows,
    performance: performance.rows[0] ?? emptyPerformance(),
  };
}
