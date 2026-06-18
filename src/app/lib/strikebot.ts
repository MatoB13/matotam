import { createHash, createPrivateKey, randomUUID, sign as ed25519Sign } from "crypto";
import { Pool } from "pg";

export type StrikebotAsset = "ADA" | "BTC" | "ZEC";
export type StrikebotBotMode = "live" | "hft";


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
  entry_premium_5m_delta_threshold?: string | number | null;
  entry_ada15_adverse_max_pct?: string | number | null;
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
  symbol?: string | null;
  config_json: unknown;
};

const SUPPORTED_ASSETS: StrikebotAsset[] = ["ADA", "BTC", "ZEC"];

type StrikebotTableSet = {
  mode: StrikebotBotMode;
  runtimeEvents: string;
  liveOrders: string;
  livePositions: string;
  runtimeConfig: string;
  includeDryRunRows: boolean;
};

function normalizeBotMode(value: string | null | undefined): StrikebotBotMode {
  return String(value || "live").trim().toLowerCase() === "hft" ? "hft" : "live";
}

function getTableSet(botModeInput?: string | null): StrikebotTableSet {
  const mode = normalizeBotMode(botModeInput);

  if (mode === "hft") {
    return {
      mode,
      runtimeEvents: "hft_runtime_events",
      liveOrders: "hft_live_orders",
      livePositions: "hft_live_positions",
      runtimeConfig: "hft_runtime_config",
      includeDryRunRows: true,
    };
  }

  return {
    mode: "live",
    runtimeEvents: "live_runtime_events",
    liveOrders: "live_orders",
    livePositions: "live_positions",
    runtimeConfig: "bot_runtime_config",
    includeDryRunRows: false,
  };
}


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

function getConfigNumber(configJson: unknown, key: string): string | number | null {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) return null;

  const value = (configJson as Record<string, unknown>)[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return value;

  return null;
}

function withDerivedRuntimeConfig(
  row: StrikebotRuntimeConfig | null | undefined,
): StrikebotRuntimeConfig | null {
  if (!row) return null;

  return {
    ...row,
    entry_premium_5m_delta_threshold:
      row.entry_premium_5m_delta_threshold ??
      getConfigNumber(row.config_json, "entry_premium_5m_delta_threshold") ??
      getConfigNumber(row.config_json, "ENTRY_PREMIUM_5M_DELTA_THRESHOLD"),
    entry_ada15_adverse_max_pct:
      row.entry_ada15_adverse_max_pct ??
      getConfigNumber(row.config_json, "entry_ada15_adverse_max_pct") ??
      getConfigNumber(row.config_json, "ENTRY_ADA15_ADVERSE_MAX_PCT"),
  };
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


type StrikebotExchangePayload = Record<string, unknown> | unknown[];
type StrikebotExchangeState = {
  recentOrders: StrikebotOrder[];
  recentPositions: StrikebotPosition[];
  orderSummary: StrikebotOrderSummary | null;
  positionStats: PgPositionStatsRow | null;
  orderCount24h: number | null;
  source: "strike" | "db";
};

type StrikebotApiCredentials = {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
};

function getStrikeEnv(tables: StrikebotTableSet, name: string): string | undefined {
  if (tables.mode === "hft") {
    return process.env[`HFT_${name}`] || process.env[name];
  }

  return process.env[name];
}

function getStrikeApiCredentials(tables: StrikebotTableSet): StrikebotApiCredentials | null {
  const publicKey = getStrikeEnv(tables, "STRIKE_API_PUBLIC_KEY");
  const privateKey = getStrikeEnv(tables, "STRIKE_API_PRIVATE_KEY");

  if (!publicKey || !privateKey) return null;

  return {
    baseUrl: getStrikeEnv(tables, "STRIKE_API_BASE_URL") || "https://api.strikefinance.org",
    publicKey,
    privateKey,
  };
}

function signedStrikeHeaders(
  credentials: StrikebotApiCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body = "",
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const payload = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;

  let privateKeyBytes = Buffer.from(credentials.privateKey, "hex");
  if (privateKeyBytes.length === 64) {
    privateKeyBytes = privateKeyBytes.subarray(0, 32);
  }

  if (privateKeyBytes.length !== 32) {
    throw new Error("Strike private key must be a 32-byte seed or a 64-byte expanded key in hex.");
  }

  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const keyObject = createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, privateKeyBytes]),
    format: "der",
    type: "pkcs8",
  });
  const signature = ed25519Sign(null, Buffer.from(payload), keyObject).toString("hex");

  return {
    "Content-Type": "application/json",
    "X-API-Wallet-Public-Key": credentials.publicKey,
    "X-API-Wallet-Signature": signature,
    "X-API-Wallet-Timestamp": timestamp,
    "X-API-Wallet-Nonce": nonce,
  };
}

