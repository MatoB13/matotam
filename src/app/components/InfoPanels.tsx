"use client";

export default function InfoPanels() {
  return (
    <div className="mt-4 border-t border-slate-800 pt-4 text-[11px] text-slate-400 space-y-2">
      <details className="rounded-2xl bg-slate-950/60 border border-slate-800 px-3 py-2">
        <summary className="cursor-pointer font-semibold text-slate-200 list-none">
          How it works
        </summary>
        <div className="mt-2 space-y-1 text-[11px] text-slate-400">
          <p>① You write a short message (up to 256 characters).</p>
          <p>
            ② Your wallet signs a transaction that mints a tiny NFT containing
            your message as text plus a small on-chain SVG bubble image.
          </p>
          <p>
            ③ The NFT is sent to the recipient’s Cardano address (or ADA
            Handle) and appears in their wallet or on pool.pm.
          </p>
          <p>
            ④ This message NFT can later be burned by the original sender, the
            original recipient, or the matotam service address to reclaim most
            of the ADA locked inside.
          </p>
        </div>
      </details>

      <details className="rounded-2xl bg-slate-950/60 border border-slate-800 px-3 py-2">
        <summary className="cursor-pointer font-semibold text-slate-200 list-none">
          Disclaimer
        </summary>
        <div className="mt-2 space-y-1">
          <p>
            Total cost of ~2.5 ADA includes dev, network & minting fees.
          </p>

          <p>
            Around 1.5 ADA is bound to the minting UTXO — it can be reclaimed by burning the NFT.
          </p>

          <p>Messages are stored permanently on-chain.</p>
        </div>
      </details>
    </div>
  );
}
