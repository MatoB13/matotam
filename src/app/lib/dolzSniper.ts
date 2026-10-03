// Read-only view of the DOLZ sniper (strike-bot repo, dolz_sniper.py), which
// writes its state into the strike bot's Postgres database.

import { Pool } from "pg";

export type DolzSniperPurchase = {
  id: number;
  created_at: string;
  token_id: string;
  price_usd: string;
  rule_name: string | null;
  card_name: string | null;
  card_number: string | null;
  tier: string | null;
  serial: number | null;
  rarity: string | null;
  status: string;
  tx_hash: string | null;
  error: string | null;
  dry_run: boolean;
};

export type DolzSniperEvent = {
  id: number;
  created_at: string;
  event_type: string;
  message: string | null;
};

export type DolzSniperStatus = {
  wallet: string | null;
  heartbeat: string | null;
  rules: { name: string; max_price: number; [key: string]: unknown }[];
  limits: { daily_budget_usd?: number; max_price_usd?: number; max_buys_per_day?: number; dry_run?: boolean; enabled?: boolean };
  spentTodayUsd: number;
  boughtToday: number;
  boughtTotal: number;
  spentTotalUsd: number;
  purchases: DolzSniperPurchase[];
  events: DolzSniperEvent[];
};

const globalForPg = globalThis as unknown as { dolzSniperPool?: Pool };

function getPool(): Pool | null {
  const connectionString = process.env.STRIKEBOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!globalForPg.dolzSniperPool) {
    globalForPg.dolzSniperPool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalForPg.dolzSniperPool;
}

/** The sniper's hot wallet, so the portfolio includes what it buys. */
export async function getSniperWallet(): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{ value: string }>("SELECT value FROM dolz_sniper_state WHERE key = 'wallet'");
    const wallet = rows[0]?.value?.toLowerCase() ?? null;
    return wallet && /^0x[0-9a-f]{40}$/.test(wallet) ? wallet : null;
  } catch {
    return null; // tables do not exist until the sniper has run once
  }
}

export async function getSniperStatus(): Promise<DolzSniperStatus | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const [state, purchases, events, today, total] = await Promise.all([
      pool.query<{ key: string; value: string }>("SELECT key, value FROM dolz_sniper_state"),
      pool.query<DolzSniperPurchase>(
        `SELECT id, created_at, token_id::text, price_usd::text, rule_name, card_name, card_number, tier, serial, rarity, status, tx_hash, error, dry_run
         FROM dolz_sniper_purchases ORDER BY id DESC LIMIT 60`,
      ),
      pool.query<DolzSniperEvent>("SELECT id, created_at, event_type, message FROM dolz_sniper_events ORDER BY id DESC LIMIT 40"),
      pool.query<{ spent: string; count: string }>(
        `SELECT COALESCE(SUM(price_usd), 0)::text AS spent, COUNT(*)::text AS count FROM dolz_sniper_purchases
         WHERE status = 'bought' AND dry_run = FALSE AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      ),
      pool.query<{ spent: string; count: string }>(
        "SELECT COALESCE(SUM(price_usd), 0)::text AS spent, COUNT(*)::text AS count FROM dolz_sniper_purchases WHERE status = 'bought' AND dry_run = FALSE",
      ),
    ]);
    const values = Object.fromEntries(state.rows.map((row) => [row.key, row.value]));
    let rules: DolzSniperStatus["rules"] = [];
    try {
      rules = values.rules ? JSON.parse(values.rules) : [];
    } catch {
      rules = [];
    }
    let limits: DolzSniperStatus["limits"] = {};
    try {
      limits = values.limits ? JSON.parse(values.limits) : {};
    } catch {
      limits = {};
    }
    return {
      wallet: values.wallet ?? null,
      limits,
      heartbeat: values.heartbeat ?? null,
      rules,
      spentTodayUsd: Number(today.rows[0]?.spent ?? 0),
      boughtToday: Number(today.rows[0]?.count ?? 0),
      spentTotalUsd: Number(total.rows[0]?.spent ?? 0),
      boughtTotal: Number(total.rows[0]?.count ?? 0),
      purchases: purchases.rows,
      events: events.rows,
    };
  } catch {
    return null;
  }
}
