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
} from "./lib/quickBurn";
import {
  resolveAdaHandle,          // <-- FIXED NAME
  reverseLookupAdaHandle,
} from "./lib/adaHandle";
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


  async function connectWithWallet(walletName: string) {
    await coreConnectWithWallet(
      walletName,
      setError,
      setWalletConnected,
      setWalletAddress,
      setStakeAddress,
      setShowWalletPicker
    );
  }

  async function disconnectWallet() {
    await coreDisconnectWallet(
      setError,
      setWalletConnected,
      setWalletAddress,
      setStakeAddress
    );
  }

  // --- Helper to resolve $handles etc. ---

  async function resolveRecipient(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Recipient is empty.");
    }

    // ADA handle
    if (trimmed.startsWith("$")) {
      if (!BLOCKFROST_KEY) {
        throw new Error("Blockfrost key is not configured.");
      }
      const handle = trimmed.slice(1);

      // FIX: use resolveAdaHandle (existing export in adaHandle.ts)
      const resolved = await resolveAdaHandle(
        handle,
        ADA_HANDLE_POLICY_ID,
        BLOCKFROST_API,
        BLOCKFROST_KEY
      );
      if (!resolved) {
        throw new Error(`Could not resolve ADA handle ${trimmed}`);
      }
      return resolved;
    }

    // Normal address
    return trimmed;
  }

  // -------------------------------------------------------------------
  // INBOX LOAD + BURN
  // -------------------------------------------------------------------

  async function loadInbox() {
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

    try {
      const msgs = await fetchInboxMessages({
        walletAddress,
        stakeAddress,
        blockfrostApi: BLOCKFROST_API,
        blockfrostKey: BLOCKFROST_KEY,
        assetCache,
      });

      setInboxMessages(msgs);
      setNeedsInboxPolicy(false);
    } catch (e: any) {
      console.error(e);
      if (
        typeof e?.message === "string" &&
        e.message.includes("No matotam messages found for your wallet")
      ) {
        setInboxMessages([]);
        setNeedsInboxPolicy(true);
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
        blockfrostApi: BLOCKFROST_API,
        blockfrostKey: BLOCKFROST_KEY,
        assetCache,
        overridePolicyId: trimmed,
      });
      setInboxMessages(msgs);
      setNeedsInboxPolicy(false);
    } catch (e) {
      console.error(e);
      setError("Failed to load inbox for the given policy.");
    } finally {
      setInboxLoading(false);
    }
  }

  async function burnMessage(unit: string) {
    if (!walletConnected) {
      setError("Connect your wallet to burn messages.");
      return;
    }
    if (!BLOCKFROST_KEY) {
      setError("Blockfrost key is not configured.");
      return;
    }

    setError(null);
    setTxHash(null);
    setBurningUnit(unit);

    try {
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
        const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}`, {
          headers,
        });
        if (!resp.ok) {
          throw new Error("Unable to fetch asset data from Blockfrost.");
        }
        assetData = await resp.json();
        assetCache.set(unit, assetData);
      }

      // Burn the NFT using the helper from lib/burn.ts
      const hash = await burnMatotamNFT({
        lucid,
        asset: assetData,
        walletAddress,
        devAddress: DEV_ADDRESS,
      });

      setTxHash(hash);
      setSuccess("Message burned successfully.");
    } catch (e) {
      console.error(e);
      setError("Failed to burn the message.");
    } finally {
      setBurningUnit(null);
    }
  }

  // -------------------------------------------------------------------
  // QUICK BURN TAB
  // -------------------------------------------------------------------

  async function handleQuickBurn() {
    try {
      setError(null);
      setTxHash(null);

      if (!walletConnected) {
        setError("Connect your wallet to use Quick Burn.");
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
        const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}`, {
          headers,
        });
        if (!resp.ok) {
          throw new Error("Unable to fetch asset data from Blockfrost.");
        }
        assetData = await resp.json();
        assetCache.set(unit, assetData);
      }

      const hash = await burnMatotamNFT({
        lucid,
        asset: assetData,
        walletAddress,
        devAddress: DEV_ADDRESS,
      });

      setTxHash(hash);
      setSuccess("Message burned successfully via Quick Burn.");
    } catch (e) {
      console.error(e);
      setError("Failed to quick burn the message.");
    } finally {
      setQuickBurnLoading(false);
    }
  }

  // -------------------------------------------------------------------
  // SEND TAB (MINT MESSAGE AS NFT)
  // -------------------------------------------------------------------

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

    // Resolve recipient (ADA handle / raw address)
    const resolvedRecipient = await resolveRecipient(toAddress);

    const anyWindow = window as any;
    const lucid = anyWindow.lucid;
    if (!lucid) {
      setError("Lucid is not initialized. Try reconnecting your wallet.");
      return;
    }

    // Determine sender address
    const senderAddr = walletAddress ?? (await lucid.wallet.address());

    // ------------------------------------------------------------------
    // Build Matotam native-script minting policy (sender OR recipient OR dev)
    // ------------------------------------------------------------------
    const senderCred = lucid.utils.paymentCredentialOf(senderAddr);
    const recipientCred = lucid.utils.paymentCredentialOf(resolvedRecipient);
    const devCred = lucid.utils.paymentCredentialOf(DEV_ADDRESS);

    const policyJson = {
      type: "any",
      scripts: [
        { type: "sig", keyHash: senderCred.hash },
        { type: "sig", keyHash: recipientCred.hash },
        { type: "sig", keyHash: devCred.hash },
      ],
    };

    const policy = lucid.utils.nativeScriptFromJson(policyJson);
    const policyId = lucid.utils.mintingPolicyToId(policy);

    // ------------------------------------------------------------------
    // Optional encryption
    // ------------------------------------------------------------------
    let encryptedPayload: EncryptedPayload | undefined = undefined;
    if (sendEncrypted) {
      encryptedPayload = await encryptMessageWithPassphrase(
        message.trim(),
        passphrase.trim()
      );
    }

    // ------------------------------------------------------------------
    // Build Matotam mint data (metadata + unit)
    // ------------------------------------------------------------------
    const mintData = await buildMatotamMintData({
      senderAddr,
      recipientAddress: resolvedRecipient,
      message: message.trim(),
      policyId,
      encryptedPayload,
    });

    setLoading(true);

    // ------------------------------------------------------------------
    // Build, sign & submit transaction
    // ------------------------------------------------------------------
    const tx = await lucid
      .newTx()
      .attachMetadata(721, mintData.metadata721)
      .attachMintingPolicy(policy)
      .mintAssets(
        {
          [mintData.unit]: 1n,
        },
        undefined as any // redeemer not used for native scripts
      )
      .complete();

    const signedTx = await tx.sign().complete();
    const hash = await signedTx.submit();

    setTxHash(hash);
    setToAddress("");
    setSuccess(
      "Your message was sent successfully. You can now enter another recipient or tweak the message and send again."
    );

    // Reset encryption state
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


  // -------------------------------------------------------------------
  // REPLY HANDLER (FROM INBOX TAB)
  // -------------------------------------------------------------------

  function handleReply(replyTo: MatotamMessage) {
    setActiveTab("send");
    if (replyTo.senderAddress) {
      setToAddress(replyTo.senderAddress);
    }
    if (replyTo.plaintext) {
      setMessage(`RE: ${replyTo.plaintext.slice(0, 200)}`);
    } else {
      setMessage("");
    }
  }

  // ---------- UI ------------------------------------------------------

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center items-start px-4 pt-10 pb-16">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        {/* Logo + title + tabs */}
        <div className="flex flex-col items-center gap-3 mb-2">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <div className="h-9 px-5 rounded-full border border-sky-500/40 bg-slate-950/60 flex items-center justify-center text-[13px] tracking-[0.3em] uppercase text-sky-300/90">
              matotam
            </div>
          </div>

          {/* Tabs */}
          <div className="inline-flex rounded-full bg-slate-900/80 border border-slate-700 p-1 text-xs">
            <button
              onClick={() => setActiveTab("send")}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "send"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              Send
            </button>
            <button
              onClick={() => setActiveTab("inbox")}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "inbox"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              Inbox
            </button>
            <button
              onClick={() => setActiveTab("burn")}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "burn"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              Quick Burn
            </button>
          </div>
        </div>

        {/* Wallet controls */}
        <WalletControls
          walletConnected={walletConnected}
          showWalletPicker={showWalletPicker}
          availableWallets={availableWallets}
          onConnectClick={handleConnectClick}
          onDisconnectClick={disconnectWallet}
          onConnectSpecificWallet={connectWithWallet}
        />


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
            senderAddress={walletAddress ?? DEV_ADDRESS}
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
            onQuickBurn={handleQuickBurn}
          />
        )}

        {/* Error / success / tx hash */}
        {error && (
          <div className="text-xs text-red-400 rounded-2xl bg-red-950/40 border border-red-800 px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-emerald-300 rounded-2xl bg-emerald-950/30 border border-emerald-700 px-3 py-2">
            {success}
          </div>
        )}
        {txHash && (
          <div className="text-[11px] text-sky-300 rounded-2xl bg-slate-950/50 border border-slate-700 px-3 py-2 break-words">
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