async function strikeSignedGet(
  credentials: StrikebotApiCredentials,
  path: string,
): Promise<StrikebotExchangePayload> {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: "GET",
    headers: signedStrikeHeaders(credentials, "GET", path),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Strike API ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  }

  if (payload && (typeof payload === "object" || Array.isArray(payload))) {
    return payload as StrikebotExchangePayload;
  }

  return {};
}

function iterExchangeRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => iterExchangeRecords(item));
  }

  const record = payload as Record<string, unknown>;
  const children = Object.values(record).flatMap((value) => iterExchangeRecords(value));
  return [record, ...children];
}

function firstNestedValue(payload: unknown, keys: string[]): unknown {
  if (!payload || typeof payload !== "object") return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = firstNestedValue(item, keys);
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }

  for (const value of Object.values(record)) {
    const nested = firstNestedValue(value, keys);
    if (nested !== null && nested !== undefined && nested !== "") return nested;
  }

  return null;
}

function firstNumber(payload: unknown, keys: string[]): number | null {
  const value = firstNestedValue(payload, keys);
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstString(payload: unknown, keys: string[]): string | null {
  const value = firstNestedValue(payload, keys);
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizeExchangeSide(value: unknown): "LONG" | "SHORT" | "" {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "long" || text === "buy") return "LONG";
  if (text === "short" || text === "sell") return "SHORT";
  return "";
}

function sideFromSignedSize(value: unknown): "LONG" | "SHORT" | "" {
  const size = Number(value);
  if (!Number.isFinite(size)) return "";
  if (size > 0) return "LONG";
  if (size < 0) return "SHORT";
  return "";
}

function stableNumericId(prefix: number, value: unknown, index: number): number {
  const text = `${String(value ?? "")}:${index}`;
  let hash = prefix;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 900_000_000;
  }
  return Math.abs(hash) + prefix;
}

function parseExchangeDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return new Date().toISOString();

  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const raw = Number(value);
    if (Number.isFinite(raw)) {
      const ms = raw > 10_000_000_000 ? raw : raw * 1000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString();

  return new Date().toISOString();
}

function exchangeRecordTime(record: unknown): string {
  return parseExchangeDate(firstNestedValue(record, [
    "created_at",
    "createdAt",
    "CreateTime",
    "created_time",
    "createdTime",
    "updated_at",
    "updatedAt",
    "timestamp",
    "time",
    "Time",
    "ts",
  ]));
}

function extractExchangeOrderId(record: unknown): string | null {
  return firstString(record, ["order_id", "OrderID", "OrderId", "id", "ID"]);
}

function extractExchangeClientOrderId(record: unknown): string | null {
  return firstString(record, ["client_order_id", "ClientOrderID", "clientOrderId", "client_id", "clientId"]);
}

function extractExchangeStatus(record: unknown): string {
  return firstString(record, ["status", "Status", "order_status", "OrderStatus"]) ?? "filled";
}

function extractExchangeAvgPrice(record: unknown): number | null {
  const value = firstNumber(record, [
    "avg_price",
    "AvgPrice",
    "average_price",
    "AveragePrice",
    "filled_price",
    "FilledPrice",
    "price",
    "Price",
  ]);
  return value !== null && value > 0 ? value : null;
}

function extractExchangeSize(record: unknown): number | null {
  const value = firstNumber(record, [
    "filled",
    "Filled",
    "filled_size",
    "FilledSize",
    "executed_size",
    "ExecutedSize",
    "size",
    "Size",
    "quantity",
    "Quantity",
    "amount",
    "Amount",
  ]);
  return value === null ? null : Math.abs(value);
}

