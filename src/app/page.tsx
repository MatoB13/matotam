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

// ADA Handle mainnet policy
const ADA_HANDLE_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

// MAINNET dev fee address (0.1 ADA)
const DEV_ADDRESS =
  "addr1q8d5hu0c0x9vyk1qdshkx6t0mw3t9tv46c6g4vwqecduqq2e9wy54x7ffcdly855h96s805k9e3z4pgpmeyu5tjfudfsksgfnq";

type MatotamMessage = {
  unit: string;
  policyId: string;
  assetName: string;
  fingerprint?: string;
  fullText: string;
  textPreview: string;
  createdAt?: string;
  fromAddress?: string;
  imageDataUri?: string;
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"send" | "inbox">("send");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<MatotamMessage[]>([]);
  const [burningUnit, setBurningUnit] = useState<string | null>(null);

  // ---------- helpers -------------------------------------------------

  function splitMessageIntoSegments(text: string, segmentSize = 64): string[] {
    const trimmed = text.slice(0, 256);
    const segments: string[] = [];
    for (let i = 0; i < trimmed.length; i += segmentSize) {
      segments.push(trimmed.slice(i, i + segmentSize));
    }
    return segments;
  }

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
        current =
          word.length > maxLineLength ? word.slice(0, maxLineLength) : word;
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

  function chunkString(str: string, size = 64): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
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
      const name = raw.startsWith("$") ? raw.slice(1) : raw;
      if (!name) return null;

      const { toHex } = await import("lucid-cardano");
      const bytes = new TextEncoder().encode(name);
      const assetNameHex = toHex(bytes);
      const unit = ADA_HANDLE_POLICY_ID + assetNameHex;

      const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}/addresses`, {
        headers: { project_id: BLOCKFROST_KEY },
      });

      if (!resp.ok) return null;
      const data: any = await resp.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const addr = data[0]?.address;
      return typeof addr === "string" ? addr : null;
    } catch (err) {
      console.error("resolveAdaHandle error", err);
      return null;
    }
  }

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
      setTxHash(null);

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
      setWalletAddress(addr);
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
    setTxHash(null);
    setError(null);
    setShowWalletPicker(false);
    setInboxMessages([]);
  }

  // ---------- inbox ---------------------------------------------------

  async function loadInbox() {
    try {
      if (!walletConnected || !walletAddress) {
        setError("Connect your wallet to see your inbox.");
        return;
      }
      if (!BLOCKFROST_KEY) {
        setError("Blockfrost key is not configured.");
        return;
      }

      setError(null);
      setInboxLoading(true);
      setInboxMessages([]);

      const assetsResp = await fetch(
        `${BLOCKFROST_API}/addresses/${walletAddress}/assets`,
        { headers: { project_id: BLOCKFROST_KEY } }
      );

      if (assetsResp.status === 404) {
        setInboxMessages([]);
        setInboxLoading(false);
        return;
      }

      if (!assetsResp.ok) {
        throw new Error(`Failed to load assets: ${assetsResp.status}`);
      }

      const assets: any[] = await assetsResp.json();
      const messages: MatotamMessage[] = [];

      for (const asset of assets.slice(0, 50)) {
        const unit: string = asset.unit;
        const assetResp = await fetch(`${BLOCKFROST_API}/assets/${unit}`, {
          headers: { project_id: BLOCKFROST_KEY },
        });
        if (!assetResp.ok) continue;

        const assetData: any = await assetResp.json();
        const meta = assetData.onchain_metadata;
        if (!meta) continue;

        const name = String(meta.name ?? "");
        const desc = String(meta.description ?? "");

        const isMatotam =
          name.toLowerCase().startsWith("matotam") ||
          desc.toLowerCase().includes("matotam.io");
        if (!isMatotam) continue;

        const segments = Array.isArray(meta.messageSegments)
          ? meta.messageSegments.map((s: any) => String(s))
          : [];
        const fullText =
          segments.length > 0 ? segments.join("") : String(meta.message ?? "");

        const preview =
          fullText.length > 80
            ? fullText.slice(0, 77) + "..."
            : fullText || name;

        const createdAt = meta.createdAt ? String(meta.createdAt) : undefined;

        let fromAddress: string | undefined;
        if (Array.isArray(meta.fromAddressSegments)) {
          const fromSegs = meta.fromAddressSegments.map((s: any) =>
            String(s)
          );
          fromAddress = fromSegs.join("");
        } else if (typeof meta.from === "string") {
          fromAddress = meta.from;
        }

        let imageDataUri: string | undefined;
        if (Array.isArray(meta.image)) {
          const imgChunks = meta.image.map((s: any) => String(s));
          if (imgChunks.length > 0) imageDataUri = imgChunks.join("");
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

  // ---------- burn ----------------------------------------------------

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

      const senderAddr = await lucid.wallet.address();
      const paymentCred = lucid.utils.paymentCredentialOf(senderAddr);

      const policy = lucid.utils.nativeScriptFromJson({
        type: "sig",
        keyHash: paymentCred.hash,
      });
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

      // minting policy based on sender's payment key
      const paymentCred = lucid.utils.paymentCredentialOf(senderAddr);
      const policy = lucid.utils.nativeScriptFromJson({
        type: "sig",
        keyHash: paymentCred.hash,
      });
      const policyId = lucid.utils.mintingPolicyToId(policy);

      const shortMsg = message.trim().slice(0, 12) || "msg";
      const assetName = `matotam-${shortMsg}`;
      const assetNameBytes = new TextEncoder().encode(assetName);
      const assetNameHex = toHex(assetNameBytes);
      const unit = policyId + assetNameHex;

      const messageSegments = splitMessageIntoSegments(message);
      const bubbleLines = wrapMessageForBubble(message);
      const fromAddressSegments = splitMessageIntoSegments(senderAddr, 64);

      const svg = buildBubbleSvg(bubbleLines);
      const dataUri = svgToDataUri(svg);
      const imageChunks = chunkString(dataUri, 64);

      const description = "On-chain message sent via matotam.io";

      const metadata = {
        [policyId]: {
          "": {
            name: "matotam",
            description: "matotam – on-chain messages as NFTs",
            source: "https://matotam.io",
          },
          [assetName]: {
            name: assetName,
            description:
              description.length > 64 ? description.slice(0, 64) : description,
            messageSegments,
            bubbleLines,
            image: imageChunks,
            mediaType: "image/svg+xml",
            createdAt: Date.now().toString(),
            fromAddressSegments,
            source: "https://matotam.io",
          },
        },
      };

      const tx = await lucid
        .newTx()
        .mintAssets({ [unit]: 1n })
        .attachMintingPolicy(policy)
        .attachMetadata(721, metadata)
        .payToAddress(recipientAddress, {
          lovelace: 1_500_000n,
          [unit]: 1n,
        })
        .payToAddress(DEV_ADDRESS, {
          lovelace: 100_000n,
        })
        .changeAddress(senderAddr)
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
        {/* Tabs + title */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => {
                setActiveTab("send");
                setTxHash(null);
              }}
              className={`px-3 py-1 rounded-2xl border ${
                activeTab === "send"
                  ? "border-sky-500 bg-sky-500/10 text-sky-300"
                  : "border-slate-700 text-slate-400 hover:border-sky-500 hover:text-sky-300"
              }`}
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("inbox");
                setTxHash(null);
                if (walletConnected && walletAddress) loadInbox();
              }}
              className={`px-3 py-1 rounded-2xl border ${
                activeTab === "inbox"
                  ? "border-sky-500 bg-sky-500/10 text-sky-300"
                  : "border-slate-700 text-slate-400 hover:border-sky-500 hover:text-sky-300"
              }`}
            >
              Inbox
            </button>
          </div>
        </div>

        <div className="text-center text-4xl font-bold tracking-tight">
          matotam
        </div>

        <p className="text-sm text-slate-300 text-center">
          Send a message as an NFT directly to a Cardano wallet. Simple.
          Decentralized. No backend.
        </p>

        {/* Wallet picker */}
        {showWalletPicker && availableWallets.length > 1 && (
          <div className="rounded-2xl bg-slate-950 border border-slate-700 px-3 py-3 text-sm space-y-2">
            <p className="text-xs text-slate-400">
              Choose a wallet to connect:
            </p>
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
        {activeTab === "send" ? (
          <div className="space-y-4">
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
        ) : (
          <div className="space-y-3">
            {!walletConnected && (
              <p className="text-xs text-slate-400 text-center">
                Connect your wallet to see your matotam inbox.
              </p>
            )}

            {walletConnected && (
              <>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Your inbox</span>
                  <button
                    type="button"
                    onClick={loadInbox}
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

                {!inboxLoading && inboxMessages.length === 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    No matotam messages found for this address yet.
                  </p>
                )}

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {inboxMessages.map((m) => (
                    <div
                      key={m.unit}
                      className="rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs space-y-1"
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
                            {new Date(
                              Number(m.createdAt)
                            ).toLocaleString()}
                          </p>
                        )}

                      <p className="text-slate-500 break-all">
                        Asset: {m.policyId}.{m.assetName}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <a
                          href={`https://pool.pm/${m.policyId}.${m.assetName}`}
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
                              setToAddress(m.fromAddress || "");
                              setMessage("");
                              setTxHash(null);
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

        {/* Connect / send buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={walletConnected ? disconnectWallet : handleConnectClick}
            className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-medium ${
              walletConnected
                ? "border-red-400 text-red-300 hover:border-red-500"
                : "border-slate-600 hover:border-sky-500 hover:text-sky-400"
            }`}
          >
            {walletConnected ? "Disconnect wallet" : "Connect wallet"}
          </button>

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
          <p className="text-xs text-emerald-400 text-center font-mono break-all">
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
            <div className="mt-2 space-y-1">
              <p>① You write a short message (up to 256 characters).</p>
              <p>
                ② Your wallet signs a transaction that mints a tiny NFT
                containing your message as text plus a small SVG bubble image.
              </p>
              <p>
                ③ The NFT is sent to the recipient&apos;s Cardano address (or
                ADA Handle) and appears in their wallet / on pool.pm.
              </p>
              <p>
                ④ Each message NFT holds the minimum ADA. The recipient can burn
                the message in the Inbox (if it was minted from their wallet
                policy) to reclaim most of that ADA.
              </p>
            </div>
          </details>

          <details className="rounded-2xl bg-slate-950/60 border border-slate-800 px-3 py-2">
            <summary className="cursor-pointer font-semibold text-slate-200 list-none">
              Disclaimer
            </summary>
            <div className="mt-2 space-y-1">
              <p>
                Messages are stored permanently on the Cardano blockchain — do
                not send sensitive information.
              </p>
              <p>
                Developer fee is 0.1 ADA. The remaining cost comes from Cardano
                network and minting fees.
              </p>
              <p>
                Most of the ADA locked in a message NFT can be reclaimed later
                by burning it in your Inbox (if your wallet is allowed to burn
                under that policy).
              </p>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
