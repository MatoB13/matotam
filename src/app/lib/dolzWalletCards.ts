// Shared portfolio report cache and the per-wallet card list for the MetaMask tab.
import { unstable_cache } from "next/cache";
import { blockscout } from "./blockscout";
import { configuredDolzWallets, DOLZ_NFT_CONTRACTS, GAP_FILL_FROM_BLOCK, getDolzReport } from "./dolzPortfolio";
import { fetchTransferLogs, polygonRpc } from "./polygonRpc";

/** Hot wallet of the DOLZ sniper (also imported in Rabby). */
export const SNIPER_HOT_WALLET = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6";

/** Wallets the portfolio covers: configured ones, the sniper's known wallet and the one it reports. */
export function portfolioWallets(sniperWallet: string | null): string[] {
  const wallets = [...new Set([...configuredDolzWallets(), SNIPER_HOT_WALLET])];
  return sniperWallet && !wallets.includes(sniperWallet) ? [...wallets, sniperWallet] : wallets;
}

// The report takes tens of seconds to build, so page loads share one copy. Once it is older than
// 3 minutes the next load still gets it at once while a fresh one is built in the background.
export const cachedDolzReport = unstable_cache(async (wallets: string[]) => getDolzReport(wallets), ["dolz-report-v3"], {
  revalidate: 180,
  tags: ["dolz-report"],
});

export type DolzWalletCard = {
  contract: string;
  collection: string;
  id: string;
  name: string | null;
  card: string | null;
  tier: string | null;
  rarity: string | null;
  serial: string | null;
  valueUsd: number | null;
  /** What the card cost when it was bought or minted (USD; DOLZ payments at that day's rate), from the portfolio. */
  costUsd?: number | null;
  /** How it was acquired: dolz-market, opensea, mint, card, auction, free. */
  channel?: string | null;
};

type BlockscoutNft = {
  id: string;
  token?: { address_hash?: string; address?: string };
  metadata?: { name?: string; attributes?: { trait_type?: string; value?: string }[] } | null;
};

/** The wallet's DOLZ cards as Blockscout lists them, with metadata where it has it (it misses ~2% of blocks). */
async function blockscoutCards(address: string): Promise<DolzWalletCard[]> {
  const cards: DolzWalletCard[] = [];
  let query = "";
  for (let page = 0; page < 20; page += 1) {
    const data = await blockscout<{ items: BlockscoutNft[]; next_page_params: Record<string, string | number> | null }>(
      `/addresses/${address}/nft?type=ERC-721${query}`,
      60,
    );
    for (const item of data.items ?? []) {
      const contract = (item.token?.address_hash ?? item.token?.address ?? "").toLowerCase();
      if (!DOLZ_NFT_CONTRACTS[contract]) continue;
      const attrs = Object.fromEntries((item.metadata?.attributes ?? []).map((attr) => [attr.trait_type ?? "", String(attr.value ?? "")]));
      const [serial, tier] = (attrs["Serial Number"] ?? "").includes("/") ? attrs["Serial Number"].split("/") : [null, null];
      cards.push({
        contract,
        collection: DOLZ_NFT_CONTRACTS[contract],
        id: String(item.id),
        name: item.metadata?.name?.trim() || null,
        card: attrs["Card Number"] || null,
        tier: tier || null,
        rarity: attrs.Rarity || null,
        serial: serial || null,
        valueUsd: null,
      });
    }
    if (!data.next_page_params) break;
    query = `&${new URLSearchParams(Object.entries(data.next_page_params).map(([key, value]) => [key, String(value)])).toString()}`;
  }
  return cards;
}

/** Cards a wallet holds right now, from its Transfer history on chain since fromBlock (Blockscout's index has gaps). */
async function chainHeld(address: string, fromBlock = GAP_FILL_FROM_BLOCK): Promise<{ contract: string; id: string }[]> {
  return [...(await chainChanges(address, fromBlock)).entries()].filter(([, held]) => held).map(([key]) => splitKey(key));
}

