"use client";

import { useState } from "react";
import { decodeMessageFromBase64 } from "./lib/textEncoding";
import {
  WALLET_LABELS,
  BLOCKFROST_API,
  BLOCKFROST_KEY,
  ADA_HANDLE_POLICY_ID,
  DEV_ADDRESS,
} from "./lib/constants";
import { MatotamMessage } from "./lib/types";
import { splitIntoSegments } from "./lib/segments";
import {
  encodeUnitToQuickBurnId,
  decodeQuickBurnIdToUnit,
  parseQuickBurnInput,
} from "./lib/quickBurn";
import { looksLikeAdaHandle, resolveAdaHandle } from "./lib/adaHandle";
import { shortHash } from "./lib/utils";
import {
  handleConnectClick as coreHandleConnectClick,
  connectWithWallet as coreConnectWithWallet,
  disconnectWallet as coreDisconnectWallet,
} from "./lib/wallet";
import { buildMatotamMintData } from "./lib/mint";
import { fetchInboxMessages } from "./lib/inbox";
import { burnMatotamNFT } from "./lib/burn";
import SendTab from "./components/SendTab";
import InboxTab from "./components/InboxTab";
import BurnTab from "./components/BurnTab";
import WalletControls from "./components/WalletControls";
import InfoPanels from "./components/InfoPanels";
import Footer from "./components/Footer";
import {
  encryptMessageWithPassphrase,
  EncryptedPayload,
} from "./lib/encryption";


const assetCache = new Map<string, any>();

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
  const [needsInboxPolicy, setNeedsInboxPolicy] = useState(false);
  const [quickBurnInput, setQuickBurnInput] = useState("");
  const [quickBurnLoading, setQuickBurnLoading] = useState(false);
  const [sendEncrypted, setSendEncrypted] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");


    // --- Wallet wrappers (delegate to lib/wallet.ts, keep original names) ---

  async function handleConnectClick() {
    await coreHandleConnectClick(
      setError,
      setTxHash,
      setAvailableWallets,
      setShowWalletPicker,
      connectWithWallet
    );
  }

  async function connectWithWallet(id: string) {
    await coreConnectWithWallet(
      id,
      setError,
      setWalletConnected,
      setWalletAddress,
      setStakeAddress,
      setShowWalletPicker
    );
  }

  function disconnectWallet() {
    coreDisconnectWallet(
      setWalletConnected,
      setWalletAddress,
      setStakeAddress,
      setTxHash,
      setError,
      setSuccess,
      setShowWalletPicker,
      setInboxMessages
    );
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
    setNeedsInboxPolicy(false);
    setInboxLoading(true);

    const msgs = await fetchInboxMessages({
      walletAddress,
      stakeAddress,
      blockfrostKey: BLOCKFROST_KEY,
      blockfrostApi: BLOCKFROST_API,
    });

    setInboxMessages(msgs);
  } catch (e: any) {
    if (e?.message === "too_many_assets") {
      // Large wallet – switch to "policy mode" instead of hard error
      setInboxMessages([]);
      setNeedsInboxPolicy(true);
      setError(null);
    } else {
      setError("Failed to load inbox.");
    }
  } finally {
    setInboxLoading(false);
  }
}

async function loadInboxForPolicy(policyId: string) {
  try {
    if (!walletConnected) {
      setError("Connect your wallet to see your inbox.");
      return;
    }
    if (!BLOCKFROST_KEY) {
      setError("Blockfrost key is not configured.");
      return;
    }

    const trimmed = policyId.trim();
    if (!trimmed) {
      setError("Please enter a policy ID.");
      return;
    }

    setError(null);
    setInboxLoading(true);

    const msgs = await fetchInboxMessages({
      walletAddress,
      stakeAddress,
      blockfrostKey: BLOCKFROST_KEY,
      blockfrostApi: BLOCKFROST_API,
      policyIdFilter: trimmed,
    });

    setInboxMessages(msgs);
    setNeedsInboxPolicy(false);
  } catch (e: any) {
    console.error(e);
    setError("Failed to load inbox for this policy.");
  } finally {
    setInboxLoading(false);
  }
}

