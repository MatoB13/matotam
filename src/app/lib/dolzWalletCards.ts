// Shared portfolio report cache and the per-wallet card list for the MetaMask tab.
import { unstable_cache } from "next/cache";
import { configuredDolzWallets, DOLZ_NFT_CONTRACTS, GAP_FILL_FROM_BLOCK, getDolzReport, type DolzReport } from "./dolzPortfolio";
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

/** Cards a wallet holds right now, from its full Transfer history on chain (not Blockscout's partial index). */
const heldTokens = unstable_cache(
  async (address: string): Promise<{ contract: string; id: string }[]> => {
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
  },
  ["dolz-wallet-held-v1"],
  { revalidate: 30 },
);

/** The wallet's cards, named from the portfolio report, sorted by card name then serial. */
export async function walletCards(address: string, report: Pick<DolzReport, "holdings">): Promise<DolzWalletCard[]> {
  const meta = new Map(report.holdings.map((holding) => [`${holding.token.toLowerCase()}:${holding.id}`, holding]));
  const cards = (await heldTokens(address.toLowerCase())).map(({ contract, id }) => {
    const holding = meta.get(`${contract}:${id}`);
    return {
      contract,
      collection: DOLZ_NFT_CONTRACTS[contract] ?? "DOLZ",
      id,
      name: holding?.name?.trim() || null,
      card: holding?.card ?? null,
      tier: holding?.tier ?? null,
      rarity: holding?.rarity ?? null,
      serial: holding?.serial ?? null,
      valueUsd: holding?.valueUsd ?? null,
    };
  });
  return cards.sort(
    (a, b) =>
      (a.name ?? "\uffff").localeCompare(b.name ?? "\uffff", "sk") ||
      Number(a.serial ?? Infinity) - Number(b.serial ?? Infinity) ||
      Number(a.id) - Number(b.id),
  );
}
