"use client";

import { useState } from "react";

const WALLET_LABELS: Record<string, string> = {
  nami: "Nami",
  eternl: "Eternl",
  lace: "Lace",
  vespr: "VESPR",
  flint: "Flint",
};


const BLOCKFROST_API = "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_KEY = "mainnetjK2y8L83PWohEHDWRNgO5UjeMG3A3kJe";

// ADA Handle mainnet policy (OG collection)
const ADA_HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";


const DEV_ADDRESS =
  "addr1q8d5hu0c0x9vyklqdshkx6t0mw3t9tv46c6g4wvqecduqq2e9wy54x7ffcdly855h96s805k9e3z4pgpmeyu5tjfudfsksgfnq";

type MatotamMessage = {
  unit: string;
  policyId: string;
  assetName: string;
  fingerprint?: string;

  fullText: string;
  textPreview: string;

  createdAt?: string;
  fromAddress?: string;
  toAddress?: string;
  imageDataUri?: string;

  // optional thread info (for new v2 metadata)
  threadId?: string;
  threadIndex?: string;
};



const assetCache = new Map<string, any>();

// ---------- helpers -------------------------------------------------

// Quick Burn helpers: unit <-> quickBurnId (base64url, bez '=')

function encodeUnitToQuickBurnId(unitHex: string): string {

  if (!/^[0-9a-fA-F]+$/.test(unitHex) || unitHex.length % 2 !== 0) {
    throw new Error("Invalid unit hex for quickBurnId.");
  }

  let binary = "";
  for (let i = 0; i < unitHex.length; i += 2) {
    const byte = parseInt(unitHex.slice(i, i + 2), 16);
    binary += String.fromCharCode(byte);
  }

  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");

  // base64url + bez paddingu
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeQuickBurnIdToUnit(quickBurnId: string): string | null {
  if (!quickBurnId || !/^[A-Za-z0-9\-_]+$/.test(quickBurnId)) {
    return null;
  }


  let b64 = quickBurnId.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) {
    b64 += "=";
  }

  let binary: string;
  try {
    binary =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");
  } catch {
    return null;
  }

  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}


function splitIntoSegments(str: string, size = 64): string[] {
  const segments: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    segments.push(str.slice(i, i + size));
  }
  return segments;
}

function looksLikeAdaHandle(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("$")) return true;
  if (!v.startsWith("addr") && !v.startsWith("stake") && !v.includes(" ")) {
    return true;
  }
  return false;
}


