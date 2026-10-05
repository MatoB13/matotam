// Shared portfolio report cache and the per-wallet card list for the MetaMask tab.
import { unstable_cache } from "next/cache";
import { blockscout } from "./blockscout";
import { configuredDolzWallets, DOLZ_NFT_CONTRACTS, GAP_FILL_FROM_BLOCK, getDolzReport } from "./dolzPortfolio";
import { fetchTransferLogs } from "./polygonRpc";

/** Hot wallet of the DOLZ sniper (also imported in Rabby). */
export const SNIPER_HOT_WALLET = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6";

/** Wallets the portfolio covers: configured ones, the sniper's known wallet and the one it reports. */
export function portfolioWallets(sniperWallet: string | null): string[] {
  const wallets = [...new Set([...configuredDolzWallets(), SNIPER_HOT_WALLET])];
  return sniperWallet && !wallets.includes(sniperWallet) ? [...wallets, sniperWallet] : wallets;
}

// The report takes tens of seconds to build, so page loads share one copy. Once it is older than
// 3 minutes the next load still gets it at once while a fresh one is built in the background.
export const cachedDolzReport = unstable_cache(async (wallets: string[]) => getDolzReport(wallets), ["dolz-report-v2"], {
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

/** Cards a wallet holds right now, from its full Transfer history on chain (Blockscout's index has gaps). */
async function chainHeld(address: string): Promise<{ contract: string; id: string }[]> {
  const contracts = Object.keys(DOLZ_NFT_CONTRACTS);
  const [incoming, outgoing] = await Promise.all([
    fetchTransferLogs(contracts, address, "in", GAP_FILL_FROM_BLOCK),
    fetchTransferLogs(contracts, address, "out", GAP_FILL_FROM_BLOCK),
  ]);
  const events = [...incoming.map((log) => ({ log, delta: 1 })), ...outgoing.map((log) => ({ log, delta: -1 }))]
    .filter(({ log }) => log.topics.length === 4)
    .sort(
      (a, b) =>
        parseInt(a.log.blockNumber, 16) - parseInt(b.log.blockNumber, 16) || parseInt(a.log.logIndex, 16) - parseInt(b.log.logIndex, 16),
    );
  const held = new Map<string, { contract: string; id: string }>();
  for (const { log, delta } of events) {
    const contract = log.address.toLowerCase();
    const id = BigInt(log.topics[3]).toString();
    if (delta > 0) held.set(`${contract}:${id}`, { contract, id });
    else held.delete(`${contract}:${id}`);
  }
  return [...held.values()];
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
    const [indexed, onChain] = await Promise.all([within(blockscoutCards(address), 25_000), within(chainHeld(address), 20_000)]);
    const byKey = new Map((indexed ?? []).map((card) => [`${card.contract}:${card.id}`, card]));
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
  ["dolz-wallet-cards-v2"],
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
