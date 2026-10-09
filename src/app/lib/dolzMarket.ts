// Market valuation of DolzNFT cards from real DOLZ marketplace trades.
//
// Sales come from DolzMarketplaceSalesManager's Sale events (tokenId and price);
// card identity (card number, rarity tier = serial max, season) comes from
// dolz.io's card JSON. Both are seeded in dolzMarketSeed and
// topped up at request time.

import { fetchCardJson } from "./dolzCardJson";
import { addressTopic, polygonRpc, type RpcLog } from "./polygonRpc";
import { CARD_META_SEED, MARKET_SALES_SEED, MARKET_SALES_SEED_UNTIL } from "./dolzMarketSeed";

const SALES_MANAGER = "0xe7693ba9cf616a55b88f3ca7b74db3358b5767ee";
export const DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc";
/** Marketplace prices in USDC (6 decimals) from this day; $DOLZ (18 decimals) before. */
export const DOLZ_MARKET_USDC_SINCE = "2026-09-23";
const DOLZ_ERA_WINDOW_DAYS = 90;
const MAX_NEW_META_PER_REQUEST = 120;

export type CardMeta = {
  card: string | null;
  tier: string | null;
  season: string | null;
  rarity: string | null;
  serial: string | null;
};

export type MarketSale = { ts: string; tokenId: string; raw: string };

export type ValuationSource = "card-usdc" | "card-dolz" | "season-tier" | "tier";

export type CardValuation = { usd: number; source: ValuationSource; sales: number };

export type MarketBook = {
  meta: Map<string, CardMeta>;
  value: (tokenId: string) => CardValuation | null;
  salesSinceSwitch: number;
  latestSale: string | null;
};

function seedMeta(): Map<string, CardMeta> {
  const meta = new Map<string, CardMeta>();
  for (const [id, [card, tier, season, rarity, serial]] of Object.entries(CARD_META_SEED)) {
    // Cards seeded before their reveal carry placeholder data: look them up again.
    if (rarity && /not revealed/i.test(rarity)) continue;
    meta.set(id, { card, tier, season, rarity, serial });
  }
  return meta;
}

/** Sale event of DolzMarketplaceSalesManager: (seller, buyer, nft) indexed; data = tokenId, price, currency, timestamp. */
const SALE_TOPIC = "0x2b5c13abb9a5bb44b8c0573ec2ed9d9f2113bc77c8ba0ef031c8143111a87aa6";
const BLOCKS_PER_DAY = 43_200;

/** Sales after the seed, from the marketplace's Sale events on chain. */
async function fetchNewSales(): Promise<MarketSale[]> {
  const latest = parseInt(await polygonRpc<string>("eth_blockNumber", []), 16);
  const daysSinceSeed = Math.ceil((Date.now() - Date.parse(`${MARKET_SALES_SEED_UNTIL}Z`)) / 86_400_000) + 1;
  const fromBlock = Math.max(0, latest - daysSinceSeed * BLOCKS_PER_DAY);
  const logs = await polygonRpc<RpcLog[]>("eth_getLogs", [
    { address: SALES_MANAGER, topics: [SALE_TOPIC, null, null, addressTopic(DOLZ_NFT)], fromBlock: `0x${fromBlock.toString(16)}`, toBlock: "latest" },
  ]);
  const out: MarketSale[] = [];
  for (const log of logs) {
    const words = log.data.slice(2).match(/.{64}/g) ?? [];
    if (words.length < 4) continue;
    const seconds = log.blockTimestamp ? parseInt(log.blockTimestamp, 16) : Number(BigInt(`0x${words[3]}`));
    const ts = new Date(seconds * 1000).toISOString().slice(0, 19);
    if (ts <= MARKET_SALES_SEED_UNTIL) continue;
    out.push({ ts, tokenId: BigInt(`0x${words[0]}`).toString(), raw: BigInt(`0x${words[1]}`).toString() });
  }
  return out;
}

