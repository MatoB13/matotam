// DOLZ NFT portfolio accounting for a set of Polygon wallets.
//
// Everything is reconstructed from on-chain data via the Blockscout v2 API:
// token transfers of the tracked wallets, plus transaction details for the
// transfers that carry no visible payment (card purchases, auction claims).
// USD values use the DOLZ/USDT0 and USDC/WETH Uniswap pools on Polygon,
// seeded from dolzPriceSeed and topped up for newer days at request time.

import { blockscout } from "./blockscout";
import { fetchTransferLogs, polygonRpc, type RpcBlock, type RpcLog, type RpcTransaction } from "./polygonRpc";
import { buildMarketBook, DOLZ_MARKET_USDC_SINCE, DOLZ_NFT, type MarketBook, type ValuationSource } from "./dolzMarket";
import { DOLZ_PRICE_SEED, ETH_PRICE_SEED } from "./dolzPriceSeed";

/** Main wallet plus the DOLZ-app smart account (Kernel) that card mints land in. */
export const DEFAULT_DOLZ_WALLETS = [
  "0xa4cd3de07dafa3f700c908043118b39547190143",
  "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d",
];

const ZERO = "0x0000000000000000000000000000000000000000";
const DOLZ_MINTER = "0xd94298c2160ad8603216a3fa7a233ec609b2494d";
const DOLZ_POOL = "0xc56ddb5c93b8e92b9409dce43a9169aa643495b8"; // DOLZ / USDT0, token0 = DOLZ
const ETH_POOL = "0x45dda9cb7c25131df268515131f647d726f50608"; // USDC.e / WETH, token1 = WETH
const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const PROXY_SELECTOR = "0x9ddba085"; // DOLZ card checkout: proxy(coin, target, amount, data)

type PayKind = "DOLZ" | "USD" | "ETH";

const PAYMENT_TOKENS: Record<string, { symbol: string; decimals: number; kind: PayKind }> = {
  "0x6ab4e20f36ca48b61ecd66c0450fdf665fa130be": { symbol: "DOLZ", decimals: 18, kind: "DOLZ" },
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6, kind: "USD" },
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": { symbol: "USDC.e", decimals: 6, kind: "USD" },
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { symbol: "USDT0", decimals: 6, kind: "USD" },
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { symbol: "WETH", decimals: 18, kind: "ETH" },
};

export type DolzChannel = "dolz-market" | "opensea" | "mint" | "card" | "auction" | "free";

export type DolzEventType = "buy" | "sell" | "auction-bid" | "auction-refund" | "transfer-in" | "transfer-out";

export type DolzEvent = {
  hash: string;
  ts: string;
  type: DolzEventType;
  channel: DolzChannel;
  tokens: { id: string; token: string; collection: string; name: string | null }[];
  /** Positive amounts; direction follows from `type`. */
  usd: number;
  dolz: number;
  paidWith: string | null;
  /** Realized PnL of a sale against the sold tokens' cost basis. */
  realizedUsd: number | null;
  realizedDolz: number | null;
  /** Sold tokens whose acquisition is missing from the indexed history (cost basis taken as 0). */
  unknownBasis?: number;
};

export type DolzHolding = {
  id: string;
  collection: string;
  name: string | null;
  acquiredAt: string;
  channel: DolzChannel;
  costUsd: number;
  costDolz: number;
  token: string;
  card: string | null;
  tier: string | null;
  rarity: string | null;
  serial: string | null;
  /** Estimated value today and how it was derived. */
  valueUsd: number;
  valueSource: ValuationSource | "cost";
  valueSales: number;
};

export type DolzDailyPoint = {
  date: string;
  investedUsd: number;
  proceedsUsd: number;
  realizedUsd: number;
  bookUsd: number;
  markUsd: number;
  investedDolz: number;
  proceedsDolz: number;
  realizedDolz: number;
  bookDolz: number;
  holdings: number;
  dolzPrice: number | null;
};

export type DolzMonthly = {
  month: string;
  spendUsd: Record<DolzChannel, number>;
  spendDolz: Record<DolzChannel, number>;
  proceedsUsd: number;
  proceedsDolz: number;
  bought: number;
  sold: number;
};

export type DolzChannelSummary = {
  channel: DolzChannel;
  bought: number;
  spentUsd: number;
  spentDolz: number;
  sold: number;
  proceedsUsd: number;
  proceedsDolz: number;
};

export type DolzReport = {
  generatedAt: string;
  wallets: string[];
  dolzPriceNow: number | null;
  totals: {
    investedUsd: number;
    investedDolz: number;
    proceedsUsd: number;
    proceedsDolz: number;
    netCashUsd: number;
    netCashDolz: number;
    realizedUsd: number;
    realizedDolz: number;
    bookUsd: number;
    bookDolz: number;
    /** Estimated holdings value, see markValueUsd. */
    markUsd: number;
    pnlAtMarkUsd: number;
    holdings: number;
    acquired: number;
    sold: number;
    transferredOut: number;
    breakEvenPerNftUsd: number | null;
    unallocatedAuctionUsd: number;
    unallocatedAuctionDolz: number;
    firstActivity: string | null;
    valuationSources: Record<ValuationSource | "cost", number>;
    marketSalesSinceSwitch: number;
    marketLatestSale: string | null;
  };
  channels: DolzChannelSummary[];
  daily: DolzDailyPoint[];
  monthly: DolzMonthly[];
  events: DolzEvent[];
  holdings: DolzHolding[];
};

