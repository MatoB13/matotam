// Minimal Polygon JSON-RPC client. Used to fill gaps in Blockscout's index:
// Blockscout's Polygon instance has not indexed every block, so some token
// transfers are missing there but present on chain.

// Tenderly's public gateway allows eth_getLogs over the full chain range when
// the query is narrowed by address and topics; publicnode is a fallback for
// single-object calls (its eth_getLogs is capped at 10k blocks).
const RPC_URLS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"];

type RpcResponse<T> = { result?: T; error?: { code: number; message: string } };

export async function polygonRpc<T>(method: string, params: unknown[], immutable = false, urls = RPC_URLS): Promise<T> {
  let lastError: unknown = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          ...(immutable ? { cache: "force-cache" as const } : { cache: "no-store" as const }),
          signal: AbortSignal.timeout(45_000),
        });
        if (response.status === 429 || response.status >= 500) throw new Error(`RPC ${response.status} at ${url}`);
        const data = (await response.json()) as RpcResponse<T>;
        if (data.error) throw new Error(`RPC ${method} at ${url}: ${data.error.message}`);
        if (data.result === undefined) throw new Error(`RPC ${method} at ${url}: empty result`);
        return data.result;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`RPC ${method} failed`);
}

export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

export type RpcTransaction = {
  hash: string;
  to: string | null;
  from: string;
  input: string;
  blockNumber: string;
};

export type RpcBlock = { number: string; timestamp: string };

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/** Transfer logs of `contracts` sent to (`direction: "in"`) or from the wallet, over the full chain. */
export async function fetchTransferLogs(contracts: string[], wallet: string, direction: "in" | "out", fromBlock: number): Promise<RpcLog[]> {
  const topics = direction === "in" ? [TRANSFER_TOPIC, null, addressTopic(wallet)] : [TRANSFER_TOPIC, addressTopic(wallet)];
  return polygonRpc<RpcLog[]>(
    "eth_getLogs",
    [{ address: contracts, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: "latest", topics }],
    false,
    RPC_URLS.slice(0, 1),
  );
}