function extractExchangeFeeUsd(record: unknown): number | null {
  const value = firstNumber(record, [
    "fee",
    "Fee",
    "fee_usd",
    "FeeUsd",
    "feeUSD",
    "commission",
    "Commission",
  ]);
  return value === null ? null : Math.abs(value);
}

function extractExchangeRealizedPnlUsd(record: unknown): number | null {
  return firstNumber(record, [
    "realized_pnl",
    "realizedPnl",
    "realized_pnl_usd",
    "realizedPnlUsd",
    "RealizedPnl",
    "realised_pnl",
    "realisedPnl",
    "pnl",
    "PnL",
    "profit_loss",
    "profitLoss",
  ]);
}

function extractExchangePositions(payload: unknown, symbol: string): Record<string, unknown>[] {
  const records = iterExchangeRecords(payload);
  return records.filter((record) => {
    const recordSymbol = firstString(record, ["symbol", "Symbol"]);
    if (recordSymbol && recordSymbol.toUpperCase() !== symbol.toUpperCase()) return false;

    const size = firstNumber(record, ["size", "Size", "quantity", "Quantity"]);
    const side = normalizeExchangeSide(firstNestedValue(record, ["side", "Side"])) || sideFromSignedSize(size);
    return Boolean(side) && size !== null && Math.abs(size) > 0;
  });
}

function exchangePositionToDashboardPosition(
  record: Record<string, unknown>,
  asset: StrikebotAsset,
  configName: string | null,
  runtimeConfig: StrikebotRuntimeConfig | null,
  index: number,
): StrikebotPosition {
  const size = firstNumber(record, ["size", "Size", "quantity", "Quantity"]);
  const side = normalizeExchangeSide(firstNestedValue(record, ["side", "Side"])) || sideFromSignedSize(size) || "LONG";
  const entryPrice = firstNumber(record, ["entry_price", "entryPrice", "EntryPrice", "avg_entry_price", "average_entry_price", "price", "Price"]);
  const markPrice = firstNumber(record, ["mark_price", "markPrice", "MarkPrice", "current_price", "currentPrice", "currentPrice"]);
  const marginUsd = firstNumber(record, ["margin", "Margin", "margin_usd", "marginUsd", "notional", "Notional", "value", "Value"]);
  const leverage = firstNumber(record, ["leverage", "Leverage"]) ?? toFiniteNumber(runtimeConfig?.leverage);
  const upnlUsd = firstNumber(record, ["upnl", "uPnl", "UPNL", "unrealized_pnl", "unrealizedPnl", "unrealized_pnl_usd", "unrealizedPnlUsd"]);
  const pnlPct = entryPrice && markPrice
    ? side === "LONG"
      ? ((markPrice / entryPrice) - 1) * 100
      : ((entryPrice / markPrice) - 1) * 100
    : null;

  return {
    id: stableNumericId(800_000_000, extractExchangeOrderId(record) ?? firstString(record, ["position_id", "positionId", "id", "ID"]), index),
    asset,
    run_name: runtimeConfig?.run_name ?? null,
    config_name: runtimeConfig?.config_name ?? configName,
    created_at: exchangeRecordTime(record),
    updated_at: new Date().toISOString(),
    status: "OPEN",
    side,
    entry_price: entryPrice,
    exit_price: null,
    pnl_pct: pnlPct,
    pnl_usd: upnlUsd,
    exit_reason: null,
    size_usd: marginUsd ?? toFiniteNumber(runtimeConfig?.position_size_usd),
    leverage,
    dry_run: false,
    trading_enabled: true,
  };
}

function exchangeOrderToDashboardOrder(
  record: Record<string, unknown>,
  asset: StrikebotAsset,
  configName: string | null,
  runtimeConfig: StrikebotRuntimeConfig | null,
  index: number,
): StrikebotOrder {
  const side = normalizeExchangeSide(firstNestedValue(record, ["side", "Side"])) || "";

  return {
    id: stableNumericId(700_000_000, extractExchangeOrderId(record) ?? extractExchangeClientOrderId(record), index),
    asset,
    run_name: runtimeConfig?.run_name ?? null,
    config_name: runtimeConfig?.config_name ?? configName,
    created_at: exchangeRecordTime(record),
    status: extractExchangeStatus(record).toUpperCase(),
    side: side || "—",
    order_type: firstString(record, ["type", "Type", "order_type", "orderType"]),
    price: extractExchangeAvgPrice(record),
    premium_pct: null,
    premium_z: null,
    size_usd: (() => {
      const price = extractExchangeAvgPrice(record);
      const size = extractExchangeSize(record);
      return price !== null && size !== null ? price * size : null;
    })(),
    leverage: toFiniteNumber(runtimeConfig?.leverage),
    dry_run: false,
    trading_enabled: true,
  };
}

