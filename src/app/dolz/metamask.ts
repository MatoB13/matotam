// MetaMask helpers shared by the MetaMask tab: every transaction is signed by the user in MetaMask;
// nothing here holds a key.

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193[];
};
export type RpcError = { code?: number; message?: string };

export const POLYGON = "0x89";

export function provider(): Eip1193 | null {
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!injected) return null;
  // With several wallet extensions installed, prefer MetaMask's own provider.
  return injected.providers?.find((item) => item.isMetaMask) ?? injected;
}

export const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function errorText(error: unknown): string {
  const rpc = error as RpcError;
  if (rpc?.code === 4001) return "Zamietnuté v MetaMasku.";
  return rpc?.message || (error instanceof Error ? error.message : "Presun zlyhal.");
}

export async function waitForReceipt(eth: Eip1193, hash: string): Promise<boolean> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status?: string } | null;
    if (receipt?.status) return receipt.status === "0x1";
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Transakcia sa zatiaľ nepotvrdila, skontroluj ju v MetaMasku.");
}

/**
 * Polygon fees spelled out, the way the sniper sends: nodes refuse a priority fee under ~25 gwei, and
 * MetaMask's own suggestion on Polygon can fall below that, so the transaction never gets broadcast.
 */
export async function polygonFees(eth: Eip1193): Promise<{ maxFeePerGas: string; maxPriorityFeePerGas: string }> {
  const block = (await eth.request({ method: "eth_getBlockByNumber", params: ["latest", false] })) as { baseFeePerGas?: string };
  const base = BigInt(block?.baseFeePerGas ?? "0x0");
  const suggested = BigInt(((await eth.request({ method: "eth_maxPriorityFeePerGas" }).catch(() => "0x0")) as string) || "0x0");
  const floor = 40n * 10n ** 9n;
  const priority = suggested > floor ? suggested : floor;
  return { maxFeePerGas: `0x${(base * 2n + priority).toString(16)}`, maxPriorityFeePerGas: `0x${priority.toString(16)}` };
}

/** Gas for one transfer with headroom; a revert here carries the contract's reason before MetaMask opens. */
export async function estimateGas(eth: Eip1193, tx: { from: string; to: string; data: string; value: string }): Promise<string> {
  const estimate = (await eth.request({ method: "eth_estimateGas", params: [tx] })) as string;
  return `0x${((BigInt(estimate) * 13n) / 10n + 10_000n).toString(16)}`;
}

