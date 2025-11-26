"use client";

export default function Footer() {
  return (
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
  );
}