function fillRecordToClosedPosition(
  record: Record<string, unknown>,
  asset: StrikebotAsset,
  configName: string | null,
  runtimeConfig: StrikebotRuntimeConfig | null,
  index: number,
): StrikebotPosition | null {
  const realizedPnl = extractExchangeRealizedPnlUsd(record);
  if (realizedPnl === null) return null;

  const sideFromOrder = normalizeExchangeSide(firstNestedValue(record, ["side", "Side"]));
  const positionSide = sideFromOrder === "LONG" ? "SHORT" : sideFromOrder === "SHORT" ? "LONG" : "—";
  const price = extractExchangeAvgPrice(record);
  const fee = extractExchangeFeeUsd(record) ?? 0;
  const time = exchangeRecordTime(record);

  return {
    id: stableNumericId(900_000_000, extractExchangeOrderId(record) ?? extractExchangeClientOrderId(record), index),
    asset,
    run_name: runtimeConfig?.run_name ?? null,
    config_name: runtimeConfig?.config_name ?? configName,
    created_at: time,
    updated_at: time,
    status: "CLOSED",
    side: positionSide,
    entry_price: null,
    exit_price: price,
    pnl_pct: null,
    pnl_usd: realizedPnl,
    exit_reason: fee > 0 ? `STRIKE_REALIZED_PNL_FEE_${fee.toFixed(6)}` : "STRIKE_REALIZED_PNL",
    size_usd: (() => {
      const size = extractExchangeSize(record);
      return price !== null && size !== null ? price * size : null;
    })(),
    leverage: toFiniteNumber(runtimeConfig?.leverage),
    dry_run: false,
    trading_enabled: true,
  };
}

function isWithinLast24Hours(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= 24 * 60 * 60 * 1000;
}

function buildExchangeSummary(
  configName: string | null,
  orders: StrikebotOrder[],
  closedPositions: StrikebotPosition[],
): { orderSummary: StrikebotOrderSummary; positionStats: PgPositionStatsRow; orderCount24h: number } {
  const orders24h = orders.filter((order) => isWithinLast24Hours(order.created_at));
  const closed24h = closedPositions.filter((position) => isWithinLast24Hours(position.updated_at));
  const pnlTotal = closedPositions.reduce((sum, position) => sum + (toFiniteNumber(position.pnl_usd) ?? 0), 0);
  const pnl24h = closed24h.reduce((sum, position) => sum + (toFiniteNumber(position.pnl_usd) ?? 0), 0);
  const winnersTotal = closedPositions.filter((position) => (toFiniteNumber(position.pnl_usd) ?? 0) > 0).length;
  const winners24h = closed24h.filter((position) => (toFiniteNumber(position.pnl_usd) ?? 0) > 0).length;
  const losers24h = closed24h.filter((position) => (toFiniteNumber(position.pnl_usd) ?? 0) < 0).length;

  return {
    orderCount24h: orders24h.length,
    orderSummary: {
      config_name: configName,
      orders_total: String(orders.length),
      orders_24h: String(orders24h.length),
      closed_total: String(closedPositions.length),
      closed_24h: String(closed24h.length),
      winners_total: String(winnersTotal),
      winners_24h: String(winners24h),
      pnl_total: String(pnlTotal),
      pnl_24h: String(pnl24h),
    },
    positionStats: {
      open_positions: "0",
      closed_positions: String(closed24h.length),
      winners: String(winners24h),
      losers: String(losers24h),
      total_pnl_usd: String(pnl24h),
      avg_pnl_usd: closed24h.length > 0 ? String(pnl24h / closed24h.length) : "0",
    },
  };
}

