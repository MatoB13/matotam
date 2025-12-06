"use client";

import { useState } from "react";

type SendTabProps = {
  message: string;
  setMessage: (v: string) => void;

  toAddress: string;
  setToAddress: (v: string) => void;

  loading: boolean;
  onSend: () => void;

  // encryption controls
  sendEncrypted: boolean;
  setSendEncrypted: (v: boolean) => void;
  passphrase: string;
  setPassphrase: (v: string) => void;

  // NEW: confirmation
  confirmPassphrase: string;
  setConfirmPassphrase: (v: string) => void;
};

export default function SendTab({
  message,
  setMessage,
  toAddress,
  setToAddress,
  loading,
  onSend,
  sendEncrypted,
  setSendEncrypted,
  passphrase,
  setPassphrase,
  confirmPassphrase,
  setConfirmPassphrase,
}: SendTabProps) {
  // Local toggle to show / hide passphrase fields
  const [showPassphrase, setShowPassphrase] = useState(false);

  return (
    <div className="rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-4 space-y-4">
      {/* Message input */}
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
          {message.length}/256{" "}
          {sendEncrypted
            ? "(stored on-chain as encrypted data)"
            : "(stored on-chain as text + SVG image)"}
        </div>
      </div>

      {/* Recipient input */}
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

      {/* Encryption toggle + passphrase */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            checked={sendEncrypted}
            onChange={(e) => setSendEncrypted(e.target.checked)}
          />
          <span>
            Encrypt this message (only readable on matotam.io with a passphrase)
          </span>
        </label>

        {sendEncrypted && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type={showPassphrase ? "text" : "password"}
                className="flex-1 rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Choose a passphrase (keep it safe, cannot be recovered)"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((v) => !v)}
                className="text-[11px] px-2 py-1 rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-300"
              >
                {showPassphrase ? "Hide" : "Show"}
              </button>
            </div>

            <input
              type={showPassphrase ? "text" : "password"}
              className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Confirm passphrase"
            />

            <p className="text-[11px] text-slate-500">
              The passphrase is <span className="font-semibold">never</span> stored
              on-chain or sent to matotam. If it is lost or mistyped, the encrypted
              message cannot be recovered by anyone.
            </p>
          </div>
        )}
      </div>

      {/* Send button */}
      <button
        onClick={onSend}
        disabled={loading}
        className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold py-2 disabled:opacity-60"
      >
        {loading ? "Sending..." : "Mint & Send (~2.5 ADA)"}
      </button>
    </div>
  );
}