// ---------------------------------------------------------------------------
// Raw data

export type RawTransfer = {
  hash: string;
  block: number;
  ts: string;
  logIndex: number;
  from: string;
  to: string;
  token: string;
  tokenName: string;
  tokenType: string;
  decimals: number;
  value: string | null;
  tokenId: string | null;
  nftName: string | null;
  method: string | null;
};

export type RawTxDetail = {
  hash: string;
  to: string | null;
  method: string | null;
  proxyCoin: string | null;
  proxyAmount: string | null;
};

type BlockscoutAddress = { hash: string } | null;

type BlockscoutTransfer = {
  transaction_hash: string;
  block_number: number;
  timestamp: string;
  log_index: number;
  from: BlockscoutAddress;
  to: BlockscoutAddress;
  method: string | null;
  token: { address_hash: string; name: string | null; type: string; decimals: string | null };
  total: { value?: string; decimals?: string | null; token_id?: string; token_instance?: { metadata?: { name?: string } | null } | null } | null;
};

export async function fetchWalletTransfers(wallet: string): Promise<RawTransfer[]> {
  const out: RawTransfer[] = [];
  let params: Record<string, string | number> | null = null;

  for (let page = 0; page < 200; page += 1) {
    const query = new URLSearchParams({ type: "ERC-20,ERC-721" });
    if (params) for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    const data: { items: BlockscoutTransfer[]; next_page_params: Record<string, string | number> | null } =
      await blockscout(`/addresses/${wallet}/token-transfers?${query.toString()}`, 600);

    for (const item of data.items) {
      const token = item.token.address_hash.toLowerCase();
      const isNft = item.token.type === "ERC-721";
      if (!isNft && !PAYMENT_TOKENS[token]) continue;
      if (isNft && !/dolz/i.test(item.token.name ?? "")) continue;

      out.push({
        hash: item.transaction_hash.toLowerCase(),
        block: item.block_number,
        ts: item.timestamp,
        logIndex: item.log_index,
        from: (item.from?.hash ?? ZERO).toLowerCase(),
        to: (item.to?.hash ?? ZERO).toLowerCase(),
        token,
        tokenName: item.token.name ?? "",
        tokenType: item.token.type,
        decimals: Number(item.total?.decimals ?? item.token.decimals ?? 0),
        value: item.total?.value ?? null,
        tokenId: item.total?.token_id ?? null,
        nftName: item.total?.token_instance?.metadata?.name ?? null,
        method: item.method,
      });
    }

    params = data.next_page_params;
    if (!params) break;
  }

  return out;
}

type BlockscoutTx = {
  hash: string;
  to: BlockscoutAddress;
  method: string | null;
  raw_input: string | null;
  decoded_input: { method_call: string; parameters: { name: string; value: string }[] } | null;
};

export async function fetchTxDetail(hash: string): Promise<RawTxDetail> {
  const tx = await blockscout<BlockscoutTx>(`/transactions/${hash}`, false);
  let proxyCoin: string | null = null;
  let proxyAmount: string | null = null;
  const input = tx.raw_input ?? "";

  if (input.startsWith(PROXY_SELECTOR) && input.length >= 10 + 64 * 3) {
    proxyCoin = `0x${input.slice(10 + 24, 10 + 64)}`.toLowerCase();
    proxyAmount = BigInt(`0x${input.slice(10 + 128, 10 + 192)}`).toString();
  }

  return { hash, to: tx.to?.hash.toLowerCase() ?? null, method: tx.method, proxyCoin, proxyAmount };
}

type BlockscoutLog = { block_number: number; topics: (string | null)[]; data: string };

function sqrtPriceFromSwapData(data: string): number {
  const sqrtPriceX96 = BigInt(`0x${data.slice(2 + 128, 2 + 192)}`);
  return Number(sqrtPriceX96) / 2 ** 96;
}

function dolzFromSqrt(sqrt: number): number {
  return sqrt * sqrt * 1e12; // USDT0 per DOLZ (18 vs 6 decimals)
}

function ethFromSqrt(sqrt: number): number {
  return 1 / (sqrt * sqrt * 1e-12); // USDC.e per WETH (6 vs 18 decimals)
}

/** Median pool price over the ~50 swaps preceding `block` (or the latest ones). */
async function fetchPoolPrice(pool: string, block: number | null, fromSqrt: (sqrt: number) => number): Promise<number | null> {
  const query = block ? `?block_number=${block}&index=0&items_count=50` : "";
  const data = await blockscout<{ items: BlockscoutLog[] }>(`/addresses/${pool}/logs${query}`, block ? false : 600);
  const prices = data.items
    .filter((log) => log.topics[0]?.toLowerCase() === SWAP_TOPIC)
    .map((log) => fromSqrt(sqrtPriceFromSwapData(log.data)))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  return prices.length ? prices[Math.floor(prices.length / 2)] : null;
}

// ---------------------------------------------------------------------------
// Prices

export type PriceBook = {
  dolz: Record<string, number>;
  eth: Record<string, number>;
  dolzNow: number | null;
  ethNow: number | null;
};

function dayOf(ts: string): string {
  return ts.slice(0, 10);
}

function lookup(table: Record<string, number>, day: string, fallback: number | null): number | null {
  if (table[day] !== undefined) return table[day];
  // nearest earlier day, otherwise the nearest later one
  let before: string | null = null;
  let after: string | null = null;
  for (const candidate of Object.keys(table)) {
    if (candidate <= day) {
      if (!before || candidate > before) before = candidate;
    } else if (!after || candidate < after) {
      after = candidate;
    }
  }
  if (before) return table[before];
  if (after) return table[after];
  return fallback;
}

function previousDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

type MarkEntry = { usd: number; dolz: number; acquired: string; token: string; id: string };

/**
 * Estimated USD value of a held card on `day`. While the marketplace priced
 * cards in $DOLZ, a card keeps its DOLZ purchase price and moves with the DOLZ
 * rate. Since the switch to USDC, cards are valued at the median of real
 * marketplace sales of the same card and rarity tier (see dolzMarket); cards
 * without market data fall back to the 2026-09-22 DOLZ rate (DOLZ-era buys) or
 * their USD cost (USDC buys).
 */
function markValueUsd(entry: MarkEntry, day: string, prices: PriceBook, market: MarketBook | null): number {
  if (day < DOLZ_MARKET_USDC_SINCE) {
    const price = lookup(prices.dolz, day, prices.dolzNow);
    return price ? entry.dolz * price : entry.usd;
  }
  const fromMarket = market && entry.token === DOLZ_NFT ? market.value(entry.id) : null;
  if (fromMarket) return fromMarket.usd;
  if (entry.acquired >= DOLZ_MARKET_USDC_SINCE) return entry.usd;
  const frozen = lookup(prices.dolz, previousDay(DOLZ_MARKET_USDC_SINCE), prices.dolzNow);
  return frozen ? entry.dolz * frozen : entry.usd;
}

