// Client for the DOLZ sniper's API (strike-bot repo, dolz_sniper/). The sniper
// runs in its own Railway project with its own database; the dashboard reads
// its status and saves its settings over HTTP, forwarding the owner's token.

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

export const SNIPER_RARITIES = ["Limited", "Rare", "Epic", "Legendary"] as const;
export const SNIPER_MAX_RULES = 10;

export type DolzSniperRule = {
  enabled: boolean;
  /** Card number such as "g0177"; null means any card. */
  card: string | null;
  card_name?: string | null;
  /** Minimum rarity: Rare also covers Epic and Legendary. Null means any rarity. */
  min_rarity: (typeof SNIPER_RARITIES)[number] | null;
  max_price: number;
  max_serial?: number | null;
};

export type DolzSniperConfig = {
  enabled: boolean;
  dry_run: boolean;
  daily_budget_usd: number;
  max_buys_per_day: number;
  rules: DolzSniperRule[];
};

export type DolzSniperStatus = {
  wallet: string | null;
  heartbeat: string | null;
  balances: { usdc?: number; pol?: number };
  config: DolzSniperConfig;
  configUpdatedAt: string | null;
  configSeenAt: string | null;
  spentTodayUsd: number;
  boughtToday: number;
  boughtTotal: number;
  spentTotalUsd: number;
  purchases: DolzSniperPurchase[];
  events: DolzSniperEvent[];
};

/** Public URL of the sniper service; DOLZ_SNIPER_URL overrides it. */
const DEFAULT_SNIPER_URL = "https://dolz-sniper-production.up.railway.app";

function sniperUrl(): string | null {
  const url = (process.env.DOLZ_SNIPER_URL || DEFAULT_SNIPER_URL).trim().replace(/\/$/, "");
  return url || null;
}

type SniperResponse<T> = { ok: boolean; error?: string } & T;

async function callSniper<T>(path: string, token: string, init?: RequestInit): Promise<SniperResponse<T>> {
  const base = sniperUrl();
  if (!base) throw new Error("Sniper ešte nie je nasadený.");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "X-Dolz-Token": token, ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({ ok: false, error: `Sniper odpovedal HTTP ${response.status}` }))) as SniperResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || `Sniper odpovedal HTTP ${response.status}`);
  return json;
}

/** Status for the Sniper tab, or null when the sniper is not deployed or unreachable. */
export async function getSniperStatus(token: string): Promise<DolzSniperStatus | null> {
  if (!sniperUrl()) return null;
  try {
    return (await callSniper<{ sniper: DolzSniperStatus }>("/status", token)).sniper;
  } catch {
    return null;
  }
}

/** The sniper's hot wallet, so the portfolio includes the cards it buys. */
export async function getSniperWallet(token: string): Promise<string | null> {
  const wallet = (await getSniperStatus(token))?.wallet?.toLowerCase() ?? null;
  return wallet && /^0x[0-9a-f]{40}$/.test(wallet) ? wallet : null;
}

/** Save settings; the sniper validates them and answers with what it stored. */
export async function saveSniperConfig(token: string, config: unknown): Promise<{ config: DolzSniperConfig; updatedAt: string }> {
  const json = await callSniper<{ config: DolzSniperConfig; updatedAt: string }>("/config", token, {
    method: "POST",
    body: JSON.stringify(config),
  });
  return { config: json.config, updatedAt: json.updatedAt };
}

/** Ask the sniper to re-check every active listing against the rules now. */
export async function requestSniperRescan(token: string): Promise<void> {
  await callSniper<Record<string, never>>("/rescan", token, { method: "POST", body: "{}" });
}

export function isSniperConfigured(): boolean {
  return !!sniperUrl();
}