async function fetchStrikeExchangeState(
  asset: StrikebotAsset,
  tables: StrikebotTableSet,
  runtimeConfig: StrikebotRuntimeConfig | null,
  configName: string | null,
): Promise<StrikebotExchangeState | null> {
  const credentials = getStrikeApiCredentials(tables);
  if (!credentials) return null;

  const symbol = String(runtimeConfig?.symbol || getStrikeEnv(tables, "STRIKE_API_SYMBOL") || `${asset}-USD`).trim().toUpperCase();
  const limit = Number(getStrikeEnv(tables, "STRIKE_DASHBOARD_HISTORY_LIMIT") || 100);

  try {
    const [positionsPayload, ordersPayload, fillsPayload] = await Promise.all([
      strikeSignedGet(credentials, `/v2/positions?${new URLSearchParams({ symbol }).toString()}`),
      strikeSignedGet(credentials, `/v2/history/order?${new URLSearchParams({ symbol, limit: String(limit) }).toString()}`),
      strikeSignedGet(credentials, `/v2/history/fill?${new URLSearchParams({ symbol, limit: String(limit) }).toString()}`),
    ]);

    const exchangeOpenPositions = extractExchangePositions(positionsPayload, symbol).map((record, index) =>
      exchangePositionToDashboardPosition(record, asset, configName, runtimeConfig, index),
    );
    const exchangeOrders = iterExchangeRecords(ordersPayload)
      .filter((record) => extractExchangeOrderId(record) || extractExchangeClientOrderId(record))
      .map((record, index) => exchangeOrderToDashboardOrder(record, asset, configName, runtimeConfig, index));
    const exchangeClosedPositions = iterExchangeRecords(fillsPayload)
      .map((record, index) => fillRecordToClosedPosition(record, asset, configName, runtimeConfig, index))
      .filter((position): position is StrikebotPosition => position !== null);

    const summary = buildExchangeSummary(configName, exchangeOrders, exchangeClosedPositions);

    return {
      recentOrders: exchangeOrders,
      recentPositions: [...exchangeOpenPositions, ...exchangeClosedPositions],
      orderSummary: exchangeClosedPositions.length > 0 || exchangeOrders.length > 0 ? summary.orderSummary : null,
      positionStats: exchangeClosedPositions.length > 0 ? summary.positionStats : null,
      orderCount24h: exchangeOrders.length > 0 ? summary.orderCount24h : null,
      source: "strike",
    };
  } catch (error) {
    console.warn("Strike dashboard API overlay failed; falling back to Postgres dashboard data.", error);
    return null;
  }
}

