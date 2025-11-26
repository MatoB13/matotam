"use client";

type SendTabProps = {
  message: string;
  setMessage: (v: string) => void;

  toAddress: string;
  setToAddress: (v: string) => void;

  loading: boolean;
  onSend: () => void;
};

export default function SendTab({
  message,
  setMessage,
  toAddress,
  setToAddress,
  loading,
  onSend,
}: SendTabProps) {
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
          {message.length}/256 (stored on-chain as text + SVG image)
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
