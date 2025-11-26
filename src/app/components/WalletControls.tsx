"use client";

import { WALLET_LABELS } from "../lib/constants";

type WalletControlsProps = {
  walletConnected: boolean;
  showWalletPicker: boolean;
  availableWallets: string[];

  onConnectClick: () => void;
  onDisconnectClick: () => void;
  onConnectSpecificWallet: (id: string) => void;
};

export default function WalletControls({
  walletConnected,
  showWalletPicker,
  availableWallets,
  onConnectClick,
  onDisconnectClick,
  onConnectSpecificWallet,
}: WalletControlsProps) {
  if (walletConnected) {
    return (
      <button
        onClick={onDisconnectClick}
        className="w-full rounded-2xl border border-red-400 text-red-300 hover:border-red-500 px-3 py-2 text-sm font-medium"
      >
        Disconnect wallet
      </button>
    );
  }

  if (showWalletPicker && availableWallets.length > 1) {
    return (
      <div className="w-full rounded-2xl bg-slate-950 border border-slate-700 px-3 py-3 text-xs space-y-2">
        <p className="text-[11px] text-slate-400">Choose a wallet to connect:</p>
        <div className="flex flex-wrap gap-2">
          {availableWallets.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onConnectSpecificWallet(id)}
              className="px-3 py-1 rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-400"
            >
              {WALLET_LABELS[id] ?? id}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onConnectClick}
      className="w-full rounded-2xl border border-slate-600 hover:border-sky-500 hover:text-sky-400 px-3 py-2 text-sm font-medium"
    >
      Connect wallet
    </button>
  );
}
