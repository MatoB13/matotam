import {
  BLOCKFROST_API,
  BLOCKFROST_KEY,
  DEV_ADDRESS,
} from "./constants";
import {
  encodeMessageToBase64,
  splitAsciiIntoSegments,
  makeSafeMetadataText,
} from "./textEncoding";
import { splitIntoSegments } from "./segments";
import { encodeUnitToQuickBurnId } from "./quickBurn";
import {
  wrapMessageForBubble,
  buildBubbleSvg,
  svgToDataUri,
} from "./svgBubble";
import { getRarityInfo } from "./rarity";
import { getOrnamentParamsForPair } from "./swirlEngine";
import { getSigilSvgForAddress, getSigilParamsForAddress } from "./sigilEngine";
// NEW: import encrypted payload type
import type { EncryptedPayload } from "./encryption";


function sanitizeMetadata(value: any): any {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      return value.toString(); // float → string
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && v !== null) {
        out[k] = sanitizeMetadata(v);
      }
    }
    return out;
  }

  return value;
}


// Local helper for converting bytes → hex (no need to import Lucid here)
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  encryptedPayload?: EncryptedPayload; // optional encrypted payload
}): Promise<MintBuildResult> {
  const {
    senderAddr,
    recipientAddress,
    message,
    policyId,
    encryptedPayload,
  } = params;

  // Derive sigil parameters from sender address for metadata
  const sigilParams = getSigilParamsForAddress(senderAddr);

  const sigilMeta = {
    color: sigilParams.color.id,
    colorProbability: sigilParams.color.probability, // 0.01, 0.045, 0.1...
    interior: sigilParams.interior.id,
    interiorProbability: sigilParams.interior.probability,
    frame: sigilParams.frame.id,
    frameProbability: sigilParams.frame.probability,
  };

  // Flag so we can branch logic easily
  const isEncrypted = !!encryptedPayload;

  //--------------------------------------------------------------------
  // THREAD + ASSET NAME GENERATION
  //--------------------------------------------------------------------

  // Last 3 chars of sender & receiver address (still human-friendly, shorter)
  const senderShort = senderAddr.slice(-3);
  const receiverShort = recipientAddress.slice(-3);

  // Thread identifier (stable for any sender → receiver pair)
  const threadId = `matotam-${senderShort}-${receiverShort}`;

  // Ask Blockfrost how many NFTs with THIS policy already exist
  const mintedCountResp = await fetch(
    `${BLOCKFROST_API}/assets/policy/${policyId}?count=100&order=asc`,
    { headers: { project_id: BLOCKFROST_KEY } }
  );

  let seq = 1;
  if (mintedCountResp.ok) {
    const minted = await mintedCountResp.json();
    if (Array.isArray(minted)) {
      seq = minted.length + 1;
    }
  }

  // Sequence as 4-digit zero-padded number
  const seqStr = seq.toString().padStart(4, "0");

  // Base asset name (ASCII)
  const assetNameBase = `Matotam-${seqStr}`;

  //--------------------------------------------------------------------
  // MESSAGE WRAPPING + SVG RENDERING
  //--------------------------------------------------------------------

  // Wrap message for bubble (same logic as preview)
  const lines = wrapMessageForBubble(message);

  // Rarity code + ornament params from sender / recipient pair
  const rarityInfo = getRarityInfo(senderAddr, recipientAddress);
  const rarityCode = rarityInfo.code;
  const ornamentParams = getOrnamentParamsForPair(senderAddr, recipientAddress);

  // Sigil SVG derived deterministically from sender
  const sigilSvg = getSigilSvgForAddress(senderAddr, 64);

  // Build final bubble SVG (with sigil included)
  const bubbleSvg = buildBubbleSvg(lines, rarityCode, ornamentParams, sigilSvg);

  // Convert to data: URI
  const dataUri = svgToDataUri(bubbleSvg);

  //--------------------------------------------------------------------
  // QUICK BURN ID + ASSET UNIT
  //--------------------------------------------------------------------

  // Asset name as bytes (ASCII) → hex
  const assetNameBytes = new TextEncoder().encode(assetNameBase);
  const assetNameHex = bytesToHex(assetNameBytes);

  // Full unit (policyId + asset name)
  const unit = policyId + assetNameHex;

  // QuickBurn Id from unit (policy+asset)
  const quickBurnId = encodeUnitToQuickBurnId(unit);

  //--------------------------------------------------------------------
  // MESSAGE PREVIEW + SAFE METADATA TEXT
  //--------------------------------------------------------------------

  // ASCII preview for UI / metadata
  const asciiPreviewSource = message.trim();

  // Safe version of message for on-chain storage (truncate to 256 chars)
  const safeMessageForOnchain =
    asciiPreviewSource.length > 256
      ? asciiPreviewSource.slice(0, 253) + "..."
      : asciiPreviewSource;

  // Short preview for metadata / convenience
  const messagePreview =
    asciiPreviewSource.length > 61
      ? asciiPreviewSource.slice(0, 58) + "..."
      : asciiPreviewSource;

  // Description field for 721
  const description =
    safeMessageForOnchain && safeMessageForOnchain.length > 0
      ? makeSafeMetadataText(safeMessageForOnchain)
      : "Matotam message";

  // Burn info (DEV burn address + QuickBurn info)
  const burnInfo = `Send 1 Lovelace to ${DEV_ADDRESS} with this NFT attached to permanently burn it.\nQuickBurn Id: ${quickBurnId}`;
  const burnInfoSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(burnInfo),
    64
  );

  // Human-readable addresses
  const fromAddressSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(senderAddr),
    64
  );
  const toAddressSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(recipientAddress),
    64
  );

  // Safe segments for the on-chain message field
  const messageSafeSegments = splitAsciiIntoSegments(
    makeSafeMetadataText(safeMessageForOnchain ?? ""),
    64
  );

  //--------------------------------------------------------------------
  // IMAGE SIZE GUARD (avoid oversized data URIs)
  //--------------------------------------------------------------------

  // Hard guard for data URI size:
  // - no truncation in the middle of SVG
  // - if URI is too long, we simply drop the image field completely
  const MAX_URI_LENGTH = 4096;

  let imageChunks: string[] = [];
  if (dataUri.length <= MAX_URI_LENGTH) {
    imageChunks = splitIntoSegments(dataUri, 64);
  } else {
    // better no image than broken XML
    imageChunks = [];
  }

  //--------------------------------------------------------------------
  // FINAL 721 METADATA
  //--------------------------------------------------------------------

  const baseFields: any = {
    //
    // PRIORITY FIRST — EASY BURN
    //
    // QuickBurn Id: stored as 64-char chunks to respect metadata limits
    quickBurnId: splitAsciiIntoSegments(quickBurnId, 64),

    //
    // HUMAN FIELDS
    //
    "Burn info": burnInfoSegments,
    Sender: fromAddressSegments,
    Receiver: toAddressSegments,

    // For encrypted messages, this is only a placeholder, not the real text.
    Message: messageSafeSegments,

    // Minimal sigil info derived from sender address (for rarity/explorers)
    sigil: sigilMeta,

    Thread: threadId,
    "Thread index": seqStr,

    createdAt: new Date().toISOString(),

    //
    // RARITY
    //
    rarity: rarityCode,

    //
    // IMAGE (only if we fit into the size limit)
    //
    ...(imageChunks.length
      ? {
          image: imageChunks,
          mediaType: "image/svg+xml",
        }
      : {}),

    //
    // SYSTEM FIELDS
    //
    name: assetNameBase,
    description,
    source: "https://matotam.io",
    version: "matotam-metadata-v1",
  };

  // NEW: attach encrypted payload when present
  if (isEncrypted && encryptedPayload) {
    // Normalize cipherText to a single base64 string (in case someone ever
    // passes an array here) and then split into 64-char chunks for metadata.
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
