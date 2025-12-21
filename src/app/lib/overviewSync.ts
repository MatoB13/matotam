// src/app/lib/overviewSync.ts

import { BLOCKFROST_API, BLOCKFROST_KEY, DEV_ADDRESS } from "./constants";
import { MatotamOverviewRow, MatotamSyncState } from "./overviewTypes";

const MATOTAM_SOURCE = "https://matotam.io";
const MATOTAM_VERSION_PREFIX = "matotam-metadata-v";

let overviewRowsCache: MatotamOverviewRow[] = [];
let syncState: MatotamSyncState = {
  lastSeenTxHash: null,
};

// ---------- helpers ----------------------------------------------------------

/**
 * Convert UTF-8 string to hex representation (for assetNameHex).
 */
function stringToHex(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Join metadata segments into a single string.
 * Handles string[], string, and fallback to String(value).
 */
function joinSegments(value: any): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.join("");
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Fetch list of transactions for the dev address from Blockfrost.
 * Only one page (count=100) at a time to keep it simple.
 */
async function fetchDevAddressTransactions(): Promise<{ tx_hash: string }[]> {
  const url = `${BLOCKFROST_API}/addresses/${DEV_ADDRESS}/transactions?order=desc&count=100`;

  const res = await fetch(url, {
    headers: { project_id: BLOCKFROST_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Blockfrost /addresses tx failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch metadata for a given transaction hash.
 */
async function fetchTxMetadata(
  txHash: string
): Promise<{ label: string; json_metadata: any }[]> {
  const url = `${BLOCKFROST_API}/txs/${txHash}/metadata`;

  const res = await fetch(url, {
    headers: { project_id: BLOCKFROST_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Blockfrost /txs/${txHash}/metadata failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch Blockfrost asset fingerprint for a given unit (policyId + assetNameHex).
 */
async function fetchAssetFingerprint(unit: string): Promise<string | null> {
  const url = `${BLOCKFROST_API}/assets/${unit}`;

  const res = await fetch(url, {
    headers: { project_id: BLOCKFROST_KEY },
    cache: "force-cache",
  });

  if (!res.ok) {
    // If asset is unknown or request fails, just fall back to unit-based URL.
    return null;
  }

  const data = await res.json();
  const fp = data?.fingerprint;
  return typeof fp === "string" ? fp : null;
}

/**
 * Parse Matotam rows from 721 metadata of a single transaction.
 * One tx may contain multiple Matotam NFTs (multiple assetNameBase keys).
 */
function parseMatotamRowsFrom721(
  txHash: string,
  jsonMetadata: any
): MatotamOverviewRow[] {
  const label721 = jsonMetadata;
  const rows: MatotamOverviewRow[] = [];

  if (!label721 || typeof label721 !== "object") return rows;

  for (const policyId of Object.keys(label721)) {
    const assetsObject = label721[policyId];
    if (!assetsObject || typeof assetsObject !== "object") continue;

    for (const assetNameBase of Object.keys(assetsObject)) {
      const baseFields = assetsObject[assetNameBase] || {};

      const source = baseFields.source;
      const version = baseFields.version;
      const messageMode = baseFields.messageMode as
        | "plaintext"
        | "encrypted"
        | undefined;

      const isMatotam =
        source === MATOTAM_SOURCE &&
        typeof version === "string" &&
        version.startsWith(MATOTAM_VERSION_PREFIX);

      if (!isMatotam) continue;

      const senderAddress = joinSegments(baseFields.Sender);
      const receiverAddress = joinSegments(baseFields.Receiver);
      const messageText = joinSegments(baseFields.Message);

      const quickBurnId = joinSegments(baseFields.quickBurnId);
      const rarityCode = baseFields.rarity ? String(baseFields.rarity) : null;

      const createdAt =
        typeof baseFields.createdAt === "string"
          ? baseFields.createdAt
          : new Date().toISOString();

      const assetNameHex = stringToHex(assetNameBase);
      const unit = `${policyId}${assetNameHex}`;

      const row: MatotamOverviewRow = {
        txHash,
        policyId,
        assetNameBase,
        assetNameHex,
        unit,
        senderAddress,
        receiverAddress,
        messageText,
        messageMode: messageMode === "encrypted" ? "encrypted" : "plaintext",
        quickBurnId: quickBurnId || null,
        rarityCode,
        createdAt,
        fingerprint: null,
      };

      rows.push(row);
    }
  }

  return rows;
}

/**
 * Run delta sync from dev address:
 * - Fetch latest transactions for dev address (1 page)
 * - For tx above lastSeenTxHash, read metadata and extract Matotam rows
 * - Enrich rows with Blockfrost fingerprints
 * - Prepend new rows to cache
 */
export async function syncOverviewFromDevAddress(): Promise<void> {
  const txList = await fetchDevAddressTransactions();
  if (!txList.length) return;

  const lastSeen = syncState.lastSeenTxHash;
  const newTxHashes: string[] = [];

  for (const tx of txList) {
    if (tx.tx_hash === lastSeen) break;
    newTxHashes.push(tx.tx_hash);
  }

  if (!newTxHashes.length) {
    // nothing new
    return;
  }

  const newRows: MatotamOverviewRow[] = [];

  for (const txHash of newTxHashes) {
    const metadataArray = await fetchTxMetadata(txHash);

    const label721Entry = metadataArray.find(
      (m) => m.label === "721" || m.label === 721
    );

    if (!label721Entry || !label721Entry.json_metadata) continue;

    const rowsForTx = parseMatotamRowsFrom721(
      txHash,
      label721Entry.json_metadata
    );
    if (rowsForTx.length) {
      newRows.push(...rowsForTx);
    }
  }

  // Enrich rows with fingerprints (one Blockfrost call per new unit)
  for (const row of newRows) {
    try {
      const fp = await fetchAssetFingerprint(row.unit);
      row.fingerprint = fp;
    } catch {
      row.fingerprint = null;
    }
  }

  if (newRows.length) {
    newRows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    overviewRowsCache = [...newRows, ...overviewRowsCache];
  }

  // update sync state to newest tx on this page
  syncState.lastSeenTxHash = txList[0].tx_hash;
}

/**
 * Query rows from in-memory cache with simple filters + paging.
 */
export function queryOverviewRows(options: {
  sender?: string;
  receiver?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): { rows: MatotamOverviewRow[]; total: number } {
  const {
    sender,
    receiver,
    q,
    from,
    to,
    page = 1,
    limit = 50,
  } = options;

  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() : null;

  let filtered = overviewRowsCache;

  if (sender) {
    const s = sender.toLowerCase();
    filtered = filtered.filter((row) =>
      row.senderAddress.toLowerCase().includes(s)
    );
  }

  if (receiver) {
    const r = receiver.toLowerCase();
    filtered = filtered.filter((row) =>
      row.receiverAddress.toLowerCase().includes(r)
    );
  }

  if (q) {
    const qq = q.toLowerCase();
    filtered = filtered.filter((row) =>
      row.messageText.toLowerCase().includes(qq)
    );
  }

  if (fromTime !== null) {
    filtered = filtered.filter(
      (row) => new Date(row.createdAt).getTime() >= fromTime
    );
  }

  if (toTime !== null) {
    filtered = filtered.filter(
      (row) => new Date(row.createdAt).getTime() <= toTime
    );
  }

  filtered = filtered
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const rows = filtered.slice(startIndex, endIndex);

  return { rows, total };
}
