"use client";

import { useState } from "react";

const WALLET_LABELS: Record<string, string> = {
  nami: "Nami",
  eternl: "Eternl",
  lace: "Lace",
  vespr: "VESPR",
  flint: "Flint",
};

// Blockfrost config – MAINNET
const BLOCKFROST_API = "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_KEY = "mainnetjK2y8L83PWohEHDWRNgO5UjeMG3A3kJe";

// ADA Handle mainnet policy (OG collection)
const ADA_HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

// MAINNET matotam dev / service address (0.1 ADA fee, môže burnovať)
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
};

// jednoduchý cache pre /assets/{unit}
const assetCache = new Map<string, any>();

// ---------- helpers -------------------------------------------------

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

// ADA Handle resolver – handle.me + Blockfrost + CIP-25 fallback
async function resolveAdaHandle(handle: string): Promise<string | null> {
  try {
    const raw = handle.trim();
    const base = raw.startsWith("$") ? raw.slice(1) : raw;
    const name = base.trim();
    if (!name) return null;

    //
    // 1) Pokus cez oficiálne ADA Handle API (api.handle.me)
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
    // 2) Fallback – starý CIP-25 resolver cez Blockfrost
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
      const assetNameHex = toHex(bytes);
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
  maxLineLength = 24,
  maxLines = 5
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
  const startY = 120;

  const textElements = safeLines
    .map((line, idx) => {
      const y = startY + idx * lineHeight;
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<text x="300" y="${y}" text-anchor="middle"
          fill="#e5e7eb" font-size="22"
          font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
          ${escaped}
        </text>`;
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340">
  <rect x="40" y="40" width="520" height="240" rx="40" ry="40"
        fill="#0b1120" stroke="#0ea5e9" stroke-width="4" />
  <path d="M 260 280 L 275 320 L 315 280"
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

  // ak je to URL (napr. pool.pm), vezmeme posledný segment za '/'
  if (id.startsWith("http://") || id.startsWith("https://")) {
    const parts = id.split("/");
    id = parts[parts.length - 1] || "";
  }

  if (!id) return { unit: null, fingerprintLike: false };

  // fingerprint asset1...
  if (/^asset1[0-9a-z]+$/i.test(id)) {
    return { unit: null, fingerprintLike: true };
  }

  // Quick Burn ID = čistý hex (unit)
  if (/^[0-9a-fA-F]+$/.test(id)) {
    return { unit: id, fingerprintLike: false };
  }

  return { unit: null, fingerprintLike: false };
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

      // 1) Skúsime stake účet – prvá stránka, max 100 assetov
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

      // 2) Fallback – jedna adresa
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

      // 3) Ak prvá stránka vrátila presne 100 assetov, považujeme wallet za „veľkú“
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

        // CACHE: ak už asset máme, nepýtame sa Blockfrost znova
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

        let fullText = "";
        if (Array.isArray(meta.messageSegments)) {
          fullText = meta.messageSegments.map((s: any) => String(s)).join("");
        } else if (typeof meta.message === "string") {
          fullText = meta.message;
        } else {
          fullText = desc || name || "";
        }

        const preview =
          fullText.length > 80 ? fullText.slice(0, 77) + "..." : fullText || name;

        const createdAt = meta.createdAt ? String(meta.createdAt) : undefined;

        let fromAddress: string | undefined;
        if (Array.isArray(meta.fromAddressSegments)) {
          fromAddress = (meta.fromAddressSegments as any[]).map(String).join("");
        }

        let toAddressFull: string | undefined;
        if (Array.isArray(meta.toAddressSegments)) {
          toAddressFull = (meta.toAddressSegments as any[]).map(String).join("");
        }

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

      const { unit, fingerprintLike } = parseQuickBurnInput(quickBurnInput);
      if (!unit) {
        if (fingerprintLike) {
          setError(
            "This looks like a fingerprint (asset1...). Please open the NFT in your wallet or on pool.pm, find the quickBurnId field in the metadata and paste that value here."
          );
        } else {
          setError("Invalid Quick Burn ID. Please check the input.");
        }
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

      if (Array.isArray(meta.fromAddressSegments)) {
        fromAddrMeta = (meta.fromAddressSegments as any[]).map(String).join("");
      }
      if (Array.isArray(meta.toAddressSegments)) {
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

      // 3-sig policy: sender OR recipient OR matotam môže mint/burn
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

      const safeMessage = message.trim().slice(0, 256);
      const messageSegments = splitIntoSegments(safeMessage, 64);

      const messagePreview =
        safeMessage.length > 61 ? safeMessage.slice(0, 61) + "..." : safeMessage;

      const description = "On-chain message sent via matotam.io";

      const fromShort = `${senderAddr.slice(0, 16)}...${senderAddr.slice(-4)}`;
      const fromAddressSegments = splitIntoSegments(senderAddr, 64);
      const toAddressSegments = splitIntoSegments(recipientAddress, 64);

      const policyLabel = `tam from ${fromShort}`;

      // SVG bubble + image data URI, rozkúskované na 64-znakové segmenty
      const bubbleLines = wrapMessageForBubble(safeMessage);
      const svg = buildBubbleSvg(bubbleLines);
      const dataUri = svgToDataUri(svg);

      const MAX_IMAGE_CHARS = 4096;
      const shortenedDataUri = dataUri.slice(0, MAX_IMAGE_CHARS);
      const imageChunks = splitIntoSegments(shortenedDataUri, 64);

      const assetNameBase = `matotam-${safeMessage.slice(0, 12) || "msg"}`;
      const assetNameBytes = new TextEncoder().encode(assetNameBase);
      const assetNameHex = toHex(assetNameBytes);
      const unit = policyId + assetNameHex;

      const rawMetadata721 = {
        [policyId]: {
          [assetNameBase]: {
            name: assetNameBase,
            description,
            messagePreview,
            messageSegments,
            image: imageChunks,
            mediaType: "image/svg+xml",
            createdAt: Date.now().toString(),
            fromShort,
            fromAddressSegments,
            toAddressSegments,
            source: "https://matotam.io",
            policyLabel,
            quickBurnId: unit,
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

        {/* Wallet picker */}
        {showWalletPicker && availableWallets.length > 1 && (
          <div className="rounded-2xl bg-slate-950 border border-slate-700 px-3 py-3 text-sm space-y-2">
            <p className="text-xs text-slate-400">Choose a wallet to connect:</p>
            <div className="flex flex-wrap gap-2">
              {availableWallets.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => connectWithWallet(id)}
                  className="px-3 py-1 rounded-2xl border border-slate-600 text-xs hover:border-sky-500 hover:text-sky-400"
                >
                  {WALLET_LABELS[id] ?? id}
                </button>
              ))}
            </div>
          </div>
        )}

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

                      {m.createdAt &&
                        !Number.isNaN(Number(m.createdAt)) && (
                          <p className="text-slate-500">
                            Received:{" "}
                            {new Date(Number(m.createdAt)).toLocaleString()}
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
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-4 space-y-3 text-xs sm:text-sm text-slate-300">
            <div>
              <p className="font-semibold text-slate-100 mb-1">Quick Burn</p>
              <p className="text-slate-400">
                Burn a specific matotam message NFT and reclaim the ADA locked
                inside. Ideal for wallets with many NFTs. Burn is only possible
                from the original sender or the original recipient of the
                message (or the matotam service address).
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm mb-1">Quick Burn ID</label>
              <input
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={quickBurnInput}
                onChange={(e) => setQuickBurnInput(e.target.value)}
                placeholder="paste quickBurnId (unit hex)..."
              />
              <p className="text-[11px] text-slate-500">
                You can find your <span className="font-semibold">quickBurnId</span>{" "}
                in the NFT metadata (field <code>quickBurnId</code>) in your
                wallet or on pool.pm. Copy that value and paste it here to burn
                the message and reclaim ADA.
              </p>
            </div>

            <button
              type="button"
              onClick={quickBurn}
              disabled={quickBurnLoading}
              className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-1"
            >
              {quickBurnLoading ? "Burning…" : "🔥 Burn & reclaim ADA"}
            </button>

            <p className="text-[11px] text-slate-500">
              Burning permanently destroys the NFT — this action cannot be
              undone.
            </p>
          </div>
        )}

        {/* Connect / send buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={walletConnected ? disconnectWallet : handleConnectClick}
            className={`w-full sm:flex-1 rounded-2xl border px-3 py-2 text-sm font-medium ${
              walletConnected
                ? "border-slate-500 text-slate-300 hover:border-slate-400"
                : "border-slate-600 hover:border-sky-500 hover:text-sky-400"
            }`}
          >
            {walletConnected ? "Disconnect wallet" : "Connect wallet"}
          </button>

          {activeTab === "send" && (
            <button
              onClick={sendMessageAsNFT}
              disabled={loading}
              className="w-full sm:flex-1 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60"
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

        {/* Error + tx hash */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-2xl px-3 py-2 mt-2">
            {error}
          </div>
        )}

        {txHash && (
          <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded-2xl px-3 py-2 mt-2">
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

        <p className="text-[10px] text-slate-500 text-center mt-3">
          matotam • on-chain messaging for Cardano • v0.1 beta
        </p>
      </div>
    </main>
  );
}
