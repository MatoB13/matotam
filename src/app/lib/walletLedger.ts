import { Pool } from "pg";

// Read-only access to the wallet ledger that the wallet-watcher bot indexes
// (Koios -> Postgres on Railway). Tables: wl_wallets, wl_txs, wl_flows.

const globalForPg = globalThis as unknown as { walletLedgerPool?: Pool };

function getPool(): Pool {
  const connectionString = process.env.WALLET_LEDGER_DATABASE_URL;
  if (!connectionString) throw new Error("Missing WALLET_LEDGER_DATABASE_URL");
  if (!globalForPg.walletLedgerPool) {
    globalForPg.walletLedgerPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalForPg.walletLedgerPool;
}

export type FlowKind =
  | "buy" | "sell" | "list" | "delist" | "market" | "receive" | "send" | "own-transfer"
  | "internal" | "mint" | "burn" | "staking" | "dex" | "lending" | "script";

export type WalletSummary = {
  stake: string;
  label: string;
  handles: string[];
  syncedAt: string | null;
  txs: number;
  firstTime: number | null;
  lastTime: number | null;
  adaBalance: number;
  nfts: number;
  fts: number;
  policies: number;
  kinds: Record<string, number>;
};

export type LedgerRow = {
  txHash: string;
  time: number;
  kind: FlowKind;
  protocol: string | null;
  ada: number;
  nftIn: number;
  nftOut: number;
  tokens: { name: string; qty: number }[];
  sampleNft: string | null;
};

export type PolicyHolding = { policy: string; count: number; names: string[] };
export type TokenHolding = { unit: string; name: string; policy: string; qty: number };

export type KindStat = { kind: string; count: number; adaIn: number; adaOut: number; nftIn: number; nftOut: number };

export type Delegation = {
  status: string;
  poolId: string | null;
  poolTicker: string | null;
  drep: string | null;
  rewardsAvailable: number;
  withdrawn: number;
  totalBalance: number;
};

export type CertEvent = { txHash: string; time: number; type: string; pool: string | null; drep: string | null };

export type WalletDetail = {
  summary: WalletSummary;
  stats: KindStat[];
  series: { month: string; balance: number }[];
  nftPolicies: PolicyHolding[];
  tokens: TokenHolding[];
  ledger: LedgerRow[];
  ledgerTotal: number;
  delegation: Delegation | null;
  certEvents: CertEvent[];
};

const CIP68_PREFIXES = ["000643b0", "000de140", "0014df10", "001bc280"];

export function assetName(unit: string): string {
  let hex = unit.slice(56);
  if (CIP68_PREFIXES.some((p) => hex.startsWith(p))) hex = hex.slice(8);
  if (!hex) return "(bez názvu)";
  try {
    const text = Buffer.from(hex, "hex").toString("utf8");
    // eslint-disable-next-line no-control-regex
    return /^[\x20-\x7e -￿]+$/.test(text) ? text : `0x${hex.slice(0, 12)}`;
  } catch {
    return `0x${hex.slice(0, 12)}`;
  }
}

const toNumber = (value: unknown): number => Number(value ?? 0);

const KOIOS = process.env.KOIOS_URL ?? "https://api.koios.rest/api/v1";
const delegationCache = new Map<string, { at: number; value: Delegation | null }>();

async function koiosPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${KOIOS}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Koios ${path} ${response.status}`);
  return response.json();
}

async function getDelegation(stake: string): Promise<Delegation | null> {
  const cached = delegationCache.get(stake);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  let value: Delegation | null = null;
  try {
    const rows = (await koiosPost("/account_info", { _stake_addresses: [stake] })) as Record<string, string | null>[];
    const info = rows[0];
    if (info) {
      let poolTicker: string | null = null;
      if (info.delegated_pool) {
        try {
          const pools = (await koiosPost("/pool_info", { _pool_bech32_ids: [info.delegated_pool] })) as {
            meta_json?: { ticker?: string } | null;
          }[];
          poolTicker = pools[0]?.meta_json?.ticker ?? null;
        } catch {
          poolTicker = null;
        }
      }
      value = {
        status: info.status ?? "unknown",
        poolId: info.delegated_pool ?? null,
        poolTicker,
        drep: info.delegated_drep ?? null,
        rewardsAvailable: toNumber(info.rewards_available) / 1_000_000,
        withdrawn: toNumber(info.withdrawals) / 1_000_000,
        totalBalance: toNumber(info.total_balance) / 1_000_000,
      };
    }
  } catch {
    value = null;
  }
  delegationCache.set(stake, { at: Date.now(), value });
  return value;
}

export async function getOverview(): Promise<WalletSummary[]> {
  const pool = getPool();
  const [wallets, flows, holdings, kinds] = await Promise.all([
    pool.query("SELECT stake, label, handles, synced_at FROM wl_wallets ORDER BY label"),
    pool.query(
      "SELECT stake, count(*) txs, min(block_time) first_time, max(block_time) last_time, " +
        "coalesce(sum(ada_delta), 0) ada FROM wl_flows GROUP BY stake",
    ),
    pool.query(
      "WITH h AS (SELECT f.stake, a.key unit, sum(a.value::numeric) q FROM wl_flows f, " +
        "jsonb_each_text(f.assets) a GROUP BY 1, 2 HAVING sum(a.value::numeric) > 0) " +
        "SELECT stake, count(*) FILTER (WHERE q = 1) nfts, count(*) FILTER (WHERE q > 1) fts, " +
        "count(DISTINCT left(unit, 56)) policies FROM h GROUP BY stake",
    ),
    pool.query("SELECT stake, kind, count(*) n FROM wl_flows GROUP BY 1, 2"),
  ]);

  const byStake = <T extends { stake: string }>(rows: T[]) => new Map(rows.map((r) => [r.stake, r]));
  const flowMap = byStake(flows.rows);
  const holdMap = byStake(holdings.rows);
  const kindMap = new Map<string, Record<string, number>>();
  for (const row of kinds.rows) {
    const entry = kindMap.get(row.stake) ?? {};
    entry[row.kind] = toNumber(row.n);
    kindMap.set(row.stake, entry);
  }

  return wallets.rows.map((w) => {
    const f = flowMap.get(w.stake);
    const h = holdMap.get(w.stake);
    return {
      stake: w.stake,
      label: w.label,
      handles: w.handles ?? [],
      syncedAt: w.synced_at ? new Date(w.synced_at).toISOString() : null,
      txs: toNumber(f?.txs),
      firstTime: f ? toNumber(f.first_time) : null,
      lastTime: f ? toNumber(f.last_time) : null,
      adaBalance: toNumber(f?.ada) / 1_000_000,
      nfts: toNumber(h?.nfts),
      fts: toNumber(h?.fts),
      policies: toNumber(h?.policies),
      kinds: kindMap.get(w.stake) ?? {},
    };
  });
}

function summarizeAssets(assets: Record<string, string | number>) {
  let nftIn = 0;
  let nftOut = 0;
  let sampleNft: string | null = null;
  const tokens: { name: string; qty: number }[] = [];
  for (const [unit, raw] of Object.entries(assets)) {
    const qty = Number(raw);
    if (Math.abs(qty) === 1) {
      if (qty > 0) nftIn += 1;
      else nftOut += 1;
      sampleNft ??= assetName(unit);
    } else {
      tokens.push({ name: assetName(unit), qty });
    }
  }
  tokens.sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));
  return { nftIn, nftOut, sampleNft, tokens: tokens.slice(0, 3) };
}

export async function getWalletDetail(
  stake: string,
  opts: { kind?: string | null; limit?: number; offset?: number } = {},
): Promise<WalletDetail | null> {
  const pool = getPool();
  const overview = (await getOverview()).find((w) => w.stake === stake);
  if (!overview) return null;

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const kind = opts.kind && opts.kind !== "all" ? opts.kind : null;

  const [stats, series, holdings, ledger, ledgerCount, certs, delegation] = await Promise.all([
    pool.query(
      "SELECT kind, count(*) n, " +
        "coalesce(sum(ada_delta) FILTER (WHERE ada_delta > 0), 0) ada_in, " +
        "coalesce(-sum(ada_delta) FILTER (WHERE ada_delta < 0), 0) ada_out, " +
        "coalesce(sum(nft_in), 0) nft_in, coalesce(sum(nft_out), 0) nft_out FROM (" +
        "SELECT f.kind, f.ada_delta, " +
        "(SELECT count(*) FROM jsonb_each_text(f.assets) a WHERE a.value::numeric = 1) nft_in, " +
        "(SELECT count(*) FROM jsonb_each_text(f.assets) a WHERE a.value::numeric = -1) nft_out " +
        "FROM wl_flows f WHERE f.stake = $1) s GROUP BY kind ORDER BY n DESC",
      [stake],
    ),
    pool.query(
      "SELECT to_char(to_timestamp(block_time), 'YYYY-MM') m, sum(ada_delta) d FROM wl_flows " +
        "WHERE stake = $1 GROUP BY 1 ORDER BY 1",
      [stake],
    ),
    pool.query(
      "SELECT a.key unit, sum(a.value::numeric) q FROM wl_flows f, jsonb_each_text(f.assets) a " +
        "WHERE f.stake = $1 GROUP BY 1 HAVING sum(a.value::numeric) > 0",
      [stake],
    ),
    pool.query(
      "SELECT tx_hash, block_time, kind, protocol, ada_delta, assets FROM wl_flows WHERE stake = $1 " +
        "AND ($2::text IS NULL OR kind = $2) ORDER BY block_time DESC, tx_hash LIMIT $3 OFFSET $4",
      [stake, kind, limit, offset],
    ),
    pool.query("SELECT count(*) n FROM wl_flows WHERE stake = $1 AND ($2::text IS NULL OR kind = $2)", [stake, kind]),
    pool.query(
      "SELECT t.tx_hash, t.block_time, c->>'t' type, c->'i' info FROM wl_flows f " +
        "JOIN wl_txs t ON t.tx_hash = f.tx_hash, jsonb_array_elements(t.data->'certs') c " +
        "WHERE f.stake = $1 AND c->'i'->>'stake_address' = $1 ORDER BY t.block_time DESC LIMIT 200",
      [stake],
    ),
    getDelegation(stake),
  ]);

  let running = 0;
  const monthly = series.rows.map((r) => {
    running += toNumber(r.d);
    return { month: r.m as string, balance: running / 1_000_000 };
  });

  const policyMap = new Map<string, { count: number; names: string[] }>();
  const tokens: TokenHolding[] = [];
  for (const row of holdings.rows) {
    const unit = row.unit as string;
    const qty = Number(row.q);
    const policy = unit.slice(0, 56);
    if (qty === 1) {
      const entry = policyMap.get(policy) ?? { count: 0, names: [] };
      entry.count += 1;
      if (entry.names.length < 4) entry.names.push(assetName(unit));
      policyMap.set(policy, entry);
    } else {
      tokens.push({ unit, name: assetName(unit), policy, qty });
    }
  }

  return {
    summary: overview,
    stats: stats.rows.map((r) => ({
      kind: r.kind,
      count: toNumber(r.n),
      adaIn: toNumber(r.ada_in) / 1_000_000,
      adaOut: toNumber(r.ada_out) / 1_000_000,
      nftIn: toNumber(r.nft_in),
      nftOut: toNumber(r.nft_out),
    })),
    series: monthly,
    nftPolicies: [...policyMap.entries()]
      .map(([policy, v]) => ({ policy, count: v.count, names: v.names }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 400),
    tokens: tokens.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 600),
    ledger: ledger.rows.map((r) => ({
      txHash: r.tx_hash,
      time: toNumber(r.block_time),
      kind: r.kind,
      protocol: r.protocol,
      ada: toNumber(r.ada_delta) / 1_000_000,
      ...summarizeAssets(r.assets),
    })),
    ledgerTotal: toNumber(ledgerCount.rows[0]?.n),
    delegation,
    certEvents: certs.rows.map((r) => ({
      txHash: r.tx_hash,
      time: toNumber(r.block_time),
      type: r.type ?? "unknown",
      pool: r.info?.pool_id_bech32 ?? r.info?.pool ?? null,
      drep: r.info?.drep_id ?? r.info?.drep_id_bech32 ?? null,
    })),
  };
}
