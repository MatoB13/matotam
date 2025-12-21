// src/app/lib/overviewTypes.ts

// Single row shown in /overview
export interface MatotamOverviewRow {
  txHash: string;
  policyId: string;
  assetNameBase: string;
  assetNameHex: string;
  unit: string;

  senderAddress: string;
  receiverAddress: string;

  messageText: string;
  messageMode: "plaintext" | "encrypted";
  quickBurnId?: string | null;
  rarityCode?: string | null;

  createdAt: string; // ISO timestamp

  // Blockfrost asset fingerprint, e.g. "asset1xxcyk..."
  // Used to build correct pool.pm link.
  fingerprint?: string | null;
}

// Simple sync state kept in memory (for now)
export interface MatotamSyncState {
  lastSeenTxHash?: string | null;
}
