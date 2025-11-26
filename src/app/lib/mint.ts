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
}): Promise<MintBuildResult> {
  const { senderAddr, recipientAddress, message, policyId } = params;

  const { toHex } = await import("lucid-cardano");

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
  const assetNameHex = toHex(assetNameBytes);

  // Final unit
  const unit = policyId + assetNameHex;

  // Quick Burn ID (base64url)
  const quickBurnId = encodeUnitToQuickBurnId(unit);

  // --- METADATA PROCESSING --------------------------------------------------

  // On-chain text (limit 256 chars)
  const safeMessage = message.trim().slice(0, 256);

  // Base64 (full UTF-8, with emoji)
  const encodedMessage = encodeMessageToBase64(safeMessage);
  const messageEncodedSegments = splitAsciiIntoSegments(encodedMessage, 64);

  // Short ASCII-only preview (explorer-friendly)
  const asciiPreviewSource = safeMessage.replace(/[^\x20-\x7E]/g, "");
  const messagePreview =
    asciiPreviewSource.length > 61
      ? asciiPreviewSource.slice(0, 61) + "..."
      : asciiPreviewSource || "(message)";

  // Full ASCII-only version (safe)
  const messageSafeFull = makeSafeMetadataText(safeMessage);

  // Short ASCII (<=64 chars)
  const messageSafe =
    messageSafeFull.length > 64
      ? messageSafeFull.slice(0, 64)
      : messageSafeFull;

  // Segments of full ASCII text
  const messageSafeSegments = splitAsciiIntoSegments(messageSafeFull, 64);

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
  const bubbleLines = wrapMessageForBubble(safeMessage);

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

  // Shorten for on-chain size constraints
  const shortenedDataUri = dataUri.slice(0, 4096);
  const imageChunks = splitIntoSegments(shortenedDataUri, 64);


  // FINAL 721 METADATA
  const rawMetadata721 = {
    [policyId]: {
      [assetNameBase]: {
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

        Message: messageSafeSegments,

        Thread: threadId,
        "Thread index": seqStr,

        createdAt: new Date().toISOString(),

        // RARITY
        rarity: rarityCode,

        //
        // IMAGE
        //
        image: imageChunks,
        mediaType: "image/svg+xml",


        //
        // SYSTEM FIELDS
        //
        name: assetNameBase,
        description,
        source: "https://matotam.io",
        version: "matotam-metadata-v1",
      },
    },
  };

  const metadata721 = JSON.parse(JSON.stringify(rawMetadata721));

  return { unit, assetNameBase, metadata721 };
}
