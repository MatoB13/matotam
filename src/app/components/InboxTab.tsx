"use client";

import { useState } from "react";
import { MatotamMessage } from "../lib/types";
import { shortHash } from "../lib/utils";
import { decryptMessageWithPassphrase } from "../lib/encryption";
import type { EncryptedPayload } from "../lib/encryption";

type InboxTabProps = {
  walletConnected: boolean;
  inboxLoading: boolean;
  inboxMessages: MatotamMessage[];
  burningUnit: string | null;

  loadInbox: () => void;
  loadInboxForPolicy: (policyId: string) => void;
  needsInboxPolicy: boolean;

  burnMessage: (unit: string) => void;
  onReply: (address: string) => void;
};

export default function InboxTab({
  walletConnected,
  inboxLoading,
  inboxMessages,
  burningUnit,
  loadInbox,
  loadInboxForPolicy,
  needsInboxPolicy,
  burnMessage,
  onReply,
}: InboxTabProps) {
  // Store decrypted text per-unit so we don't ask for passphrase twice.
  const [decryptedByUnit, setDecryptedByUnit] = useState<Record<string, string>>(
    {}
  );
  const [decryptErrorByUnit, setDecryptErrorByUnit] = useState<
    Record<string, string | null>
  >({});
  const [decryptingUnit, setDecryptingUnit] = useState<string | null>(null);

  const [policyInput, setPolicyInput] = useState("");

  async function handleDecrypt(
    unit: string,
    payload: EncryptedPayload,
    passphrase: string
  ) {
    try {
      setDecryptingUnit(unit);
      setDecryptErrorByUnit((prev) => ({ ...prev, [unit]: null }));

      const text = await decryptMessageWithPassphrase(
        payload,
        passphrase.trim()
      );
      setDecryptedByUnit((prev) => ({ ...prev, [unit]: text }));
    } catch (err) {
      console.error(err);
      setDecryptErrorByUnit((prev) => ({
        ...prev,
        [unit]: "Wrong passphrase or corrupted encrypted data.",
      }));
    } finally {
      setDecryptingUnit(null);
    }
  }

  return (
    <div className="space-y-3">
      {!walletConnected && (
        <p className="text-xs text-slate-400 text-center">
          Connect your wallet to see your matotam inbox.
        </p>
      )}

      {walletConnected && (
        <>
          <p className="text-[11px] text-slate-500">
            Note: The inbox scans up to{" "}
            <span className="font-semibold">100 assets</span> per wallet by
            default. For very large wallets you can load only matotam messages
            under a specific policy ID.
          </p>

          {needsInboxPolicy && (
            <div className="mt-2 rounded-2xl bg-slate-950 border border-amber-500/60 px-3 py-3 text-[11px] text-slate-200 space-y-2">
              <p>
                This wallet holds more than 100 tokens. To avoid scanning the
                entire wallet, please paste the{" "}
                <span className="font-semibold">policy ID</span> of the matotam
                messages you would like to load. You can copy it from pool.pm
                or from your wallet.
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={policyInput}
                  onChange={(e) => setPolicyInput(e.target.value)}
                  placeholder="Policy ID (56 hex characters)"
                  className="flex-1 rounded-2xl bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="button"
                  disabled={inboxLoading || !policyInput.trim()}
                  onClick={() => loadInboxForPolicy(policyInput)}
                  className="px-3 py-1 rounded-2xl border border-sky-500 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-60"
                >
                  {inboxLoading ? "Loading…" : "Load"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
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

          {!inboxLoading && inboxMessages.length === 0 && !needsInboxPolicy && (
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

                {m.isEncrypted && m.encryptedPayload ? (
                  <EncryptedMessageBlock
                    unit={m.unit}
                    decrypted={decryptedByUnit[m.unit]}
                    error={decryptErrorByUnit[m.unit] || null}
                    decrypting={decryptingUnit === m.unit}
                    onDecrypt={(passphrase) =>
                      handleDecrypt(m.unit, m.encryptedPayload!, passphrase)
                    }
                  />
                ) : (
                  <p className="text-slate-100">
                    {m.textPreview || "(no text)"}
                  </p>
                )}

                {m.createdAt && (
                  <p className="text-slate-500">Received: {m.createdAt}</p>
                )}

                {m.threadId && (
                  <p className="text-xs text-slate-500">
                    Thread: {m.threadId}
                    {m.threadIndex ? ` (#${m.threadIndex})` : ""}
                  </p>
                )}

                <p className="text-xs text-slate-500">
                  Asset: {shortHash(`${m.policyId}.${m.assetName}`, 8, 6)}
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

                  {m.fromAddress && (
                    <button
                      type="button"
                      onClick={() => onReply(m.fromAddress!)}
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
  );
}

/**
 * Renders UI for an encrypted message:
 * - if decrypted text is already available, shows it
 * - otherwise asks the user for a passphrase
 */
type EncryptedMessageBlockProps = {
  unit: string;
  decrypted?: string;
  error: string | null;
  decrypting: boolean;
  onDecrypt: (passphrase: string) => void;
};

function EncryptedMessageBlock({
  decrypted,
  error,
  decrypting,
  onDecrypt,
}: EncryptedMessageBlockProps) {
  const [passphrase, setPassphrase] = useState("");

  if (decrypted) {
    return <p className="text-slate-100">{decrypted}</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-slate-100">
        🔒 Encrypted matotam message. Enter the passphrase from the sender to
        decrypt.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="flex-1 rounded-2xl bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="Passphrase"
        />
        <button
          type="button"
          disabled={decrypting || !passphrase.trim()}
          onClick={() => onDecrypt(passphrase)}
          className="px-2 py-1 rounded-2xl border border-sky-500 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-60"
        >
          {decrypting ? "Decrypting…" : "Decrypt"}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
