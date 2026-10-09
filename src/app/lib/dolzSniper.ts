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
export const SNIPER_MAX_RULES = 20;

export type DolzSniperRule = {
  enabled: boolean;
  /** Card number such as "g0177"; null means any card. */
  card: string | null;
  card_name?: string | null;
  /** Minimum rarity: Rare also covers Epic and Legendary. Null means any rarity. */
  min_rarity: (typeof SNIPER_RARITIES)[number] | null;
  /** Season as cards carry it ("1" … "11", "Special Edition", "Off-Season"); null means any season. */
  season?: string | null;
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

/** A card number the sniper has seen on the market, with its name. */
export type DolzSniperCatalogCard = { card: string; name: string | null; season: string | null; seen: number };

export type DolzSniperQuote = {
  token_id: string;
  card: { name: string | null; card: string | null; tier: string | null; serial: number | null; rarity: string | null; season: string | null; image?: string | null };
  listing: { seller: string; price_raw: string; currency: string; price_usd: number | null; expiration: number | null; active: boolean } | null;
  maxPriceUsd: number;
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
  catalog?: DolzSniperCatalogCard[];
};

/** Public URL of the sniper service; DOLZ_SNIPER_URL overrides it. */
const DEFAULT_SNIPER_URL = "https://dolz-sniper-production.up.railway.app";

function sniperUrl(): string | null {
  const url = (process.env.DOLZ_SNIPER_URL || DEFAULT_SNIPER_URL).trim().replace(/\/$/, "");
  return url || null;
}

type SniperResponse<T> = { ok: boolean; error?: string } & T;

/**
 * The dashboard token, plus for actions that move USDC or cards the user's action password
 * (the sniper refuses those without it; the token alone travels in the page URL).
 */
export type SniperAuth = string | { token: string; password?: string | null };

async function callSniper<T>(path: string, auth: SniperAuth, init?: RequestInit, timeoutMs = 10_000): Promise<SniperResponse<T>> {
  const base = sniperUrl();
  if (!base) throw new Error("Sniper ešte nie je nasadený.");
  const { token, password } = typeof auth === "string" ? { token: auth, password: null } : auth;
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Dolz-Token": token,
      ...(password ? { "X-Dolz-Password": password } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await response.json().catch(() => ({ ok: false, error: `Sniper odpovedal HTTP ${response.status}` }))) as SniperResponse<T>;
  if (!response.ok || !json.ok) throw new Error(json.error || `Sniper odpovedal HTTP ${response.status}`);
  return json;
}

/** Status for the Sniper tab, or null when the sniper is not deployed or unreachable. */
export async function getSniperStatus(token: SniperAuth): Promise<DolzSniperStatus | null> {
  if (!sniperUrl()) return null;
  try {
    return (await callSniper<{ sniper: DolzSniperStatus }>("/status", token)).sniper;
  } catch {
    return null;
  }
}

/** The sniper's hot wallet, so the portfolio includes the cards it buys. */
export async function getSniperWallet(token: SniperAuth): Promise<string | null> {
  const wallet = (await getSniperStatus(token))?.wallet?.toLowerCase() ?? null;
  return wallet && /^0x[0-9a-f]{40}$/.test(wallet) ? wallet : null;
}

/** Save settings; the sniper validates them and answers with what it stored. */
export async function saveSniperConfig(token: SniperAuth, config: unknown): Promise<{ config: DolzSniperConfig; updatedAt: string }> {
  const json = await callSniper<{ config: DolzSniperConfig; updatedAt: string }>("/config", token, {
    method: "POST",
    body: JSON.stringify(config),
  });
  return { config: json.config, updatedAt: json.updatedAt };
}

/** Ask the sniper to re-check every active listing against the rules now. */
export async function requestSniperRescan(token: SniperAuth): Promise<void> {
  await callSniper<Record<string, never>>("/rescan", token, { method: "POST", body: "{}" });
}

export type DolzSellListing = {
  price_usd: number | null;
  currency: string;
  /** Unix seconds. */
  expiration: number | null;
  active: boolean;
  tx: string;
};

export type DolzSellOffer = {
  offerer: string;
  /** Exact on-chain amount; accepting sends it back so a changed offer is refused. */
  price_raw: string;
  currency: string;
  price_usd: number | null;
  /** Unix seconds. */
  expiration: number | null;
  /** Whether the offerer has the balance and allowance to pay it now (null: unknown). */
  fundable: boolean | null;
};

export type DolzSellCard = {
  token_id: string;
  name: string | null;
  card: string | null;
  tier: string | null;
  serial: number | null;
  rarity: string | null;
  season: string | null;
  image: string | null;
  bought_usd: number | null;
  bought_at: string | null;
  /** Where the purchase price comes from: the sniper's own buy, the winning auction bid, or the portfolio. */
  bought_via?: "sniper" | "aukcia" | "portfólio" | null;
  listing: DolzSellListing | null;
  /** Open offers from buyers, highest first. */
  offers?: DolzSellOffer[];
  /** Market median for this card and tier (added by the dashboard). */
  market?: { usd: number; source: string; sales: number } | null;
};

export type DolzSellInventory = {
  wallet: string;
  durations: number[];
  /** Wallets the sniper may move cards to (fixed on the sniper side). */
  transferTargets?: string[];
  /** Platform + collection fee the seller pays, in basis points. */
  sellerFeeBps?: number | null;
  cards: DolzSellCard[];
};

export type DolzSellResult = { token_id: string; ok: boolean; tx?: string; action?: string; error?: string };

/** Cards in the sniper's hot wallet with their own market listings. */
export async function getSniperInventory(token: SniperAuth): Promise<DolzSellInventory> {
  return (await callSniper<{ inventory: DolzSellInventory }>("/inventory", token, undefined, 60_000)).inventory;
}

/** List or reprice cards; the sniper sends one transaction per card and waits for each. */
export async function listSniperCards(token: SniperAuth, items: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>("/list", token, { method: "POST", body: JSON.stringify({ items }) }, 280_000);
  return json.results;
}

export async function cancelSniperListings(token: SniperAuth, tokenIds: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>("/cancel", token, { method: "POST", body: JSON.stringify({ token_ids: tokenIds }) }, 280_000);
  return json.results;
}

/** Move cards to one of the sniper's allowed wallets; open listings are cancelled first. */
export async function transferSniperCards(token: SniperAuth, tokenIds: unknown, to: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>("/transfer", token, { method: "POST", body: JSON.stringify({ token_ids: tokenIds, to }) }, 280_000);
  return json.results;
}

/** Accept (sell for the offer) or reject one offer on a hot-wallet card. */
export async function answerSniperOffer(token: SniperAuth, action: "accept" | "reject", offer: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>(`/offer/${action}`, token, { method: "POST", body: JSON.stringify(offer) }, 280_000);
  return json.results;
}

/** Card data and live listing for a dolz.io link or token id. */
export async function quoteSniperBuy(token: SniperAuth, link: unknown): Promise<DolzSniperQuote> {
  return (await callSniper<{ quote: DolzSniperQuote }>("/quote", token, { method: "POST", body: JSON.stringify({ link }) }, 30_000)).quote;
}

/** Buy a listed card now at exactly the quoted price. */
export async function sniperBuyNow(token: SniperAuth, link: unknown, priceRaw: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>("/buy", token, { method: "POST", body: JSON.stringify({ link, price_raw: priceRaw }) }, 280_000);
  return json.results;
}

export type DolzCollectionFloor = {
  token_id: string;
  price_usd: number;
  price_raw: string;
  rarity: string | null;
  tier: string | null;
  serial: number | null;
  listings: number;
};

export type DolzCollection = {
  updatedAt: string;
  wallets: string[];
  tokens: number;
  owned: { card: string; name: string | null; season: string | null; count: number; wallets: Record<string, number> }[];
  /** Held tokens whose card number is not known yet. */
  unknownTokens: string[];
  catalog: { card: string; name: string | null; season: string | null }[];
  /** Cheapest live listing per card number. */
  floors: Record<string, DolzCollectionFloor>;
};

/** Which cards the owner holds and the market floor per card, refreshed by the sniper every 10 minutes. */
export async function getSniperCollection(token: SniperAuth): Promise<{ collection: DolzCollection | null; refreshing: boolean }> {
  const json = await callSniper<{ collection: DolzCollection | null; refreshing: boolean }>("/collection", token, undefined, 20_000);
  return { collection: json.collection, refreshing: json.refreshing };
}

export async function requestCollectionRefresh(token: SniperAuth): Promise<void> {
  await callSniper<Record<string, never>>("/collection/refresh", token, { method: "POST", body: "{}" });
}

export type DolzMyOffer = {
  token_id: string;
  price_raw: string;
  price_usd: number | null;
  currency: string;
  expiration: number | null;
  fundable: boolean | null;
  card: DolzSniperQuote["card"];
  listing: DolzSniperQuote["listing"];
};

/** Open offers the hot wallet has made. */
export async function getSniperOffers(token: SniperAuth): Promise<DolzMyOffer[]> {
  return (await callSniper<{ offers: DolzMyOffer[] }>("/offers/mine", token, undefined, 60_000)).offers;
}

/** Make or change an offer (`make`), or cancel ours (`cancel`). */
export async function sniperOffer(token: SniperAuth, action: "make" | "cancel", body: unknown): Promise<DolzSellResult[]> {
  const json = await callSniper<{ results: DolzSellResult[] }>(`/offer/${action}`, token, { method: "POST", body: JSON.stringify(body) }, 280_000);
  return json.results;
}

export type DolzAuctionConfig = {
  contract: string;
  rarity: number;
  max_usd: number;
  increment_usd: number;
  /** Step as a percentage of the last winning place; the larger of the two applies. */
  increment_pct?: number;
  final_extra_usd?: number;
  enabled: boolean;
};

export type DolzAuctionRarityStatus = {
  rarity: number;
  supply: number;
  bids: number;
  cutoff_raw: number | null;
  target_raw: number;
  ours: { amount: number; bid_id: number; ts: number } | null;
  position: number | null;
  winning: boolean;
  end: number;
  start: number;
  min_usd: number;
  max_usd: number;
  enabled: boolean;
  contract: string;
  updated: number;
  top: { amount_usd: number; bidder: string; ts: number }[];
};

export type DolzAuctionStatus = {
  /** One config per rarity the sniper bids on. */
  configs: DolzAuctionConfig[];
  statuses: DolzAuctionRarityStatus[];
  settings: { supply: number[]; start: number[]; end: number[]; min_raw: number[] } | null;
  rarities: string[];
  now: number;
  /** Prize withdrawal per auction contract (filled once the auction has ended). */
  claims?: DolzAuctionClaim[];
};

export type DolzAuctionClaim = {
  contract: string;
  checked: number;
  state: "waiting" | "no_proof" | "done" | "failed";
  message: string;
  token_ids?: number[];
  refund_usd?: number;
  tx?: string;
};

export async function getSniperAuction(token: SniperAuth): Promise<DolzAuctionStatus> {
  return await callSniper<DolzAuctionStatus>("/auction", token, undefined, 20_000);
}

export async function saveSniperAuction(token: SniperAuth, config: unknown): Promise<DolzAuctionConfig> {
  return (await callSniper<{ config: DolzAuctionConfig }>("/auction", token, { method: "POST", body: JSON.stringify(config) }, 30_000)).config;
}

export async function claimSniperAuction(token: SniperAuth, contract: unknown): Promise<DolzAuctionClaim> {
  return (await callSniper<{ claim: DolzAuctionClaim }>("/auction/claim", token, { method: "POST", body: JSON.stringify({ contract }) }, 120_000)).claim;
}

export type DolzSniperCardMeta = { name: string | null; card: string | null; tier: string | null; serial: string | number | null; rarity: string | null };

/** Card names and attributes the sniper knows (its metadata cache, filled from chain), for up to 100 DolzNFT ids. */
export async function getSniperCards(token: SniperAuth, ids: string[]): Promise<Record<string, DolzSniperCardMeta>> {
  if (!sniperUrl() || !ids.length) return {};
  const json = await callSniper<{ cards: Record<string, DolzSniperCardMeta> }>(`/cards?ids=${ids.slice(0, 100).join(",")}`, token, undefined, 25_000);
  return json.cards ?? {};
}

export function isSniperConfigured(): boolean {
  return !!sniperUrl();
}