export async function getStrikebotStatus(assetInput?: string | null, botModeInput?: string | null) {
  const asset = normalizeAsset(assetInput);
  const pool = getPool();
  const tables = getTableSet(botModeInput);
  const isLiveAsset = asset === "ADA";

  const currentConfigResult = isLiveAsset
    ? await pool.query<PgConfigNameRow>(
        `
        SELECT config_name
        FROM (
          SELECT config_name, created_at FROM ${tables.runtimeEvents} WHERE config_name IS NOT NULL AND asset = $1
          UNION ALL
          SELECT config_name, created_at FROM ${tables.liveOrders} WHERE config_name IS NOT NULL AND asset = $1
          UNION ALL
          SELECT config_name, created_at FROM ${tables.livePositions} WHERE config_name IS NOT NULL AND asset = $1
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
    SELECT
      id,
      asset,
      ts,
      premium_pct,
      COALESCE(mark_price, index_price, binance_adausdt) AS binance_adausdt,
      mark_price,
      index_price,
      funding_rate
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
      botMode: tables.mode,
      availableBotModes: ["live", "hft"],
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

  const summaryDryRunPredicate = tables.includeDryRunRows ? "" : "AND dry_run = FALSE";
  const summaryTradingPredicate = tables.includeDryRunRows ? "" : "AND trading_enabled = TRUE";

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
      FROM ${tables.runtimeEvents}
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
      FROM ${tables.runtimeEvents}
      WHERE asset = $1
      ORDER BY id DESC
      LIMIT 5000
      `,
      [asset],
    ),
    pool.query<PgEventCountRow>(
      `
      SELECT event_type, COUNT(*)::text AS count
      FROM ${tables.runtimeEvents}
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
      FROM ${tables.liveOrders}
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
      FROM ${tables.livePositions}
      WHERE asset = $1
      ORDER BY id DESC
      LIMIT 1000
      `,
      [asset],
    ),
    pool.query<PgCountRow>(
      `
      SELECT COUNT(*)::text AS count
      FROM ${tables.liveOrders}
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
      FROM ${tables.livePositions}
      WHERE asset = $1
      `,
      [asset],
    ),
    pool.query<StrikebotOrderSummary>(
      `
      WITH order_agg AS (
        SELECT
          COUNT(*) FILTER (
            WHERE status NOT LIKE 'STALE_%'
              AND status NOT ILIKE '%FAILED%'
              AND status NOT ILIKE '%REJECTED%'
              AND status NOT ILIKE '%CANCEL%'
              AND NOT (status = 'LIVE_UNCONFIRMED' AND created_at < NOW() - INTERVAL '10 minutes')
          )::text AS orders_total,
          COUNT(*) FILTER (
            WHERE created_at >= NOW() - INTERVAL '24 hours'
              AND status NOT LIKE 'STALE_%'
              AND status NOT ILIKE '%FAILED%'
              AND status NOT ILIKE '%REJECTED%'
              AND status NOT ILIKE '%CANCEL%'
              AND NOT (status = 'LIVE_UNCONFIRMED' AND created_at < NOW() - INTERVAL '10 minutes')
          )::text AS orders_24h
        FROM ${tables.liveOrders}
        WHERE asset = $2
          AND ($1::text IS NULL OR config_name = $1::text)
          ${summaryDryRunPredicate}
          ${summaryTradingPredicate}
      ),
      position_agg AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'CLOSED')::text AS closed_total,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours')::text AS closed_24h,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND COALESCE(pnl_usd, 0) > 0)::text AS winners_total,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours' AND COALESCE(pnl_usd, 0) > 0)::text AS winners_24h,
          COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED'), 0)::text AS pnl_total,
          COALESCE(SUM(pnl_usd) FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '24 hours'), 0)::text AS pnl_24h
        FROM ${tables.livePositions}
        WHERE asset = $2
          AND ($1::text IS NULL OR config_name = $1::text)
          ${summaryDryRunPredicate}
          ${summaryTradingPredicate}
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
          symbol,
          config_json
        FROM ${tables.runtimeConfig}
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

  const runtimeConfigRow = withDerivedRuntimeConfig(runtimeConfig.rows[0] ?? null);
  const effectiveConfigName = runtimeConfigRow?.config_name ?? currentConfigName;
  const exchangeState = await fetchStrikeExchangeState(asset, tables, runtimeConfigRow, effectiveConfigName);
  const recentOrdersRows = exchangeState?.recentOrders?.length ? exchangeState.recentOrders : recentOrders.rows;
  const recentPositionsRows = exchangeState?.recentPositions?.length ? exchangeState.recentPositions : recentPositions.rows;
  const positionStatsRow = exchangeState?.positionStats ?? positionStats.rows[0] ?? null;
  const orderSummaryRow = exchangeState?.orderSummary ?? orderSummary.rows[0] ?? emptyOrderSummary(effectiveConfigName);
  const orderCountValue = exchangeState?.orderCount24h ?? Number(orderCount.rows[0]?.count ?? 0);

  return {
    asset,
    botMode: tables.mode,
    availableBotModes: ["live", "hft"],
    availableAssets: SUPPORTED_ASSETS,
    generatedAt: new Date().toISOString(),
    latestSnapshot: latestSnapshot.rows[0] ?? null,
    recentEvents: recentEvents.rows,
    allEvents: allEvents.rows,
    eventCounts: eventCounts.rows,
    recentOrders: recentOrdersRows,
    recentPositions: recentPositionsRows,
    orderCount: orderCountValue,
    positionStats: positionStatsRow,
    currentConfigName: effectiveConfigName,
    runtimeConfig: runtimeConfigRow,
    orderSummary: orderSummaryRow,
    collectorState,
    burstSummary: computeBurstSummaryFromSnapshots(burstSnapshots.rows),
  };
}