async function buildPriceBook(transfers: RawTransfer[]): Promise<PriceBook> {
  const dolz: Record<string, number> = { ...DOLZ_PRICE_SEED };
  const eth: Record<string, number> = { ...ETH_PRICE_SEED };

  const [dolzNow, ethNow] = await Promise.all([
    fetchPoolPrice(DOLZ_POOL, null, dolzFromSqrt).catch(() => null),
    fetchPoolPrice(ETH_POOL, null, ethFromSqrt).catch(() => null),
  ]);

  // Days with activity that the seed does not cover: price at the last block of that day.
  const lastBlockByDay = new Map<string, number>();
  for (const transfer of transfers) {
    const day = dayOf(transfer.ts);
    lastBlockByDay.set(day, Math.max(lastBlockByDay.get(day) ?? 0, transfer.block + 1));
  }

  const missing = [...lastBlockByDay.entries()].filter(([day]) => dolz[day] === undefined || eth[day] === undefined);
  for (const [day, block] of missing) {
    if (dolz[day] === undefined) {
      const price = await fetchPoolPrice(DOLZ_POOL, block, dolzFromSqrt).catch(() => null);
      if (price) dolz[day] = price;
    }
    if (eth[day] === undefined) {
      const price = await fetchPoolPrice(ETH_POOL, block, ethFromSqrt).catch(() => null);
      if (price) eth[day] = price;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  if (dolzNow) dolz[today] = dolzNow;
  if (ethNow) eth[today] = ethNow;

  return { dolz, eth, dolzNow, ethNow };
}

// ---------------------------------------------------------------------------
// Accounting

type TxGroup = {
  hash: string;
  ts: string;
  block: number;
  nftIn: RawTransfer[];
  nftOut: RawTransfer[];
  payIn: RawTransfer[];
  payOut: RawTransfer[];
  method: string | null;
};

function amountOf(transfer: RawTransfer): number {
  if (!transfer.value) return 0;
  return Number(transfer.value) / 10 ** transfer.decimals;
}

// Seaport selectors, for transactions whose method name is not decoded.
const SEAPORT_SELECTORS = ["0x00000000", "0xfb0f3ee1", "0xb3a34c4c", "0xe7acab24", "0x87201b41", "0xed98a574", "0xa8174404", "0xf2d12b12"];

function isOpenSeaMethod(method: string | null): boolean {
  return !!method && (/^(fulfill|match)/i.test(method) || SEAPORT_SELECTORS.includes(method.toLowerCase()));
}

function isMintMethod(method: string | null): boolean {
  return !!method && /mint/i.test(method);
}

function isBidMethod(method: string | null): boolean {
  // bid / updateBid on the DOLZ auction contracts (selectors when the contract is unverified)
  return !!method && (/bid/i.test(method) || ["0x598647f8", "0xb3de7a9d"].includes(method.toLowerCase()));
}

function tokenKey(transfer: RawTransfer): string {
  return `${transfer.token}:${transfer.tokenId}`;
}

function collectionLabel(transfer: RawTransfer): string {
  return transfer.tokenName || transfer.token.slice(0, 10);
}

function emptyChannels(): Record<DolzChannel, number> {
  return { "dolz-market": 0, opensea: 0, mint: 0, card: 0, auction: 0, free: 0 };
}

export function groupTransfers(transfers: RawTransfer[], wallets: string[]): TxGroup[] {
  const own = new Set(wallets.map((wallet) => wallet.toLowerCase()));
  const seen = new Set<string>();
  const groups = new Map<string, TxGroup>();

  for (const transfer of transfers) {
    const dedupeKey = `${transfer.hash}:${transfer.logIndex}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const fromOwn = own.has(transfer.from);
    const toOwn = own.has(transfer.to);
    if (fromOwn === toOwn) continue; // unrelated, or a move between our own wallets

    let group = groups.get(transfer.hash);
    if (!group) {
      group = { hash: transfer.hash, ts: transfer.ts, block: transfer.block, nftIn: [], nftOut: [], payIn: [], payOut: [], method: transfer.method };
      groups.set(transfer.hash, group);
    }
    if (!group.method && transfer.method) group.method = transfer.method;

    const isNft = transfer.tokenType === "ERC-721";
    if (isNft) (toOwn ? group.nftIn : group.nftOut).push(transfer);
    else (toOwn ? group.payIn : group.payOut).push(transfer);
  }

  return [...groups.values()].sort((a, b) => a.block - b.block || a.hash.localeCompare(b.hash));
}

/** Transactions whose details are needed: NFTs arriving without any payment from us. */
export function hashesNeedingDetail(groups: TxGroup[]): string[] {
  return groups.filter((group) => group.nftIn.length > 0 && group.payOut.length === 0).map((group) => group.hash);
}

export function buildReport(
  transfers: RawTransfer[],
  details: Map<string, RawTxDetail>,
  prices: PriceBook,
  wallets: string[],
  market: MarketBook | null = null,
): DolzReport {
  const groups = groupTransfers(transfers, wallets);

  const usdOf = (transfer: RawTransfer): number => {
    const meta = PAYMENT_TOKENS[transfer.token];
    const amount = amountOf(transfer);
    if (!meta) return 0;
    if (meta.kind === "USD") return amount;
    const day = dayOf(transfer.ts);
    if (meta.kind === "DOLZ") return amount * (lookup(prices.dolz, day, prices.dolzNow) ?? 0);
    return amount * (lookup(prices.eth, day, prices.ethNow) ?? 0);
  };
  const dolzPriceOn = (ts: string): number | null => lookup(prices.dolz, dayOf(ts), prices.dolzNow);
  const dolzOf = (transfer: RawTransfer): number => {
    const meta = PAYMENT_TOKENS[transfer.token];
    if (meta?.kind === "DOLZ") return amountOf(transfer);
    const price = dolzPriceOn(transfer.ts);
    return price ? usdOf(transfer) / price : 0;
  };
  const sum = (list: RawTransfer[], fn: (transfer: RawTransfer) => number) => list.reduce((acc, transfer) => acc + fn(transfer), 0);

  // Auction contracts: anything we placed a bid with.
  const auctionContracts = new Set<string>();
  for (const group of groups) {
    for (const transfer of group.payOut) {
      if (isBidMethod(transfer.method ?? group.method)) auctionContracts.add(transfer.to);
    }
  }

  const auctionOf = (group: TxGroup): string | null => {
    const refund = group.payIn.find((transfer) => auctionContracts.has(transfer.from));
    if (refund) return refund.from;
    const detail = details.get(group.hash);
    if (detail?.to && auctionContracts.has(detail.to)) return detail.to;
    return null;
  };

  // Pass 1: auction net spend and number of NFTs claimed per auction contract.
  const auctionNet = new Map<string, { usd: number; dolz: number; claimed: number }>();
  const bumpAuction = (contract: string, usd: number, dolz: number, claimed: number) => {
    const entry = auctionNet.get(contract) ?? { usd: 0, dolz: 0, claimed: 0 };
    entry.usd += usd;
    entry.dolz += dolz;
    entry.claimed += claimed;
    auctionNet.set(contract, entry);
  };
  for (const group of groups) {
    for (const transfer of group.payOut) if (auctionContracts.has(transfer.to)) bumpAuction(transfer.to, usdOf(transfer), dolzOf(transfer), 0);
    for (const transfer of group.payIn) if (auctionContracts.has(transfer.from)) bumpAuction(transfer.from, -usdOf(transfer), -dolzOf(transfer), 0);
    if (group.nftIn.length && group.payOut.length === 0) {
      const contract = auctionOf(group);
      if (contract) bumpAuction(contract, 0, 0, group.nftIn.length);
    }
  }

  // Pass 2: ledger.
  const holdings = new Map<string, DolzHolding>();
  const parked = new Map<string, DolzHolding>(); // transferred out without payment, may come back
  const events: DolzEvent[] = [];
  const channels = new Map<DolzChannel, DolzChannelSummary>();
  const channelOf = (channel: DolzChannel) => {
    let entry = channels.get(channel);
    if (!entry) {
      entry = { channel, bought: 0, spentUsd: 0, spentDolz: 0, sold: 0, proceedsUsd: 0, proceedsDolz: 0 };
      channels.set(channel, entry);
    }
    return entry;
  };

  const totals = {
    investedUsd: 0,
    investedDolz: 0,
    proceedsUsd: 0,
    proceedsDolz: 0,
    realizedUsd: 0,
    realizedDolz: 0,
    acquired: 0,
    sold: 0,
    transferredOut: 0,
  };

  const tokenRef = (transfer: RawTransfer) => ({ id: transfer.tokenId ?? "?", token: transfer.token, collection: collectionLabel(transfer), name: transfer.nftName });

  const acquire = (group: TxGroup, channel: DolzChannel, usd: number, dolz: number, paidWith: string | null, type: DolzEventType = "buy") => {
    const count = group.nftIn.length;
    for (const transfer of group.nftIn) {
      const key = tokenKey(transfer);
      const back = parked.get(key);
      if (back && type === "transfer-in") {
        parked.delete(key);
        holdings.set(key, back);
        continue;
      }
      const meta = transfer.token === DOLZ_NFT && transfer.tokenId ? market?.meta.get(transfer.tokenId) : undefined;
      holdings.set(key, {
        id: transfer.tokenId ?? "?",
        collection: collectionLabel(transfer),
        name: transfer.nftName,
        acquiredAt: group.ts,
        channel,
        costUsd: usd / count,
        costDolz: dolz / count,
        token: transfer.token,
        card: meta?.card ?? null,
        tier: meta?.tier ?? null,
        rarity: meta?.rarity ?? null,
        serial: meta?.serial ?? null,
        valueUsd: 0,
        valueSource: "cost",
        valueSales: 0,
      });
      totals.acquired += 1;
    }
    if (type === "buy") {
      const entry = channelOf(channel);
      entry.bought += count;
      entry.spentUsd += usd;
      entry.spentDolz += dolz;
    } else if (channel === "auction" || channel === "free") {
      channelOf(channel).bought += count;
    }
    events.push({ hash: group.hash, ts: group.ts, type, channel, tokens: group.nftIn.map(tokenRef), usd, dolz, paidWith, realizedUsd: null, realizedDolz: null });
  };

  for (const group of groups) {
    const paidSymbols = [...new Set([...group.payOut, ...group.payIn].map((transfer) => PAYMENT_TOKENS[transfer.token]?.symbol).filter(Boolean))].join("+");
    const paidWith = paidSymbols || null;
    const payIsWeth = [...group.payOut, ...group.payIn].some((transfer) => PAYMENT_TOKENS[transfer.token]?.kind === "ETH");
    const marketChannel: DolzChannel = isOpenSeaMethod(group.method) || payIsWeth ? "opensea" : "dolz-market";
    const auctionPayOut = group.payOut.filter((transfer) => auctionContracts.has(transfer.to));
    const auctionPayIn = group.payIn.filter((transfer) => auctionContracts.has(transfer.from));

    // Auction bids and refunds move money but no NFT.
    if (auctionPayOut.length || auctionPayIn.length) {
      const outUsd = sum(auctionPayOut, usdOf);
      const outDolz = sum(auctionPayOut, dolzOf);
      const inUsd = sum(auctionPayIn, usdOf);
      const inDolz = sum(auctionPayIn, dolzOf);
      totals.investedUsd += outUsd - inUsd;
      totals.investedDolz += outDolz - inDolz;
      const entry = channelOf("auction");
      entry.spentUsd += outUsd - inUsd;
      entry.spentDolz += outDolz - inDolz;
      if (outUsd) events.push({ hash: group.hash, ts: group.ts, type: "auction-bid", channel: "auction", tokens: [], usd: outUsd, dolz: outDolz, paidWith, realizedUsd: null, realizedDolz: null });
      if (inUsd) events.push({ hash: group.hash, ts: group.ts, type: "auction-refund", channel: "auction", tokens: [], usd: inUsd, dolz: inDolz, paidWith, realizedUsd: null, realizedDolz: null });
    }

    if (!group.nftIn.length && !group.nftOut.length) continue;

    const marketPayOut = group.payOut.filter((transfer) => !auctionContracts.has(transfer.to));
    const marketPayIn = group.payIn.filter((transfer) => !auctionContracts.has(transfer.from));
    const buyUsd = sum(marketPayOut, usdOf) - (group.nftOut.length ? 0 : sum(marketPayIn, usdOf));
    const buyDolz = sum(marketPayOut, dolzOf) - (group.nftOut.length ? 0 : sum(marketPayIn, dolzOf));

    if (group.nftIn.length && marketPayOut.length && !group.nftOut.length) {
      const fromMint = group.nftIn.some((transfer) => transfer.from === ZERO || transfer.from === DOLZ_MINTER);
      const channel: DolzChannel = isMintMethod(group.method) || fromMint ? "mint" : marketChannel;
      totals.investedUsd += buyUsd;
      totals.investedDolz += buyDolz;
      acquire(group, channel, buyUsd, buyDolz, paidWith);
      continue;
    }

    if (group.nftOut.length && marketPayIn.length && !group.nftIn.length) {
      const proceedsUsd = sum(marketPayIn, usdOf) - sum(marketPayOut, usdOf);
      const proceedsDolz = sum(marketPayIn, dolzOf) - sum(marketPayOut, dolzOf);
      let basisUsd = 0;
      let basisDolz = 0;
      let unknownBasis = 0;
      for (const transfer of group.nftOut) {
        const key = tokenKey(transfer);
        const held = holdings.get(key);
        if (held) {
          basisUsd += held.costUsd;
          basisDolz += held.costDolz;
          holdings.delete(key);
        } else {
          unknownBasis += 1;
        }
      }
      const realizedUsd = proceedsUsd - basisUsd;
      const realizedDolz = proceedsDolz - basisDolz;
      totals.proceedsUsd += proceedsUsd;
      totals.proceedsDolz += proceedsDolz;
      totals.realizedUsd += realizedUsd;
      totals.realizedDolz += realizedDolz;
      totals.sold += group.nftOut.length;
      const entry = channelOf(marketChannel);
      entry.sold += group.nftOut.length;
      entry.proceedsUsd += proceedsUsd;
      entry.proceedsDolz += proceedsDolz;
      events.push({ hash: group.hash, ts: group.ts, type: "sell", channel: marketChannel, tokens: group.nftOut.map(tokenRef), usd: proceedsUsd, dolz: proceedsDolz, paidWith, realizedUsd, realizedDolz, unknownBasis });
      continue;
    }

    if (group.nftIn.length && !marketPayOut.length) {
      const detail = details.get(group.hash);
      if (detail?.proxyAmount && detail.proxyCoin && PAYMENT_TOKENS[detail.proxyCoin]?.kind === "USD") {
        const usd = Number(detail.proxyAmount) / 10 ** PAYMENT_TOKENS[detail.proxyCoin].decimals;
        const price = dolzPriceOn(group.ts);
        const dolz = price ? usd / price : 0;
        totals.investedUsd += usd;
        totals.investedDolz += dolz;
        acquire(group, "card", usd, dolz, `karta (${PAYMENT_TOKENS[detail.proxyCoin].symbol})`);
        continue;
      }

      const contract = auctionOf(group);
      if (contract) {
        const net = auctionNet.get(contract);
        const share = net && net.claimed ? { usd: (net.usd / net.claimed) * group.nftIn.length, dolz: (net.dolz / net.claimed) * group.nftIn.length } : { usd: 0, dolz: 0 };
        acquire(group, "auction", share.usd, share.dolz, "DOLZ (aukcia)", "transfer-in");
        continue;
      }

      acquire(group, "free", 0, 0, null, "transfer-in");
      continue;
    }

    if (group.nftOut.length && !marketPayIn.length) {
      for (const transfer of group.nftOut) {
        const key = tokenKey(transfer);
        const held = holdings.get(key);
        if (held) {
          parked.set(key, held);
          holdings.delete(key);
        }
      }
      events.push({ hash: group.hash, ts: group.ts, type: "transfer-out", channel: "free", tokens: group.nftOut.map(tokenRef), usd: 0, dolz: 0, paidWith: null, realizedUsd: null, realizedDolz: null });
      continue;
    }

    // NFTs in both directions (swaps): carry costs over, treat as a transfer.
    acquire(group, "free", Math.max(0, buyUsd), Math.max(0, buyDolz), paidWith, "transfer-in");
    for (const transfer of group.nftOut) holdings.delete(tokenKey(transfer));
  }

  // Auction money that never turned into a claimed NFT is a realized loss.
  let unallocatedAuctionUsd = 0;
  let unallocatedAuctionDolz = 0;
  for (const net of auctionNet.values()) {
    if (net.claimed === 0) {
      unallocatedAuctionUsd += net.usd;
      unallocatedAuctionDolz += net.dolz;
    }
  }
  totals.realizedUsd -= unallocatedAuctionUsd;
  totals.realizedDolz -= unallocatedAuctionDolz;
  totals.transferredOut = parked.size;

  const today = new Date().toISOString().slice(0, 10);
  const valuationSources: Record<ValuationSource | "cost", number> = { "card-usdc": 0, "card-dolz": 0, "season-tier": 0, tier: 0, cost: 0 };
  for (const held of holdings.values()) {
    const fromMarket = market && held.token === DOLZ_NFT ? market.value(held.id) : null;
    held.valueUsd = markValueUsd(
      { usd: held.costUsd, dolz: held.costDolz, acquired: dayOf(held.acquiredAt), token: held.token, id: held.id },
      today,
      prices,
      market,
    );
    held.valueSource = fromMarket?.source ?? "cost";
    held.valueSales = fromMarket?.sales ?? 0;
    valuationSources[held.valueSource] += 1;
  }
  const heldList = [...holdings.values()].sort((a, b) => b.valueUsd - a.valueUsd);
  const bookUsd = heldList.reduce((acc, held) => acc + held.costUsd, 0);
  const bookDolz = heldList.reduce((acc, held) => acc + held.costDolz, 0);
  const markUsd = heldList.reduce((acc, held) => acc + held.valueUsd, 0);

  return {
    generatedAt: new Date().toISOString(),
    wallets,
    dolzPriceNow: prices.dolzNow,
    totals: {
      investedUsd: totals.investedUsd,
      investedDolz: totals.investedDolz,
      proceedsUsd: totals.proceedsUsd,
      proceedsDolz: totals.proceedsDolz,
      netCashUsd: totals.proceedsUsd - totals.investedUsd,
      netCashDolz: totals.proceedsDolz - totals.investedDolz,
      realizedUsd: totals.realizedUsd,
      realizedDolz: totals.realizedDolz,
      bookUsd,
      bookDolz,
      markUsd,
      pnlAtMarkUsd: totals.proceedsUsd - totals.investedUsd + markUsd,
      holdings: heldList.length,
      acquired: totals.acquired,
      sold: totals.sold,
      transferredOut: totals.transferredOut,
      breakEvenPerNftUsd: heldList.length ? Math.max(0, totals.investedUsd - totals.proceedsUsd) / heldList.length : null,
      unallocatedAuctionUsd,
      unallocatedAuctionDolz,
      firstActivity: events[0]?.ts ?? null,
      valuationSources,
      marketSalesSinceSwitch: market?.salesSinceSwitch ?? 0,
      marketLatestSale: market?.latestSale ?? null,
    },
    channels: [...channels.values()].sort((a, b) => b.spentUsd - a.spentUsd),
    daily: buildDaily(events, prices, market),
    monthly: buildMonthly(events),
    events: [...events].reverse(),
    holdings: heldList,
  };
}

function buildDaily(events: DolzEvent[], prices: PriceBook, market: MarketBook | null): DolzDailyPoint[] {
  if (!events.length) return [];

  const byDay = new Map<string, DolzEvent[]>();
  for (const event of events) {
    const day = dayOf(event.ts);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  // Replay the per-token book so the daily book value matches the ledger.
  const book = new Map<string, MarkEntry>();
  const parked = new Map<string, MarkEntry>();
  const state = { investedUsd: 0, proceedsUsd: 0, realizedUsd: 0, investedDolz: 0, proceedsDolz: 0, realizedDolz: 0 };
  const points: DolzDailyPoint[] = [];

  const start = new Date(`${dayOf(events[0].ts)}T00:00:00Z`);
  const end = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const day = cursor.toISOString().slice(0, 10);
    for (const event of byDay.get(day) ?? []) {
      const keyOf = (token: DolzEvent["tokens"][number]) => `${token.collection}:${token.id}`;
      const count = Math.max(1, event.tokens.length);
      switch (event.type) {
        case "buy":
          state.investedUsd += event.usd;
          state.investedDolz += event.dolz;
          for (const token of event.tokens) book.set(keyOf(token), { usd: event.usd / count, dolz: event.dolz / count, acquired: day, token: token.token, id: token.id });
          break;
        case "transfer-in":
          for (const token of event.tokens) {
            const back = parked.get(keyOf(token));
            if (back) {
              parked.delete(keyOf(token));
              book.set(keyOf(token), back);
            } else {
              book.set(keyOf(token), { usd: event.usd / count, dolz: event.dolz / count, acquired: day, token: token.token, id: token.id });
            }
          }
          break;
        case "transfer-out":
          for (const token of event.tokens) {
            const held = book.get(keyOf(token));
            if (held) parked.set(keyOf(token), held);
            book.delete(keyOf(token));
          }
          break;
        case "sell":
          state.proceedsUsd += event.usd;
          state.proceedsDolz += event.dolz;
          state.realizedUsd += event.realizedUsd ?? 0;
          state.realizedDolz += event.realizedDolz ?? 0;
          for (const token of event.tokens) book.delete(keyOf(token));
          break;
        case "auction-bid":
          state.investedUsd += event.usd;
          state.investedDolz += event.dolz;
          break;
        case "auction-refund":
          state.investedUsd -= event.usd;
          state.investedDolz -= event.dolz;
          break;
      }
    }

    let bookUsd = 0;
    let bookDolz = 0;
    let markUsd = 0;
    for (const entry of book.values()) {
      bookUsd += entry.usd;
      bookDolz += entry.dolz;
      markUsd += markValueUsd(entry, day, prices, market);
    }
    const dolzPrice = lookup(prices.dolz, day, prices.dolzNow);

    points.push({
      date: day,
      ...state,
      bookUsd,
      bookDolz,
      markUsd,
      holdings: book.size,
      dolzPrice,
    });
  }

  return points;
}

function buildMonthly(events: DolzEvent[]): DolzMonthly[] {
  const months = new Map<string, DolzMonthly>();
  for (const event of events) {
    const month = event.ts.slice(0, 7);
    let entry = months.get(month);
    if (!entry) {
      entry = { month, spendUsd: emptyChannels(), spendDolz: emptyChannels(), proceedsUsd: 0, proceedsDolz: 0, bought: 0, sold: 0 };
      months.set(month, entry);
    }
    if (event.type === "buy") {
      entry.spendUsd[event.channel] += event.usd;
      entry.spendDolz[event.channel] += event.dolz;
      entry.bought += event.tokens.length;
    } else if (event.type === "auction-bid") {
      entry.spendUsd.auction += event.usd;
      entry.spendDolz.auction += event.dolz;
    } else if (event.type === "auction-refund") {
      entry.spendUsd.auction -= event.usd;
      entry.spendDolz.auction -= event.dolz;
    } else if (event.type === "transfer-in" && (event.channel === "auction" || event.channel === "free")) {
      entry.bought += event.tokens.length;
    } else if (event.type === "sell") {
      entry.proceedsUsd += event.usd;
      entry.proceedsDolz += event.dolz;
      entry.sold += event.tokens.length;
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------

export function configuredDolzWallets(): string[] {
  const fromEnv = (process.env.DOLZ_WALLETS ?? "")
    .split(/[\s,]+/)
    .map((wallet) => wallet.trim().toLowerCase())
    .filter((wallet) => /^0x[0-9a-f]{40}$/.test(wallet));
  return fromEnv.length ? fromEnv : DEFAULT_DOLZ_WALLETS;
}

// DOLZ NFT collections seen on the tracked wallets.
const DOLZ_NFT_CONTRACTS: Record<string, string> = {
  "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc": "DolzNFT",
  "0x1763bfe8c14f0cc3f7f462a9e19e57578f334dc3": "DOLZ x iStripper",
  "0x7906fddf30af0d1379ab7ec8feb2fb539e30196b": "DOLZ x iStripper",
};
const GAP_FILL_FROM_BLOCK = 70_000_000; // well before the first DOLZ activity (July 2025)

function decodeProxyInput(input: string): Pick<RawTxDetail, "proxyCoin" | "proxyAmount"> {
  if (!input.startsWith(PROXY_SELECTOR) || input.length < 10 + 64 * 3) return { proxyCoin: null, proxyAmount: null };
  return {
    proxyCoin: `0x${input.slice(10 + 24, 10 + 64)}`.toLowerCase(),
    proxyAmount: BigInt(`0x${input.slice(10 + 128, 10 + 192)}`).toString(),
  };
}

async function fetchNftName(token: string, tokenId: string): Promise<string | null> {
  const data = await blockscout<{ metadata: { name?: string } | null }>(`/tokens/${token}/instances/${tokenId}`, false).catch(() => null);
  return data?.metadata?.name ?? null;
}

/**
 * Blockscout's Polygon index skips some blocks, so transfers in them are
 * missing. Read the wallets' Transfer logs straight from the chain and add
 * whatever Blockscout lacks, with the transaction details needed to classify it.
 */
export async function fillIndexGaps(transfers: RawTransfer[], wallets: string[]): Promise<{ added: RawTransfer[]; details: RawTxDetail[] }> {
  const known = new Set(transfers.map((transfer) => `${transfer.hash}:${transfer.logIndex}`));
  const contracts = [...Object.keys(DOLZ_NFT_CONTRACTS), ...Object.keys(PAYMENT_TOKENS)];

  const logs: RpcLog[] = [];
  for (const wallet of wallets) {
    for (const direction of ["in", "out"] as const) {
      logs.push(...(await fetchTransferLogs(contracts, wallet, direction, GAP_FILL_FROM_BLOCK)));
    }
  }

  const missing = new Map<string, RpcLog>();
  for (const log of logs) {
    const key = `${log.transactionHash.toLowerCase()}:${parseInt(log.logIndex, 16)}`;
    if (!known.has(key)) missing.set(key, log);
  }
  if (!missing.size) return { added: [], details: [] };

  const hashes = [...new Set([...missing.values()].map((log) => log.transactionHash.toLowerCase()))];
  const txs = new Map<string, RpcTransaction>();
  const blockTimes = new Map<string, string>();
  for (let index = 0; index < hashes.length; index += 4) {
    await Promise.all(
      hashes.slice(index, index + 4).map(async (hash) => {
        const tx = await polygonRpc<RpcTransaction | null>("eth_getTransactionByHash", [hash], true).catch(() => null);
        if (!tx) return;
        txs.set(hash, tx);
        if (!blockTimes.has(tx.blockNumber)) {
          const block = await polygonRpc<RpcBlock | null>("eth_getBlockByNumber", [tx.blockNumber, false], true).catch(() => null);
          if (block) blockTimes.set(tx.blockNumber, new Date(parseInt(block.timestamp, 16) * 1000).toISOString().replace("Z", "000Z"));
        }
      }),
    );
  }

  const added: RawTransfer[] = [];
  for (const log of missing.values()) {
    const hash = log.transactionHash.toLowerCase();
    const tx = txs.get(hash);
    const ts = tx ? blockTimes.get(tx.blockNumber) : undefined;
    if (!tx || !ts) continue;
    const token = log.address.toLowerCase();
    const isNft = !!DOLZ_NFT_CONTRACTS[token] && log.topics.length === 4;
    const tokenId = isNft ? BigInt(log.topics[3]).toString() : null;
    added.push({
      hash,
      block: parseInt(log.blockNumber, 16),
      ts,
      logIndex: parseInt(log.logIndex, 16),
      from: `0x${log.topics[1].slice(26)}`.toLowerCase(),
      to: `0x${log.topics[2].slice(26)}`.toLowerCase(),
      token,
      tokenName: DOLZ_NFT_CONTRACTS[token] ?? PAYMENT_TOKENS[token]?.symbol ?? "",
      tokenType: isNft ? "ERC-721" : "ERC-20",
      decimals: isNft ? 0 : PAYMENT_TOKENS[token]?.decimals ?? 18,
      value: isNft ? null : BigInt(log.data === "0x" ? 0 : log.data).toString(),
      tokenId,
      nftName: null,
      method: tx.input.slice(0, 10).toLowerCase(),
    });
  }

  const nftTransfers = added.filter((transfer) => transfer.tokenId);
  for (let index = 0; index < nftTransfers.length; index += 4) {
    await Promise.all(
      nftTransfers.slice(index, index + 4).map(async (transfer) => {
        transfer.nftName = await fetchNftName(transfer.token, transfer.tokenId as string);
      }),
    );
  }

  const details = [...txs.values()].map((tx) => ({
    hash: tx.hash.toLowerCase(),
    to: tx.to?.toLowerCase() ?? null,
    method: tx.input.slice(0, 10).toLowerCase(),
    ...decodeProxyInput(tx.input),
  }));

  return { added, details };
}

export async function getDolzReport(wallets = configuredDolzWallets()): Promise<DolzReport> {
  const indexed = (await Promise.all(wallets.map((wallet) => fetchWalletTransfers(wallet)))).flat();
  const gaps = await fillIndexGaps(indexed, wallets).catch((error) => {
    console.error("DOLZ gap fill failed", error);
    return { added: [], details: [] as RawTxDetail[] };
  });
  const transfers = [...indexed, ...gaps.added];
  const groups = groupTransfers(transfers, wallets);

  const details = new Map<string, RawTxDetail>(gaps.details.map((detail) => [detail.hash, detail]));
  const needed = hashesNeedingDetail(groups).filter((hash) => !details.has(hash));
  for (let index = 0; index < needed.length; index += 4) {
    const batch = await Promise.all(needed.slice(index, index + 4).map((hash) => fetchTxDetail(hash).catch(() => null)));
    for (const detail of batch) if (detail) details.set(detail.hash, detail);
  }

  const prices = await buildPriceBook(transfers);
  const ownTokenIds = [...new Set(transfers.filter((t) => t.token === DOLZ_NFT && t.tokenId).map((t) => t.tokenId as string))];
  const market = await buildMarketBook((day) => lookup(prices.dolz, day, prices.dolzNow), ownTokenIds).catch(() => null);
  return buildReport(transfers, details, prices, wallets, market);
}