function handleReply(address: string) {
  setActiveTab("send");
  setTxHash(null);
  setToAddress(address);
  setMessage("");
  setError(null);
}

  // ---------- burn from inbox -------------------------------------------

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

      try {
        const hash = await burnMatotamNFT({
          lucid,
          walletAddress,
          unit,
          fromAddrMeta,
          toAddrMeta,
          devAddress: DEV_ADDRESS,
        });

        setTxHash(hash);
        setInboxMessages((prev) => prev.filter((m) => m.unit !== unit));
      } catch (err: any) {
        if (err?.message === "not_authorized") {
          setError(
            "Only the original sender, the original recipient, or matotam can burn this message."
          );
        } else if (err?.message === "wrong_policy") {
          setError(
            "This message was minted with a different policy and cannot be burned from this wallet."
          );
        } else if (err?.message === "no_utxo") {
          setError("Could not find this NFT in your UTxOs.");
        } else {
          console.error(err);
          setError("Failed to burn message.");
        }
      }
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


    try {
      const hash = await burnMatotamNFT({
        lucid,
        walletAddress,
        unit,
        fromAddrMeta,
        toAddrMeta,
        devAddress: DEV_ADDRESS,
      });

      setTxHash(hash);
      setQuickBurnInput("");
    } catch (err: any) {
      if (err?.message === "not_authorized") {
        setError(
          "Only the original sender, the original recipient, or matotam can burn this message."
        );
      } else if (err?.message === "wrong_policy") {
        setError(
          "This message was minted with a different policy and cannot be burned from this wallet."
        );
      } else if (err?.message === "no_utxo") {
        setError("Could not find this NFT in your UTxOs.");
      } else {
        console.error(err);
        setError("Failed to burn message.");
      }
      return;
    }

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
      if (sendEncrypted) {
        if (!passphrase.trim()) {
          setError("Passphrase is required when encryption is enabled.");
          return;
        }
        if (passphrase.trim() !== confirmPassphrase.trim()) {
          setError("Passphrase and confirmation do not match.");
          return;
        }
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

      if (sendEncrypted && !passphrase.trim()) {
        setError("Passphrase is required when encryption is enabled.");
        return;
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

      let encryptedPayload: EncryptedPayload | undefined;
      if (sendEncrypted) {
        // Derive an encrypted payload from the raw message + passphrase.
        // Only ciphertext + crypto params will go on-chain.
        encryptedPayload = await encryptMessageWithPassphrase(
          message,
          passphrase.trim()
        );
      }

      const { unit, metadata721 } = await buildMatotamMintData({
        senderAddr,
        recipientAddress,
        message,
        policyId,
        encryptedPayload, // NEW (optional)
      });


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
      // Optional: reset encryption state for the next message
      setSendEncrypted(false);
      setPassphrase("");
      setConfirmPassphrase("");
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
          <SendTab
            message={message}
            setMessage={setMessage}
            toAddress={toAddress}
            setToAddress={setToAddress}
            loading={loading}
            onSend={sendMessageAsNFT}
            sendEncrypted={sendEncrypted}
            setSendEncrypted={setSendEncrypted}
            passphrase={passphrase}
            setPassphrase={setPassphrase}
            confirmPassphrase={confirmPassphrase}              
            setConfirmPassphrase={setConfirmPassphrase} 
          />
        )}

        {activeTab === "inbox" && (
          <InboxTab
            walletConnected={walletConnected}
            inboxLoading={inboxLoading}
            inboxMessages={inboxMessages}
            burningUnit={burningUnit}
            loadInbox={loadInbox}
            loadInboxForPolicy={loadInboxForPolicy}
            needsInboxPolicy={needsInboxPolicy}
            burnMessage={burnMessage}
            onReply={handleReply}
          />
        )}

{activeTab === "burn" && (
  <BurnTab
    walletConnected={walletConnected}
    quickBurnInput={quickBurnInput}
    setQuickBurnInput={setQuickBurnInput}
    quickBurnLoading={quickBurnLoading}
    onQuickBurn={quickBurn}
  />
)}



{/* Connect / send buttons */}
<div className="flex items-center justify-between gap-3">
  {/* Ľavá strana: connect / wallet picker */}
  <div className="flex-1">
    <WalletControls
      walletConnected={walletConnected}
      showWalletPicker={showWalletPicker}
      availableWallets={availableWallets}
      onConnectClick={handleConnectClick}
      onDisconnectClick={disconnectWallet}
      onConnectSpecificWallet={connectWithWallet}
    />
  </div>


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
        <InfoPanels />
        <Footer />


      </div>
    </main>
  );
}