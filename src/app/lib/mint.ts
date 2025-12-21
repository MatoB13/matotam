import { BLOCKFROST_API, BLOCKFROST_KEY, DEV_ADDRESS } from "./constants";
import { splitAsciiIntoSegments, makeSafeMetadataText } from "./textEncoding";
import { splitIntoSegments } from "./segments";
import { encodeUnitToQuickBurnId } from "./quickBurn";
import { wrapMessageForBubble, buildBubbleSvg, svgToDataUri } from "./svgBubble";
import { getRarityInfo } from "./rarity";
import { getOrnamentParamsForPair } from "./swirlEngine";
import { getSigilSvgForAddress, getSigilParamsForAddress } from "./sigilEngine";
import type { EncryptedPayload } from "./encryption";


/**
 * Cardano tx metadata does not allow floats. Convert any non-integer numbers to strings.
 * Also removes undefined/null and sanitizes nested arrays/objects.
 */
function sanitizeMetadata(value: any): any {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return value.toString();
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && v !== null) out[k] = sanitizeMetadata(v);
    }
    return out;
  }
  return value;
}

// bytes -> hex
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get last 3 characters from an address-like string (lowercase), fallback to "xxx".
 */
function last3(addr: string): string {
  const t = (addr ?? "").trim();
  return t.length >= 3 ? t.slice(-3).toLowerCase() : "xxx";
}

/**
 * 2 random base36 characters. Uses crypto RNG when available.
 */
function rand2(): string {
  try {
    const a = new Uint8Array(2);
    crypto.getRandomValues(a);
    return ((a[0] % 36).toString(36) + (a[1] % 36).toString(36)).toLowerCase();
  } catch {
    // Fallback (should not happen in modern browsers)
    const n = Math.floor(Math.random() * 1296); // 36^2
    return n.toString(36).padStart(2, "0").slice(-2).toLowerCase();
  }
}

/**
 * Decode asset_name hex from Blockfrost (hex-encoded bytes) into text.
 */
