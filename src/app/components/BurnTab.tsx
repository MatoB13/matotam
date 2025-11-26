"use client";

type BurnTabProps = {
  walletConnected: boolean;

  quickBurnInput: string;
  setQuickBurnInput: (v: string) => void;

  quickBurnLoading: boolean;
  onQuickBurn: () => void;
};

export default function BurnTab({
  walletConnected,
  quickBurnInput,
  setQuickBurnInput,
  quickBurnLoading,
  onQuickBurn,
}: BurnTabProps) {
  return (
    <div className="space-y-4">
      {/* Title + short description */}
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
          onClick={onQuickBurn}
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
  );
}
