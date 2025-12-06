import { MatotamMessage } from "./types";
import { decodeMessageFromBase64 } from "./textEncoding";
import type { EncryptedPayload } from "./encryption";

const assetCache = new Map<string, any>();

/**
 * Load matotam messages for a wallet.
 * - For small wallets (default) we only scan the first 100 assets.
 * - For large wallets you can pass a specific policyIdFilter to narrow the scan.
 *   In that case we paginate through all assets and keep only those whose unit
 *   starts with the given policy id.
 */
export async function fetchInboxMessages(params: {
  walletAddress: string | null;
  stakeAddress: string | null;
  blockfrostKey: string;
  blockfrostApi: string;
  policyIdFilter?: string;
}): Promise<MatotamMessage[]> {
  const {
    walletAddress,
    stakeAddress,
    blockfrostKey,
    blockfrostApi,
    policyIdFilter,
  } = params;

  if (!walletAddress && !stakeAddress) return [];

  const headers = { project_id: blockfrostKey };

  const hasPolicyFilter = !!policyIdFilter && policyIdFilter.trim().length > 0;
  const normalizedPolicy = hasPolicyFilter
    ? policyIdFilter!.trim().toLowerCase()
    : null;

  let assets: any[] = [];

  // Helper to fetch assets for an account or address with optional policy filter.
  async function fetchAssetsWithOptionalFilter(baseUrl: string): Promise<any[]> {
    // When filtering by policy, we fully paginate and keep only matching units.
    if (hasPolicyFilter) {
      const collected: any[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(`${baseUrl}?page=${page}&count=100`, {
          headers,
        });
        if (!resp.ok) {
          console.warn("Failed to load assets (page)", page, resp.status);
          break;
        }
        const chunk = await resp.json();
        if (!Array.isArray(chunk) || chunk.length === 0) break;

        for (const a of chunk) {
          const unit = String(a.unit ?? "");
          if (!unit) continue;
          const policyId = unit.slice(0, 56).toLowerCase();
          if (policyId === normalizedPolicy) {
            collected.push(a);
          }
        }

        if (chunk.length < 100) break;
        page++;
      }
      return collected;
    }

    // Default (no policy filter): single page up to 100 assets.
    const resp = await fetch(`${baseUrl}?page=1&count=100`, { headers });
    if (!resp.ok) {
      console.warn("Failed to load assets:", resp.status);
      return [];
    }
    const chunk = await resp.json();
    return Array.isArray(chunk) ? chunk : [];
  }

  // 1) Try by stake address (preferred)
  if (stakeAddress) {
    assets = await fetchAssetsWithOptionalFilter(
      `${blockfrostApi}/accounts/${stakeAddress}/addresses/assets`
    );
  }

  // 2) Fallback: by wallet address
  if (assets.length === 0 && walletAddress) {
    assets = await fetchAssetsWithOptionalFilter(
      `${blockfrostApi}/addresses/${walletAddress}/assets`
    );
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    return [];
  }

  // Hard limit only when we do NOT have a policy filter.
  if (!hasPolicyFilter && assets.length === 100) {
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

    // Detect encrypted payload
    const encryptedPayload = (meta as any)
      .matotam_encrypted as EncryptedPayload | undefined;
    const isEncrypted = !!encryptedPayload;

    // -------- decode message text (or placeholder) --------
    let fullText = "";

    if (Array.isArray((meta as any).Message)) {
      fullText = ((meta as any).Message as any[]).map(String).join("");
    } else if (Array.isArray((meta as any).messageEncodedSegments)) {
      const encoded = ((meta as any).messageEncodedSegments as any[])
        .map((s: any) => String(s))
        .join("");
      try {
        fullText = decodeMessageFromBase64(encoded);
      } catch {
        fullText = "";
      }
    } else if (Array.isArray((meta as any).messageSegments)) {
      fullText = ((meta as any).messageSegments as any[]).map(String).join("");
    } else if (typeof (meta as any).message === "string") {
      fullText = String((meta as any).message);
    } else {
      fullText = desc || name || "";
    }

    const preview =
      fullText.length > 80 ? fullText.slice(0, 77) + "..." : fullText || name;

    // sender / receiver
    let fromAddress: string | undefined;
    if (Array.isArray((meta as any).Sender)) {
      fromAddress = ((meta as any).Sender as any[]).map(String).join("");
    } else if (Array.isArray((meta as any).fromAddressSegments)) {
      fromAddress = ((meta as any).fromAddressSegments as any[]).map(String).join(
        ""
      );
    }

    let toAddress: string | undefined;
    if (Array.isArray((meta as any).Receiver)) {
      toAddress = ((meta as any).Receiver as any[]).map(String).join("");
    } else if (Array.isArray((meta as any).toAddressSegments)) {
      toAddress = ((meta as any).toAddressSegments as any[]).map(String).join(
        ""
      );
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
    if (Array.isArray((meta as any).image)) {
      imageDataUri = ((meta as any).image as any[])
        .map((s: any) => String(s))
        .join("");
    } else if (typeof (meta as any).image === "string") {
      imageDataUri = String((meta as any).image);
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
      isEncrypted,
      encryptedPayload,
    });
  }

  return messages;
}