async function resolveAdaHandle(handle: string): Promise<string | null> {
  try {
    const raw = handle.trim();
    const base = raw.startsWith("$") ? raw.slice(1) : raw;
    const name = base.trim();
    if (!name) return null;

    //

    //
    try {
      const apiResp = await fetch(
        `https://api.handle.me/handles/${encodeURIComponent(name)}`
      );

      if (apiResp.ok) {
        const data: any = await apiResp.json();
        console.log("handle.me response", data);

        // holder = stake adresa (stake1...)
        const stake = data?.holder;
        if (typeof stake === "string" && stake.startsWith("stake")) {
          const bfResp = await fetch(
            `${BLOCKFROST_API}/accounts/${stake}/addresses`,
            { headers: { project_id: BLOCKFROST_KEY } }
          );

          if (bfResp.ok) {
            const addrs: any[] = await bfResp.json();
            const baseAddr = addrs.find(
              (a) =>
                a &&
                typeof a.address === "string" &&
                a.address.startsWith("addr")
            );
            if (baseAddr?.address) {
              return baseAddr.address as string;
            }
          } else {
            console.warn(
              "Blockfrost account lookup failed for handle holder, status:",
              bfResp.status
            );
          }
        }
      } else {
        console.warn("handle.me status", apiResp.status);
      }
    } catch (err) {
      console.warn("handle.me resolve error", err);
    }

    //

    //
    const { toHex } = await import("lucid-cardano");

    const variants = Array.from(
      new Set([
        name,
        name[0]?.toUpperCase() + name.slice(1),
        name.toUpperCase(),
      ])
    ).filter(Boolean) as string[];

    for (const variant of variants) {
      const bytes = new TextEncoder().encode(variant);
      const assetNameHex = toHex(bytes).toLowerCase();  
      const unit = ADA_HANDLE_POLICY_ID + assetNameHex;

      const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}/addresses`, {
        headers: { project_id: BLOCKFROST_KEY },
      });

      if (!resp.ok) continue;
      const data: any = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const addr = data[0]?.address;
      if (typeof addr === "string" && addr.startsWith("addr")) {
        return addr;
      }
    }

    return null;
  } catch (err) {
    console.error("resolveAdaHandle error", err);
    return null;
  }
}

// ----- helpers pre SVG bubble ---------------------------------------

function wrapMessageForBubble(
  text: string,
  maxLineLength = 50,
  maxLines = 10
): string[] {
  const trimmed = text.slice(0, 256).trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length <= maxLineLength) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) return lines;
      }
      current = word.length > maxLineLength ? word.slice(0, maxLineLength) : word;
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function buildBubbleSvg(lines: string[]): string {
  const safeLines = lines.length > 0 ? lines : ["(empty message)"];
  const lineHeight = 28;

  // Base padding & dimensions
  const bubbleX = 40;
  const bubbleY = 40;
  const bubbleWidth = 520;

  // Dynamická výška bubliny
  const bubbleHeight = Math.max(200, safeLines.length * lineHeight + 80);

  const centerY = bubbleY + bubbleHeight / 2;
  const totalHeight = (safeLines.length - 1) * lineHeight;
  const startY = centerY - totalHeight / 2;

  const textElements = safeLines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `
        <text x="50%" y="${y}"
          text-anchor="middle"
          fill="#e5e7eb"
          font-size="22"
          font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
          ${escaped}
        </text>`;
    })
    .join("");

  // Arrow dynamically positioned under the bubble
  const arrowY = bubbleY + bubbleHeight;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${
    bubbleHeight + 100
  }" viewBox="0 0 600 ${bubbleHeight + 100}">
  <rect x="${bubbleX}" y="${bubbleY}"
        width="${bubbleWidth}" height="${bubbleHeight}"
        rx="40" ry="40"
        fill="#0b1120" stroke="#0ea5e9" stroke-width="4" />

  <path d="M 260 ${arrowY} L 275 ${arrowY + 40} L 315 ${arrowY}"
        fill="#0b1120" stroke="#0ea5e9" stroke-width="4" />

  ${textElements}
</svg>`.trim();
}


function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

function shortHash(value: string, start = 10, end = 6): string {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

// helper na parsovanie Quick Burn inputu
function parseQuickBurnInput(rawInput: string): {
  unit: string | null;
  fingerprintLike: boolean;
} {
  const raw = rawInput.trim();
  if (!raw) return { unit: null, fingerprintLike: false };

  let id = raw;


  if (id.startsWith("http://") || id.startsWith("https://")) {
    const parts = id.split("/");
    id = parts[parts.length - 1] || "";
  }

  if (!id) return { unit: null, fingerprintLike: false };

  // fingerprint asset1...
  if (/^asset1[0-9a-z]+$/i.test(id)) {
    return { unit: null, fingerprintLike: true };
  }


  if (/^[0-9a-fA-F]+$/.test(id)) {
    return { unit: id, fingerprintLike: false };
  }

  return { unit: null, fingerprintLike: false };
}


// Encode message (UTF-8) to base64 (ASCII-only, safe for metadata)
function encodeMessageToBase64(message: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(message);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

// Decode message back from base64 to UTF-8
function decodeMessageFromBase64(encoded: string): string {
  let binary: string;

  if (typeof atob === "function") {
    binary = atob(encoded);
  } else {
    binary = Buffer.from(encoded, "base64").toString("binary");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// Split ASCII/base64 string into fixed-length chunks
function splitAsciiIntoSegments(text: string, maxLength = 64): string[] {
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    segments.push(text.slice(i, i + maxLength));
  }
  return segments;
}

// Prepare a metadata-safe plain-text version of the message
// - keeps standard ASCII characters (including apostrophes)
// - strips emoji and non-ASCII symbols
// - replaces double quotes with single quotes to avoid escaping issues
function makeSafeMetadataText(message: string, maxLength = 256): string {
  if (!message) return "";

  const trimmed = message.trim().slice(0, maxLength);

  // Remove non-ASCII characters (emoji, fancy quotes, etc.)
  let cleaned = trimmed.replace(/[^\x20-\x7E]/g, "");

  // Replace double quotes with single quotes so they are easy to render in JSON/clients
  cleaned = cleaned.replace(/"/g, "'");

  return cleaned;
}


// ---------- COMPONENT ------------------------------------------------

export default function Home() {
  const [message, setMessage] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [stakeAddress, setStakeAddress] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null); 

  const [activeTab, setActiveTab] = useState<"send" | "inbox" | "burn">("send");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<MatotamMessage[]>([]);
  const [burningUnit, setBurningUnit] = useState<string | null>(null);

  const [quickBurnInput, setQuickBurnInput] = useState("");
  const [quickBurnLoading, setQuickBurnLoading] = useState(false);

  // ---------- wallet connect / disconnect -----------------------------

  async function handleConnectClick() {
    try {
      setError(null);
      setTxHash(null);

      const cardano = (window as any).cardano;
      if (!cardano) {
        setError("No Cardano wallets detected in your browser.");
        return;
      }

      const ids = Object.keys(cardano).filter((key) => {
        try {
          return !!cardano[key]?.enable;
        } catch {
          return false;
        }
      });

      if (ids.length === 0) {
        setError("No CIP-30 compatible wallets found.");
        return;
      }

      if (ids.length === 1) {
        await connectWithWallet(ids[0]);
      } else {
        setAvailableWallets(ids);
        setShowWalletPicker(true);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to detect wallets.");
    }
  }

  async function connectWithWallet(id: string) {
    try {
      setError(null);

      if (!BLOCKFROST_KEY) {
        setError("Blockfrost key is not configured.");
        return;
      }

      const cardano = (window as any).cardano;
      if (!cardano || !cardano[id]) {
        setError("Selected wallet is not available.");
        return;
      }

      const wallet = cardano[id];
      const api = await wallet.enable();

      const { Lucid, Blockfrost } = await import("lucid-cardano");

      const lucid = await Lucid.new(
        new Blockfrost(BLOCKFROST_API, BLOCKFROST_KEY),
        "Mainnet"
      );

      lucid.selectWallet(api);
      (window as any).lucid = lucid;

      const addr = await lucid.wallet.address();
      const stake = await lucid.wallet.rewardAddress();
      setWalletAddress(addr);
      setStakeAddress(stake ?? null);
      setWalletConnected(true);
      setShowWalletPicker(false);
    } catch (e) {
      console.error(e);
      setError("Failed to connect wallet.");
    }
  }

  function disconnectWallet() {
    const anyWindow = window as any;
    if (anyWindow.lucid) delete anyWindow.lucid;

    setWalletConnected(false);
    setWalletAddress(null);
    setStakeAddress(null);
    setTxHash(null);
    setError(null);
    setSuccess(null);   
    setShowWalletPicker(false);
    setInboxMessages([]);
  }

  // ---------- inbox ---------------------------------------------------

  async function loadInbox() {
    try {
      if (!walletConnected) {
        setError("Connect your wallet to see your inbox.");
        return;
      }
      if (!BLOCKFROST_KEY) {
        setError("Blockfrost key is not configured.");
        return;
      }

      setError(null);
      setInboxLoading(true);

      const headers = { project_id: BLOCKFROST_KEY };

      let assets: any[] = [];


      if (stakeAddress) {
        const resp = await fetch(
          `${BLOCKFROST_API}/accounts/${stakeAddress}/addresses/assets?page=1&count=100`,
          { headers }
        );
        if (resp.ok) {
          assets = await resp.json();
        } else {
          console.warn("Failed to load assets by stake, status:", resp.status);
        }
      }


      if (assets.length === 0 && walletAddress) {
        const resp = await fetch(
          `${BLOCKFROST_API}/addresses/${walletAddress}/assets?page=1&count=100`,
          { headers }
        );
        if (resp.ok) {
          assets = await resp.json();
        } else {
          console.warn("Failed to load assets by address, status:", resp.status);
        }
      }

      if (!Array.isArray(assets) || assets.length === 0) {
        setInboxMessages([]);
        return;
      }


      if (assets.length === 100) {
        setInboxMessages([]);
        setError(
          "This wallet holds a large number of tokens. The inbox only supports wallets with up to 100 assets. Please use your wallet or pool.pm to view matotam NFTs and use the Quick Burn tab to burn a specific message."
        );
        return;
      }

      const messages: MatotamMessage[] = [];

      for (const asset of assets) {
        const unit: string = asset.unit;
        if (!unit) continue;


        let assetData: any;
        if (assetCache.has(unit)) {
          assetData = assetCache.get(unit);
        } else {
          const assetResp = await fetch(`${BLOCKFROST_API}/assets/${unit}`, {
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

        // ---------- decode message text (new v2 first, then fallback) ----------
        let fullText = "";

        // v2: Message is an array of safe ASCII segments (metadata v2)
        if (Array.isArray((meta as any).Message)) {
          fullText = ((meta as any).Message as any[]).map(String).join("");
        }
        // v1: preferred path – base64-encoded message
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
        // v0: older matotam NFTs
        else if (Array.isArray(meta.messageSegments)) {
          fullText = (meta.messageSegments as any[]).map(String).join("");
        } else if (typeof meta.message === "string") {
          fullText = meta.message;
        } else {
          fullText = desc || name || "";
        }

        const preview =
          fullText.length > 80 ? fullText.slice(0, 77) + "..." : fullText || name;

        // createdAt – v2 už posielame ľudskú hodnotu, tak ju len zobrazíme
        const createdAt = meta.createdAt ? String(meta.createdAt) : undefined;

        // Sender / Receiver (v2) + fallback na staré fromAddressSegments / toAddressSegments
        let fromAddress: string | undefined;
        if (Array.isArray((meta as any).Sender)) {
          fromAddress = ((meta as any).Sender as any[]).map(String).join("");
        } else if (Array.isArray(meta.fromAddressSegments)) {
          fromAddress = (meta.fromAddressSegments as any[]).map(String).join("");
        }

        let toAddressFull: string | undefined;
        if (Array.isArray((meta as any).Receiver)) {
          toAddressFull = ((meta as any).Receiver as any[]).map(String).join("");
        } else if (Array.isArray(meta.toAddressSegments)) {
          toAddressFull = (meta.toAddressSegments as any[]).map(String).join("");
        }

        // optional thread info (v2 only)
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
          toAddress: toAddressFull,
          imageDataUri,
          threadId,
          threadIndex,
        });

      }

      setInboxMessages(messages);
    } catch (e) {
      console.error(e);
      setError("Failed to load inbox.");
    } finally {
      setInboxLoading(false);
    }
  }

  // ---------- burn z inboxu -------------------------------------------

  async function burnMessage(unit: string) {
    try {
      if (!walletConnected || !walletAddress) {
        setError("Connect your wallet first.");
        return;
      }

      setError(null);
      setBurningUnit(unit);

      const anyWindow = window as any;
      const lucid = anyWindow.lucid;
      if (!lucid) {
        setError("Lucid is not initialized. Try reconnecting your wallet.");
        setBurningUnit(null);
        return;
      }

      const msg = inboxMessages.find((m) => m.unit === unit);
      if (!msg) {
        setError("Could not find this message in your inbox.");
        setBurningUnit(null);
        return;
      }

      const fromAddrMeta = msg.fromAddress;
      const toAddrMeta = msg.toAddress;

      if (!fromAddrMeta || !toAddrMeta) {
        setError("This message is missing required metadata to burn.");
        setBurningUnit(null);
        return;
      }

      const myAddr = await lucid.wallet.address();
      const myCred = lucid.utils.paymentCredentialOf(myAddr);
      const fromCred = lucid.utils.paymentCredentialOf(fromAddrMeta);
      const toCred = lucid.utils.paymentCredentialOf(toAddrMeta);
      const matotamCred = lucid.utils.paymentCredentialOf(DEV_ADDRESS);

      if (
        myCred.hash !== fromCred.hash &&
        myCred.hash !== toCred.hash &&
        myCred.hash !== matotamCred.hash
      ) {
        setError(
          "Only the original sender, the original recipient, or matotam can burn this message."
        );
        setBurningUnit(null);
        return;
      }

      const policyJson = {
        type: "any",
        scripts: [
          { type: "sig", keyHash: fromCred.hash },
          { type: "sig", keyHash: toCred.hash },
          { type: "sig", keyHash: matotamCred.hash },
        ],
      };

      const policy = lucid.utils.nativeScriptFromJson(policyJson);
      const policyId = lucid.utils.mintingPolicyToId(policy);

      if (!unit.startsWith(policyId)) {
        setError(
          "This message was minted with a different policy and cannot be burned from this wallet."
        );
        setBurningUnit(null);
        return;
      }

      const utxos = await lucid.utxosAt(walletAddress);
      const target = utxos.find((u: any) => {
        const qty = u.assets?.[unit];
        return typeof qty === "bigint" && qty > 0n;
      });

      if (!target) {
        setError("Could not find this NFT in your UTxOs.");
        setBurningUnit(null);
        return;
      }

      const tx = await lucid
        .newTx()
        .collectFrom([target])
        .mintAssets({ [unit]: -1n })
        .attachMintingPolicy(policy)
        .complete();

      const signed = await tx.sign().complete();
      const hash = await signed.submit();

      setTxHash(hash);
      setInboxMessages((prev) => prev.filter((m) => m.unit !== unit));
    } catch (e) {
      console.error(e);
      setError("Failed to burn message.");
    } finally {
      setBurningUnit(null);
    }
  }

  // ---------- Quick Burn (Quick Burn ID / unit) -----------------------

async function quickBurn() {
  try {
    if (!walletConnected || !walletAddress) {
      setError("Connect your wallet first.");
      return;
    }
    if (!quickBurnInput.trim()) {
      setError("Paste a Quick Burn ID first.");
      return;
    }
    if (!BLOCKFROST_KEY) {
      setError("Blockfrost key is not configured.");
      return;
    }

    setError(null);
    setTxHash(null);
    setQuickBurnLoading(true);

    const rawInput = quickBurnInput.trim();
    const unit = decodeQuickBurnIdToUnit(rawInput);

    if (!unit || !/^[0-9a-fA-F]+$/.test(unit)) {
      setError(
        "Invalid Quick Burn ID. Please copy the exact quickBurnId value from the NFT metadata."
      );
      return;
    }

    const anyWindow = window as any;
    const lucid = anyWindow.lucid;
    if (!lucid) {
      setError("Lucid is not initialized. Try reconnecting your wallet.");
      return;
    }

    const headers = { project_id: BLOCKFROST_KEY };

    let assetData: any;
    if (assetCache.has(unit)) {
      assetData = assetCache.get(unit);
    } else {
      const assetResp = await fetch(`${BLOCKFROST_API}/assets/${unit}`, {
        headers,
      });
      if (!assetResp.ok) {
        setError("Could not load this asset from Blockfrost.");
        return;
      }
      assetData = await assetResp.json();
      assetCache.set(unit, assetData);
    }

    const meta = assetData.onchain_metadata || {};
    const name = String(meta.name ?? "");
    const desc = String(meta.description ?? meta.Description ?? "");
    const source = String(meta.source ?? meta.Source ?? "");

    const isMatotam =
      source.toLowerCase().includes("matotam.io") ||
      name.toLowerCase().includes("matotam") ||
      desc.toLowerCase().includes("matotam");

    if (!isMatotam) {
      setError("This NFT does not look like a matotam message.");
      return;
    }

    let fromAddrMeta: string | null = null;
    let toAddrMeta: string | null = null;

    // v2: Sender / Receiver
    if (Array.isArray((meta as any).Sender)) {
      fromAddrMeta = ((meta as any).Sender as any[]).map(String).join("");
    } else if (Array.isArray(meta.fromAddressSegments)) {
      // v1 fallback
      fromAddrMeta = (meta.fromAddressSegments as any[]).map(String).join("");
    }

    if (Array.isArray((meta as any).Receiver)) {
      toAddrMeta = ((meta as any).Receiver as any[]).map(String).join("");
    } else if (Array.isArray(meta.toAddressSegments)) {
      // v1 fallback
      toAddrMeta = (meta.toAddressSegments as any[]).map(String).join("");
    }

    if (!fromAddrMeta || !toAddrMeta) {
      setError("This message is missing required metadata to burn.");
      return;
    }


    const myAddr = await lucid.wallet.address();
    const myCred = lucid.utils.paymentCredentialOf(myAddr);
    const fromCred = lucid.utils.paymentCredentialOf(fromAddrMeta);
    const toCred = lucid.utils.paymentCredentialOf(toAddrMeta);
    const matotamCred = lucid.utils.paymentCredentialOf(DEV_ADDRESS);

    if (
      myCred.hash !== fromCred.hash &&
      myCred.hash !== toCred.hash &&
      myCred.hash !== matotamCred.hash
    ) {
      setError(
        "Only the original sender, the original recipient, or matotam can burn this message."
      );
      return;
    }

    const policyJson = {
      type: "any",
      scripts: [
        { type: "sig", keyHash: fromCred.hash },
        { type: "sig", keyHash: toCred.hash },
        { type: "sig", keyHash: matotamCred.hash },
      ],
    };

    const policy = lucid.utils.nativeScriptFromJson(policyJson);
    const policyId = lucid.utils.mintingPolicyToId(policy);

    if (!unit.startsWith(policyId)) {
      setError(
        "This message was minted with a different policy and cannot be burned from this wallet."
      );
      return;
    }

    const utxos = await lucid.utxosAt(walletAddress);
    const target = utxos.find((u: any) => {
      const qty = u.assets?.[unit];
      return typeof qty === "bigint" && qty > 0n;
    });

    if (!target) {
      setError("Could not find this NFT in your UTxOs.");
      return;
    }

    const tx = await lucid
      .newTx()
      .collectFrom([target])
      .mintAssets({ [unit]: -1n })
      .attachMintingPolicy(policy)
      .complete();

    const signed = await tx.sign().complete();
    const hash = await signed.submit();

    setTxHash(hash);
    setQuickBurnInput("");
  } catch (e) {
    console.error(e);
    setError("Failed to burn message.");
  } finally {
    setQuickBurnLoading(false);
  }
}


  // ---------- send NFT ------------------------------------------------

  async function sendMessageAsNFT() {
    try {
      setError(null);
      setTxHash(null);
      setSuccess(null);

      if (!walletConnected) {
        setError("Connect your wallet first.");
        return;
      }
      if (!message.trim()) {
        setError("Message cannot be empty.");
        return;
      }
      if (!toAddress.trim()) {
        setError("Recipient is required.");
        return;
      }
      if (!BLOCKFROST_KEY) {
        setError("Blockfrost key is not configured.");
        return;
      }

      setLoading(true);

      const anyWindow = window as any;
      const lucid = anyWindow.lucid;
      if (!lucid) {
        setError("Lucid is not initialized. Try reconnecting your wallet.");
        setLoading(false);
        return;
      }

      // resolve recipient
      let recipientAddress = toAddress.trim();
      if (looksLikeAdaHandle(recipientAddress)) {
        const resolved = await resolveAdaHandle(recipientAddress);
        if (!resolved) {
          setError("Could not resolve ADA Handle.");
          setLoading(false);
          return;
        }
        recipientAddress = resolved;
      }

      const senderAddr = await lucid.wallet.address();
      const { toHex } = await import("lucid-cardano");


      const senderCred = lucid.utils.paymentCredentialOf(senderAddr);
      const recipientCred = lucid.utils.paymentCredentialOf(recipientAddress);
      const matotamCred = lucid.utils.paymentCredentialOf(DEV_ADDRESS);

      const policyJson = {
        type: "any",
        scripts: [
          { type: "sig", keyHash: senderCred.hash },
          { type: "sig", keyHash: recipientCred.hash },
          { type: "sig", keyHash: matotamCred.hash },
        ],
      };

      const policy = lucid.utils.nativeScriptFromJson(policyJson);
      const policyId = lucid.utils.mintingPolicyToId(policy);

     //--------------------------------------------------------------------
// THREAD + ASSET NAME GENERATION
//--------------------------------------------------------------------

// Last 3 chars of sender & receiver address (still human-friendly, shorter)
// This keeps assetNameBase <= 20 chars so quickBurnId stays <= 64 chars.
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
  messageSafeFull.length > 64 ? messageSafeFull.slice(0, 64) : messageSafeFull;

// Segments of full ASCII text
const messageSafeSegments = splitAsciiIntoSegments(messageSafeFull, 64);

// Burn info
const burnInfoFull =
  "To unlock the ADA in this message NFT, burn it on matotam.io. Burn can be done only by the sender, the receiver, or matotam."


// segmented long text
const burnInfoSegments = splitAsciiIntoSegments(burnInfoFull, 64);

const description = "On-chain message sent via matotam.io";

// Addresses
const fromShort = `${senderAddr.slice(0, 16)}...${senderAddr.slice(-4)}`;
const fromAddressSegments = splitIntoSegments(senderAddr, 64);
const toAddressSegments = splitIntoSegments(recipientAddress, 64);

// SVG bubble
const bubbleLines = wrapMessageForBubble(safeMessage);
const svg = buildBubbleSvg(bubbleLines);
const dataUri = svgToDataUri(svg);
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
      "Sender": fromAddressSegments,   // full address in segments
      "Receiver": toAddressSegments,   // full address in segments

      //"Message": messageSafeSegments.join(""),
      "Message": messageSafeSegments,

      // thread info
      Thread: threadId,
      "Thread index": seqStr,

      "Locked ADA": "1.5",

      createdAt: new Date().toISOString(), // nicer for pool.pm

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


      const tx = await lucid
        .newTx()
        .mintAssets({ [unit]: 1n })
        .attachMintingPolicy(policy)
        .attachMetadata(721, metadata721 as any)
        .payToAddress(recipientAddress, {
          lovelace: 1_500_000n,
          [unit]: 1n,
        })
        .payToAddress(DEV_ADDRESS, {
          lovelace: 1_000_000n, // 1 ADA dev fee
        })
        .complete();

      const signed = await tx.sign().complete();
      const hash = await signed.submit();

      setTxHash(hash);
      setToAddress("");
      setSuccess(
        "Your message was sent successfully. You can now enter another recipient or tweak the message and send again."
      );
    } catch (e) {

      console.error(e);
      setError("Failed to send transaction.");
    } finally {
      setLoading(false);
    }
  }

  // ---------- UI ------------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        {/* Logo + title + tabs */}
        <div className="flex flex-col items-center gap-3 mb-2">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <div className="h-9 px-5 rounded-full border border-sky-500 bg-sky-500/10 flex items-center justify-center text-[20px] font-semibold lowercase tracking-wide text-sky-300">
              matotam
            </div>
          </div>

          {/* Tagline */}
          <p className="text-xs sm:text-sm text-slate-300 text-center max-w-md">
            Send a message as an NFT directly to a Cardano wallet. Simple.
            Decentralized. No backend.
          </p>

          {/* Centered tabs */}
          <div className="inline-flex items-center justify-center rounded-full border border-slate-800 bg-slate-950/60 p-1 text-xs sm:text-sm mt-3 mb-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab("send");
                setTxHash(null);
                setError(null);
              }}
              className={`px-4 py-1 rounded-full transition ${
                activeTab === "send"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-sky-300"
              }`}
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("inbox");
                setTxHash(null);
                if (walletConnected && !inboxLoading) {
                  loadInbox();
                }
              }}
              className={`px-4 py-1 rounded-full transition ${
                activeTab === "inbox"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-sky-300"
              }`}
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("burn");
                setTxHash(null);
                setError(null);
              }}
              className={`px-4 py-1 rounded-full transition ${
                activeTab === "burn"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-sky-300"
              }`}
            >
              Quick Burn
            </button>
          </div>
        </div>


        {/* Main content */}
        {activeTab === "send" && (
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-4 space-y-4">
            <div>
              <label className="block text-sm mb-1">Message</label>
              <textarea
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                rows={4}
                maxLength={256}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
              />
              <div className="text-xs text-slate-500 mt-1 text-right">
                {message.length}/256 (stored on-chain as text + SVG image)
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">
                Recipient (Cardano address or ADA Handle)
              </label>
              <input
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="addr1... or $handle"
              />
            </div>
          </div>
        )}

        {activeTab === "inbox" && (
          <div className="space-y-3">
            {!walletConnected && (
              <p className="text-xs text-slate-400 text-center">
                Connect your wallet to see your matotam inbox.
              </p>
            )}

            {walletConnected && (
              <>
                <p className="text-[11px] text-slate-500">
                  Note: The inbox scans up to <span className="font-semibold">100 assets</span>{" "}
                  per wallet. For larger wallets, please use your wallet or pool.pm to
                  browse your matotam NFTs and the{" "}
                  <span className="font-semibold">Quick Burn</span> tab on matotam.io
                  to burn a message. Burn is only possible from the original sender
                  or the original recipient of the message.
                </p>

                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>Your inbox</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTxHash(null);
                      loadInbox();
                    }}
                    disabled={inboxLoading}
                    className="px-2 py-1 rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-300 disabled:opacity-60"
                  >
                    {inboxLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {inboxLoading && (
                  <p className="text-xs text-slate-400 text-center">
                    Loading messages…
                  </p>
                )}

                {!inboxLoading && inboxMessages.length === 0 && !error && (
                  <p className="text-xs text-slate-500 text-center">
                    No matotam messages found for this address yet.
                  </p>
                )}

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {inboxMessages.map((m) => (
                    <div
                      key={m.unit}
                      className="rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs space-y-1 hover:bg-slate-900 hover:border-sky-500 transition-colors"
                    >
                      {m.imageDataUri && (
                        <div className="mb-1">
                          <img
                            src={m.imageDataUri}
                            alt="matotam message preview"
                            className="w-full max-h-40 object-contain rounded-xl border border-slate-800"
                          />
                        </div>
                      )}

                      <p className="text-slate-100">
                        {m.textPreview || "(no text)"}
                      </p>

                      {m.createdAt && (
                        <p className="text-slate-500">
                          Received: {m.createdAt}
                        </p>
                      )}
                      {m.threadId && (
                        <p className="text-xs text-slate-500">
                          Thread: {m.threadId}
                          {m.threadIndex ? ` (#${m.threadIndex})` : ""}
                        </p>
                      )}


                      <p className="text-xs text-slate-500">
                        Asset:{" "}
                        {shortHash(`${m.policyId}.${m.assetName}`, 8, 6)}
                      </p>

                      {m.fromAddress && (
                        <p className="text-xs text-slate-500">
                          From: {shortHash(m.fromAddress, 12, 6)}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <a
                          href={
                            m.fingerprint
                              ? `https://pool.pm/${m.fingerprint}`
                              : `https://pool.pm/${m.unit}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-sky-400 hover:text-sky-300"
                        >
                          View on pool.pm
                        </a>

                        {m.fromAddress && walletConnected && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("send");
                              setTxHash(null);
                              setToAddress(m.fromAddress || "");
                              setMessage("");
                            }}
                            className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                          >
                            ↩ Reply
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => burnMessage(m.unit)}
                          disabled={burningUnit === m.unit}
                          className="inline-flex items-center gap-1 text-red-300 hover:text-red-200 disabled:opacity-60"
                        >
                          {burningUnit === m.unit
                            ? "Burning…"
                            : "🔥 Burn & reclaim ADA"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

{activeTab === "burn" && (
  <div className="space-y-4">
    {/* Nadpis + krátky popis */}
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-slate-200">Quick Burn</h2>
      <p className="text-xs text-slate-400">
        Quickly burn any matotam message NFT and reclaim the ADA inside.
      </p>
    </div>

    {/* Quick Burn ID input */}
    <div className="space-y-1">
      <input
        className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        placeholder="paste Quick Burn ID from NFT metadata..."
        value={quickBurnInput}
        onChange={(e) => setQuickBurnInput(e.target.value)}
      />
      <p className="text-[11px] text-slate-500">
        You can find your <span className="font-semibold">Quick Burn ID</span>{" "}
        in the NFT metadata (field <code>quickBurnId</code>) in your wallet or
        on pool.pm. Copy that value and paste it here.
      </p>
    </div>

    {/* Burn button + warning */}
    <div className="space-y-2">
      <button
        type="button"
        onClick={quickBurn}
        disabled={quickBurnLoading || !walletConnected}
        className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {quickBurnLoading ? "Burning…" : "🔥 Burn & reclaim ADA"}
      </button>
      <p className="text-[11px] text-slate-500">
        Burning permanently destroys the NFT — this action cannot be undone.
      </p>
    </div>

    {/* Requirements box */}
    <div className="rounded-2xl bg-slate-950/60 border border-slate-700 px-4 py-3 text-[11px] text-slate-400 space-y-1">
      <p className="font-xs text-slate-200">Requirements</p>
      <p>
        Burn is only possible from the{" "}
        <span className="font-semibold">original sender</span>, the{" "}
        <span className="font-semibold">original recipient</span>, or the{" "}
        <span className="font-semibold">matotam service address</span>.
      </p>
    </div>

  </div>
)}


{/* Connect / send buttons */}
<div className="flex items-center justify-between gap-3">
  {/* Ľavá strana: connect / wallet picker */}
  <div className="flex-1">
    {walletConnected ? (

      <button
        onClick={disconnectWallet}
        className="w-full rounded-2xl border border-red-400 text-red-300 hover:border-red-500 px-3 py-2 text-sm font-medium"
      >
        Disconnect wallet
      </button>
    ) : showWalletPicker && availableWallets.length > 1 ? (

      <div className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-3 text-xs space-y-2">
        <p className="text-[11px] text-slate-400">
          Choose a wallet to connect:
        </p>
        <div className="flex flex-wrap gap-2">
          {availableWallets.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => connectWithWallet(id)}
              className="px-3 py-1 rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-400"
            >
              {WALLET_LABELS[id] ?? id}
            </button>
          ))}
        </div>
      </div>
    ) : (

      <button
        onClick={handleConnectClick}
        className="w-full rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-400 px-3 py-2 text-sm font-medium"
      >
        Connect wallet
      </button>
    )}
  </div>

  {/* Pravá strana: Send button len v Send tabu */}
  {activeTab === "send" && (
    <button
      onClick={sendMessageAsNFT}
      disabled={loading}
      className="flex-1 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60"
    >
      {loading ? "Sending..." : "Send as NFT"}
    </button>
  )}
</div>


        {/* Wallet address */}
        {walletAddress && (
          <p className="text-xs text-slate-400 text-center font-mono break-all">
            Your address: {walletAddress}
          </p>
        )}

        {/* Error + success + tx hash */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-2xl px-3 py-2 mt-2">
            {error}
          </div>
        )}

        {success && (
          <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-700 rounded-2xl px-3 py-2 mt-2">
            {success}
          </div>
        )}

        {txHash && (
          <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-700 rounded-2xl px-3 py-2 mt-2">
            Tx submitted:{" "}
            <span className="font-mono break-all">{txHash}</span>
          </div>
        )}


        {/* Info dropdowns */}
        <div className="mt-4 border-t border-slate-800 pt-4 text-[11px] text-slate-400 space-y-2">
          <details className="rounded-2xl bg-slate-950/60 border border-slate-800 px-3 py-2">
            <summary className="cursor-pointer font-semibold text-slate-200 list-none">
              How it works
            </summary>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <p>① You write a short message (up to 256 characters).</p>
              <p>
                ② Your wallet signs a transaction that mints a tiny NFT
                containing your message as text plus a small on-chain SVG bubble
                image.
              </p>
              <p>
                ③ The NFT is sent to the recipient’s Cardano address (or ADA
                Handle) and appears in their wallet or on pool.pm.
              </p>
              <p>
                ④ This message NFT can later be burned by the original sender,
                the original recipient, or the matotam service address to
                reclaim most of the ADA locked inside.
              </p>
            </div>
          </details>

          <details className="rounded-2xl bg-slate-950/60 border border-slate-800 px-3 py-2">
            <summary className="cursor-pointer font-semibold text-slate-200 list-none">
              Disclaimer
            </summary>
            <div className="mt-2 space-y-1">
              <p>
                Messages are stored permanently on the Cardano blockchain —
                please avoid sharing sensitive information.
              </p>
              <p>
                The developer fee corresponds to Cardano’s minimum UTxO
                requirement, which is approximately 1 ADA.
              </p>
              <p>
                The remaining cost covers Cardano network and minting fees.
                Most of the ADA locked in a message NFT can be reclaimed later
                by burning it from either the sender’s or the recipient’s
                wallet.
              </p>
            </div>
          </details>
        </div>

        <div className="mt-6 pt-3 border-t border-slate-800/60 text-center space-y-1">
          <p className="text-[10px] text-slate-600">
            matotam • on-chain messaging for Cardano • v0.1 beta
          </p>

          <p className="text-[9px] text-slate-500">
            Follow on{" "}
            <a
              href="https://x.com/matotam_ada"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300"
            >
              X (@matotam_ada)
            </a>{" "}
            • <span className="font-mono text-slate-400">$matotam</span>
          </p>
        </div>

      </div>
    </main>
  );
}