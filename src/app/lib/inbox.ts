import { MatotamMessage } from "./types";
import { decodeMessageFromBase64 } from "./textEncoding";

const assetCache = new Map<string, any>();

/**
 * Load all matotam messages for a wallet.
 * Handles Blockfrost queries, metadata parsing and all fallbacks.
 */
export async function fetchInboxMessages(params: {
  walletAddress: string | null;
  stakeAddress: string | null;
  blockfrostKey: string;
  blockfrostApi: string;
}): Promise<MatotamMessage[]> {
  const { walletAddress, stakeAddress, blockfrostKey, blockfrostApi } = params;

  if (!walletAddress && !stakeAddress) return [];

  const headers = { project_id: blockfrostKey };

  let assets: any[] = [];

  // 1) Try by stake address (preferred)
  if (stakeAddress) {
    const resp = await fetch(
      `${blockfrostApi}/accounts/${stakeAddress}/addresses/assets?page=1&count=100`,
      { headers }
    );
    if (resp.ok) {
      assets = await resp.json();
    } else {
      console.warn("Failed to load assets by stake:", resp.status);
    }
  }

  // 2) Fallback: by wallet address
  if (assets.length === 0 && walletAddress) {
    const resp = await fetch(
      `${blockfrostApi}/addresses/${walletAddress}/assets?page=1&count=100`,
      { headers }
    );
    if (resp.ok) {
      assets = await resp.json();
    } else {
      console.warn("Failed to load assets by address:", resp.status);
    }
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    return [];
  }

  // Hard limit
  if (assets.length === 100) {
    throw new Error("too_many_assets");
  }

  const messages: MatotamMessage[] = [];

  for (const asset of assets) {
    const unit = asset.unit;
    if (!unit) continue;

    // cached asset lookup
    let assetData: any;
    if (assetCache.has(unit)) {
      assetData = assetCache.get(unit);
    } else {
      const assetResp = await fetch(`${blockfrostApi}/assets/${unit}`, {
        headers,
      });
      if (!assetResp.ok) continue;
      assetData = await assetResp.json();
      assetCache.set(unit, assetData);
    }

    const meta = assetData.onchain_metadata;
    if (!meta) continue;

    const name = String(meta.name ?? "");
    const desc = String(meta.description ?? meta.Description ?? "");
    const source = String(meta.source ?? meta.Source ?? "");

    const isMatotam =
      source.toLowerCase().includes("matotam.io") ||
      name.toLowerCase().includes("matotam") ||
      desc.toLowerCase().includes("matotam");

    if (!isMatotam) continue;

    // -------- decode message text --------
    let fullText = "";

    // newest: ASCII-safe segments
    if (Array.isArray((meta as any).Message)) {
      fullText = ((meta as any).Message as any[]).map(String).join("");
    }
    // base64 segments
    else if (Array.isArray(meta.messageEncodedSegments)) {
      const encoded = (meta.messageEncodedSegments as any[])
        .map((s) => String(s))
        .join("");
      try {
        fullText = decodeMessageFromBase64(encoded);
      } catch {
        fullText = "";
      }
    }
    // older versions
    else if (Array.isArray(meta.messageSegments)) {
      fullText = (meta.messageSegments as any[]).map(String).join("");
    } else if (typeof meta.message === "string") {
      fullText = meta.message;
    } else {
      fullText = desc || name || "";
    }

    const preview =
      fullText.length > 80 ? fullText.slice(0, 77) + "..." : fullText || name;

    // sender / receiver
    let fromAddress: string | undefined;
    if (Array.isArray((meta as any).Sender)) {
      fromAddress = ((meta as any).Sender as any[]).map(String).join("");
    } else if (Array.isArray(meta.fromAddressSegments)) {
      fromAddress = (meta.fromAddressSegments as any[]).map(String).join("");
    }

    let toAddress: string | undefined;
    if (Array.isArray((meta as any).Receiver)) {
      toAddress = ((meta as any).Receiver as any[]).map(String).join("");
    } else if (Array.isArray(meta.toAddressSegments)) {
      toAddress = (meta.toAddressSegments as any[]).map(String).join("");
    }

    const createdAt = meta.createdAt ? String(meta.createdAt) : undefined;

    const threadId =
      typeof (meta as any).Thread === "string"
        ? String((meta as any).Thread)
        : undefined;

    const threadIndex =
      typeof (meta as any)["Thread index"] === "string"
        ? String((meta as any)["Thread index"])
        : undefined;

    let imageDataUri: string | undefined;
    if (Array.isArray(meta.image)) {
      imageDataUri = meta.image.map((s: any) => String(s)).join("");
    } else if (typeof meta.image === "string") {
      imageDataUri = meta.image;
    }

    messages.push({
      unit,
      policyId: assetData.policy_id,
      assetName: assetData.asset_name,
      fingerprint: assetData.fingerprint,
      fullText,
      textPreview: preview,
      createdAt,
      fromAddress,
      toAddress,
      imageDataUri,
      threadId,
      threadIndex,
    });
  }

  return messages;
}