async function fetchMeta(tokenId: string): Promise<CardMeta | null> {
  const card = await fetchCardJson(tokenId);
  if (!card || (!card.card && !card.tier)) return null;
  return { card: card.card, tier: card.tier, season: card.season, rarity: card.rarity, serial: card.serial };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Build the market book. `dolzUsdOn(day)` converts DOLZ-era prices to USD at
 * that day's rate; `heldTokenIds` makes sure our own cards have metadata.
 */
export async function buildMarketBook(
  dolzUsdOn: (day: string) => number | null,
  heldTokenIds: string[],
  known: Record<string, CardMeta> = {},
): Promise<MarketBook> {
  const meta = seedMeta();
  // Cards we already know (e.g. from the sniper's metadata cache) need no Blockscout lookup.
  for (const [id, card] of Object.entries(known)) if (card.tier && !meta.has(id)) meta.set(id, card);
  const sales: MarketSale[] = MARKET_SALES_SEED.map(([ts, tokenId, raw]) => ({ ts, tokenId: String(tokenId), raw }));
  const fresh = await fetchNewSales().catch(() => []);
  sales.push(...fresh);

  const missing = [...new Set([...heldTokenIds, ...fresh.map((sale) => sale.tokenId)])].filter((id) => !meta.has(id)).slice(0, MAX_NEW_META_PER_REQUEST);
  const deadline = Date.now() + 15_000;
  for (let index = 0; index < missing.length && Date.now() < deadline; index += 12) {
    const batch = await Promise.all(missing.slice(index, index + 12).map((id) => fetchMeta(id).catch(() => null)));
    batch.forEach((entry, offset) => {
      if (entry) meta.set(missing[index + offset], entry);
    });
  }

  const cutoff = new Date(Date.now() - DOLZ_ERA_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const cardUsdc = new Map<string, number[]>();
  const cardDolz = new Map<string, number[]>();
  const seasonTier = new Map<string, number[]>();
  const tierOnly = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string, value: number) => map.set(key, [...(map.get(key) ?? []), value]);
  let salesSinceSwitch = 0;
  let latestSale: string | null = null;

  for (const sale of sales) {
    const card = meta.get(sale.tokenId);
    if (!card?.tier) continue;
    const day = sale.ts.slice(0, 10);
    const raw = BigInt(sale.raw);
    const isUsdc = raw < 10n ** 15n;
    if (isUsdc) {
      const usd = Number(raw) / 1e6;
      salesSinceSwitch += 1;
      if (card.card) push(cardUsdc, `${card.card}|${card.tier}`, usd);
      if (card.season) push(seasonTier, `${card.season}|${card.tier}`, usd);
      push(tierOnly, card.tier, usd);
    } else if (day >= cutoff && card.card) {
      const rate = dolzUsdOn(day);
      if (rate) push(cardDolz, `${card.card}|${card.tier}`, (Number(raw / 10n ** 12n) / 1e6) * rate);
    }
    if (!latestSale || sale.ts > latestSale) latestSale = sale.ts;
  }

  const value = (tokenId: string): CardValuation | null => {
    const card = meta.get(tokenId);
    if (!card?.tier) return null;
    const lists: [ValuationSource, number[] | undefined, number][] = [
      ["card-usdc", card.card ? cardUsdc.get(`${card.card}|${card.tier}`) : undefined, 1],
      ["card-dolz", card.card ? cardDolz.get(`${card.card}|${card.tier}`) : undefined, 1],
      ["season-tier", card.season ? seasonTier.get(`${card.season}|${card.tier}`) : undefined, 3],
      ["tier", tierOnly.get(card.tier), 3],
    ];
    for (const [source, list, minimum] of lists) {
      if (list && list.length >= minimum) return { usd: median(list), source, sales: list.length };
    }
    return null;
  };

  return { meta, value, salesSinceSwitch, latestSale };
}
