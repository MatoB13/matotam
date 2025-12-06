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
// NEW: import encrypted payload type
import type { EncryptedPayload } from "./encryption";

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
  encryptedPayload?: EncryptedPayload; // NEW: optional encrypted payload
}): Promise<MintBuildResult> {
  const {
    senderAddr,
    recipientAddress,
    message,
    policyId,
    encryptedPayload,
  } = params;

 
  // Flag so we can branch logic easily
  const isEncrypted = !!encryptedPayload; // NEW

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
    if (Array.isArray(minted)) seq = minted.length + 1;
  }

  // Sequence number formatted with leading zeros (3-digit always)
  const seqStr = seq.toString().padStart(3, "0");

  // Final asset name for this NFT (max ~19 chars)
  const assetNameBase = `${threadId}-${seqStr}`;

  // Convert to HEX (Cardano requirement)
  const assetNameBytes = new TextEncoder().encode(assetNameBase);
  const assetNameHex = bytesToHex(assetNameBytes);

  // Final unit
  const unit = policyId + assetNameHex;

  // Quick Burn ID (base64url)
  const quickBurnId = encodeUnitToQuickBurnId(unit);

  // --- METADATA PROCESSING --------------------------------------------------

  // Original on-chain text candidate (limit 256 chars).
  // IMPORTANT:
  // - For encrypted messages we NEVER store this exact text on-chain.
  // - It is only used for plaintext mode; encrypted mode uses a placeholder.
  const safeMessageOriginal = message.trim().slice(0, 256); // CHANGED (renamed)

  // Message that will actually be written into human-readable on-chain fields.
  // - Plaintext mode: real message (as before)
  // - Encrypted mode: a short placeholder to avoid leaking the real text
  const safeMessageForOnchain = isEncrypted
    ? "🔒 encrypted matotam"
    : safeMessageOriginal; // NEW

  // Short ASCII-only preview (explorer-friendly)
  const asciiPreviewSource = safeMessageForOnchain.replace(/[^\x20-\x7E]/g, "");
  const messagePreview =
    asciiPreviewSource.length > 61
      ? asciiPreviewSource.slice(0, 61) + "..."
      : asciiPreviewSource || "(message)";

  // Full ASCII-only version (safe) – based on the *on-chain* message
  const messageSafeFull = makeSafeMetadataText(safeMessageForOnchain);

  // Short ASCII (<=64 chars)
  const messageSafe =
    messageSafeFull.length > 64
      ? messageSafeFull.slice(0, 64)
      : messageSafeFull;

  // Segments of full ASCII text (used in "Message" metadata field)
  const messageSafeSegments = splitAsciiIntoSegments(messageSafeFull, 64);

  // NOTE:
  // - We intentionally DO NOT store the UTF-8/base64 form of the original
  //   message for encrypted mode, to avoid any accidental leakage.
  // - If you ever need that in plaintext mode, you can re-introduce it
  //   guarded by `!isEncrypted`.
  //
  // const encodedMessage = encodeMessageToBase64(safeMessageOriginal);
  // const messageEncodedSegments = splitAsciiIntoSegments(encodedMessage, 64);

  // Burn info
  const burnInfoFull =
    "To unlock the ADA in this message NFT, burn it on matotam.io. Burn can be done only by the sender, the receiver, or matotam.";

  const burnInfoSegments = splitAsciiIntoSegments(burnInfoFull, 64);

  const description = "On-chain message sent via matotam.io";

  // Addresses
  const fromAddressSegments = splitIntoSegments(senderAddr, 64);
  const toAddressSegments = splitIntoSegments(recipientAddress, 64);

  // -----------------------------------------------------------
  // RARITY / TIME INFO (Y + D)
  // -----------------------------------------------------------
  const rarityInfo = getRarityInfo(new Date());
  const rarityCode = rarityInfo.rarityCode;

  // -----------------------------------------------------------
  // SVG bubble lines
  // -----------------------------------------------------------
  // IMPORTANT:
  // - For encrypted messages we again only render the placeholder text
  //   in the bubble, never the real message.
  const bubbleLines = wrapMessageForBubble(safeMessageForOnchain); // CHANGED

  // -----------------------------------------------------------
  // Ornament parameters (sender + receiver + Y + D)
  // -----------------------------------------------------------
  const ornamentParams = getOrnamentParamsForPair(
    senderAddr,
    recipientAddress,
    rarityInfo.projectYear,
    rarityInfo.dayInYear
  );

  // -----------------------------------------------------------
  // Final SVG build
  // -----------------------------------------------------------
  const svg = buildBubbleSvg(bubbleLines, rarityCode, ornamentParams);
  const dataUri = svgToDataUri(svg);

  // Safeguard logic for data URI size:
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

  // FINAL 721 METADATA
  const baseFields: any = {
    //
    // PRIORITY FIRST — EASY BURN
    //
    quickBurnId,

    //
    // HUMAN FIELDS
    //
    "Burn info": burnInfoSegments,
    Sender: fromAddressSegments,
    Receiver: toAddressSegments,

    // For encrypted messages, this is only a placeholder, not the real text.
    Message: messageSafeSegments,

    Thread: threadId,
    "Thread index": seqStr,

    createdAt: new Date().toISOString(),

    // RARITY
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
    // Cardano / Lucid limit: max 64 chars per metadata string.
    // cipherText býva dlhší, preto ho rozsekáme na 64-znakové segmenty.
    baseFields.matotam_encrypted = {
      ...encryptedPayload,
      cipherText: splitAsciiIntoSegments(encryptedPayload.cipherText, 64),
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

  const metadata721 = JSON.parse(JSON.stringify(rawMetadata721));

  return { unit, assetNameBase, metadata721 };
}