function splitKey(key: string): { contract: string; id: string } {
  const [contract, id] = key.split(":");
  return { contract, id };
}

/** Per card, whether the wallet holds it after its Transfers since fromBlock (true = received last, false = sent last). */
async function chainChanges(address: string, fromBlock: number): Promise<Map<string, boolean>> {
  const contracts = Object.keys(DOLZ_NFT_CONTRACTS);
  const [incoming, outgoing] = await Promise.all([
    fetchTransferLogs(contracts, address, "in", fromBlock),
    fetchTransferLogs(contracts, address, "out", fromBlock),
  ]);
  const events = [...incoming.map((log) => ({ log, delta: 1 })), ...outgoing.map((log) => ({ log, delta: -1 }))]
    .filter(({ log }) => log.topics.length === 4)
    .sort(
      (a, b) =>
        parseInt(a.log.blockNumber, 16) - parseInt(b.log.blockNumber, 16) || parseInt(a.log.logIndex, 16) - parseInt(b.log.logIndex, 16),
    );
  const held = new Map<string, boolean>();
  for (const { log, delta } of events) {
    held.set(`${log.address.toLowerCase()}:${BigInt(log.topics[3]).toString()}`, delta > 0);
  }
  return held;
}

/** Last ~5 days of Transfers: small enough to answer quickly even when the full history times out. */
async function recentChanges(address: string): Promise<Map<string, boolean>> {
  const latest = parseInt(await polygonRpc<string>("eth_blockNumber", []), 16);
  return chainChanges(address, Math.max(GAP_FILL_FROM_BLOCK, latest - 200_000));
}

const within = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * The wallet's cards, sorted by card name then serial. The chain's Transfer history decides what is held
 * when it answers within a few seconds; Blockscout supplies names and stands in when the chain is slow.
 * Names Blockscout lacks are filled in by the page from the portfolio report it already has.
 */
export const walletCards = unstable_cache(
  async (address: string): Promise<{ cards: DolzWalletCard[]; source: "chain" | "blockscout" }> => {
    const [indexed, full, recent] = await Promise.all([
      within(blockscoutCards(address), 25_000),
      within(chainHeld(address), 20_000),
      within(recentChanges(address), 15_000),
    ]);
    const byKey = new Map((indexed ?? []).map((card) => [`${card.contract}:${card.id}`, card]));
    // Without the full history, Blockscout's list corrected by the recent Transfers (it indexes new cards late).
    let onChain = full;
    if (!onChain && indexed && recent) {
      const keys = new Set(byKey.keys());
      for (const [key, held] of recent) {
        if (held) keys.add(key);
        else keys.delete(key);
      }
      onChain = [...keys].map(splitKey);
    }
    const cards = onChain
      ? onChain.map(
          ({ contract, id }) =>
            byKey.get(`${contract}:${id}`) ?? {
              contract,
              collection: DOLZ_NFT_CONTRACTS[contract] ?? "DOLZ",
              id,
              name: null,
              card: null,
              tier: null,
              rarity: null,
              serial: null,
              valueUsd: null,
            },
        )
      : (indexed ?? []);
    if (!onChain && !indexed) throw new Error("Karty sa nepodarilo načítať, skús to o chvíľu.");
    return { cards: sortCards(cards), source: onChain ? "chain" : "blockscout" };
  },
  ["dolz-wallet-cards-v3"],
  { revalidate: 30 },
);

export function sortCards(cards: DolzWalletCard[]): DolzWalletCard[] {
  return [...cards].sort(
    (a, b) =>
      (a.name ?? "\uffff").localeCompare(b.name ?? "\uffff", "sk") ||
      Number(a.serial ?? Infinity) - Number(b.serial ?? Infinity) ||
      Number(a.id) - Number(b.id),
  );
}