function hexToText(hex: string): string {
  try {
    const pairs = hex.match(/.{1,2}/g);
    if (!pairs) return "";
    const bytes = new Uint8Array(pairs.map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * Best-effort: read policy assets from Blockfrost and compute next sequence number
 * for a given naming prefix.
 *
  // Naming format:
  //   matotam-sss-rrr-NNN-xx
  // (legacy without -xx also supported: matotam-sss-rrr-NNN)

 * where prefix = "matotam-sss-rrr-"
 *
 * Returns null when Blockfrost is not configured or call fails.
 */
async function getNextSeqFromBlockfrost(args: {
  blockfrostApi: string;
  blockfrostKey: string;
  policyId: string;
  prefix: string;
}): Promise<number | null> {
  const { blockfrostApi, blockfrostKey, policyId, prefix } = args;
  if (!blockfrostApi || !blockfrostKey) return null;

  const headers = { project_id: blockfrostKey };

  let maxSeq = -1;

  // Limit pages to keep it fast; this is best-effort anyway.
  for (let page = 1; page <= 10; page++) {
    const resp = await fetch(
      `${blockfrostApi}/assets/policy/${policyId}?page=${page}&count=100`,
      { headers }
    );
    if (!resp.ok) return null;

    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const r of rows) {
      const assetNameHex = String(r.asset_name ?? "");
      if (!assetNameHex) continue;

      const name = hexToText(assetNameHex);
      if (!name.startsWith(prefix)) continue;

            // Accept both legacy and current formats:
      // - legacy: matotam-sss-rrr-NNN
      // - current: matotam-sss-rrr-NNN-xx
      const parts = name.split("-");
      if (parts.length < 4) continue;

      const seqPart = parts[3]; // NNN
      const n = Number(seqPart);

      // We use 3-digit sequence: 001..999
      if (Number.isInteger(n) && n >= 1 && n <= 999) {
        if (n > maxSeq) maxSeq = n;
      }

    }

    if (rows.length < 100) break;
  }

  // If nothing found, start at 1.
  return maxSeq >= 0 ? maxSeq + 1 : 1;
}

type MintBuildResult = {
  unit: string;
  assetNameBase: string;
  metadata721: any;
};

export async function buildMatotamMintData(params: {
  senderAddr: string;
  recipientAddress: string;
  message: string;
  policyId: string;
  encryptedPayload?: EncryptedPayload;
}): Promise<MintBuildResult> {
  const { senderAddr, recipientAddress, message, policyId, encryptedPayload } =
    params;

  const isEncrypted = !!encryptedPayload;

  // Deterministic rarity + ornament + sigil
  const rarityInfo = getRarityInfo(new Date());
  const rarityCode = rarityInfo.code;
  const ornamentParams = getOrnamentParamsForPair(senderAddr, recipientAddress);

  const sigilParams = getSigilParamsForAddress(senderAddr);
  const sigilMeta = {
    color: sigilParams.color.id,
    colorProbability: sigilParams.color.probability,
    interior: sigilParams.interior.id,
    interiorProbability: sigilParams.interior.probability,
    frame: sigilParams.frame.id,
    frameProbability: sigilParams.frame.probability,
  };

  const sigilSvg = getSigilSvgForAddress(senderAddr, 64);

  // Thread id (stable per sender/receiver pair)
  const senderShort = last3(senderAddr);
  const receiverShort = last3(recipientAddress);
  const threadId = `matotam-${senderShort}-${receiverShort}`;

  // Asset naming convention:
  // matotam-<last3sender>-<last3receiver>-<order4>-<rand2>
  const prefix = `matotam-${senderShort}-${receiverShort}-`;

  // Prefer Blockfrost-based order, but handle indexing delays with a 3-minute bucket.
  let seq = await getNextSeqFromBlockfrost({
    blockfrostApi: BLOCKFROST_API,
    blockfrostKey: BLOCKFROST_KEY,
    policyId,
    prefix,
  });

  if (seq === null) {
    // Fallback: 3-minute time bucket to approximate order when Blockfrost hasn't indexed yet.
    // The rand2 suffix ensures uniqueness if multiple mints happen within the same bucket.
    const bucket = Math.floor(Date.now() / 180000); // 3 minutes
    seq = (bucket % 10000) + 1;
  }

  const seqStr = String(seq).padStart(3, "0");
  const suffix = rand2();
  const assetNameBase = `${prefix}${seqStr}-${suffix}`;


  // Render SVG bubble
  const lines = wrapMessageForBubble(message);
  const bubbleSvg = buildBubbleSvg(lines, rarityCode, ornamentParams, sigilSvg);
  const dataUri = svgToDataUri(bubbleSvg);

  // Unit = policyId + assetNameHex
  const assetNameBytes = new TextEncoder().encode(assetNameBase);
  const assetNameHex = bytesToHex(assetNameBytes);
  const unit = policyId + assetNameHex;

  // QuickBurn Id
  const quickBurnId = encodeUnitToQuickBurnId(unit);

  // Safe message text for on-chain metadata
  const ascii = message.trim();
  const safeMessageForOnchain =
    ascii.length > 256 ? ascii.slice(0, 253) + "..." : ascii;

  const description =
    safeMessageForOnchain.length > 0
      ? makeSafeMetadataText(safeMessageForOnchain)
      : "Matotam message";

  const burnInfo = `Send 1 Lovelace to ${DEV_ADDRESS} with this NFT attached to permanently burn it.\nQuickBurn Id: ${quickBurnId}`;

  const burnInfoSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(burnInfo),
    64
  );

  const fromAddressSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(senderAddr),
    64
  );
  const toAddressSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(recipientAddress),
    64
  );

  const messageSafeSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(safeMessageForOnchain),
    64
  );

  // Always chunk the image data; do not drop it based on length.
  const imageChunks = splitIntoSegments(dataUri, 64);

  const baseFields: any = {
    // Identifiers
    quickBurnId: splitAsciiIntoSegments(quickBurnId, 64),
    rarity: rarityCode,

    // Human-readable hints
    name: assetNameBase,
    description,
    source: "https://matotam.io",
    version: "matotam-metadata-v1",

    // Threading
    Thread: threadId,
    "Thread index": seqStr,

    createdAt: new Date().toISOString(),

    // Parties
    Sender: fromAddressSegments,
    Receiver: toAddressSegments,

    // Message (plaintext segments kept for your app)
    Message: messageSafeSegments,

    // Sigil traits
    sigil: sigilMeta,

    // Burn instructions
    "Burn info": burnInfoSegments,

    // CIP-25 image (chunked)
    image: imageChunks,
    mediaType: "image/svg+xml",
  };

  if (isEncrypted && encryptedPayload) {
    const cipherTextStr = Array.isArray(encryptedPayload.cipherText)
      ? encryptedPayload.cipherText.join("")
      : encryptedPayload.cipherText;

    baseFields.matotam_encrypted = {
      ...encryptedPayload,
      cipherText: splitAsciiIntoSegments(cipherTextStr, 64),
    };
    baseFields.messageMode = "encrypted";
  } else {
    baseFields.messageMode = "plaintext";
  }

  const rawMetadata721 = {
    [policyId]: {
      [assetNameBase]: baseFields,
    },
  };

  const metadata721 = sanitizeMetadata(rawMetadata721);

  return { unit, assetNameBase, metadata721 };
}
