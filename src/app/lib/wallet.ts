import { BLOCKFROST_API, BLOCKFROST_KEY, CARDANO_NETWORK } from "./constants";

/**
 * Detect wallets and show picker or auto-connect when only one wallet exists.
 */
export async function handleConnectClick(
  setError: (v: string | null) => void,
  setTxHash: (v: string | null) => void,
  setAvailableWallets: (v: string[]) => void,
  setShowWalletPicker: (v: boolean) => void,
  connectWithWalletFn: (id: string) => Promise<void>
) {
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
      await connectWithWalletFn(ids[0]);
    } else {
      setAvailableWallets(ids);
      setShowWalletPicker(true);
    }
  } catch (e: any) {
    console.error(e);
    setError(e?.message ?? "Failed to detect wallets.");
  }
}

/**
 * Enable chosen wallet, initialize Lucid and store base & stake addresses.
 */
export async function connectWithWallet(
  id: string,
  setError: (v: string | null) => void,
  setWalletConnected: (v: boolean) => void,
  setWalletAddress: (v: string | null) => void,
  setStakeAddress: (v: string | null) => void,
  setShowWalletPicker: (v: boolean) => void
) {
  try {
    setError(null);

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
      CARDANO_NETWORK
    );

    lucid.selectWallet(api);
    (window as any).lucid = lucid;

    const addr: string = await lucid.wallet.address();
    const stake: string | null = (await lucid.wallet.rewardAddress()) ?? null;

    setWalletAddress(addr);
    setStakeAddress(stake);
    setWalletConnected(true);
    setShowWalletPicker(false);
  } catch (e: any) {
    console.error(e);
    setError(e?.message ?? "Failed to connect wallet.");
  }
}

export type DisconnectWalletArgs = {
  setError: (v: string | null) => void;
  setWalletConnected: (v: boolean) => void;
  setWalletAddress: (v: string | null) => void;
  setStakeAddress?: (v: string | null) => void;
  setTxHash?: (v: string | null) => void;
  setSuccess?: (v: string | null) => void;
  setShowWalletPicker?: (v: boolean) => void;
  setInboxMessages?: (v: any[]) => void;
};

/**
 * Disconnect wallet and reset UI state.
 *
 * Supports BOTH call styles:
 *   1) positional args (used by src/app/page.tsx)
 *   2) single object with named setters
 */
export function disconnectWallet(
  setError: (v: string | null) => void,
  setWalletConnected: (v: boolean) => void,
  setWalletAddress: (v: string | null) => void,
  setStakeAddress?: (v: string | null) => void,
  setTxHash?: (v: string | null) => void,
  setSuccess?: (v: string | null) => void,
  setShowWalletPicker?: (v: boolean) => void,
  setInboxMessages?: (v: any[]) => void
): void;
export function disconnectWallet(args: DisconnectWalletArgs): void;
export function disconnectWallet(
  a: DisconnectWalletArgs | ((v: string | null) => void),
  b?: (v: boolean) => void,
  c?: (v: string | null) => void,
  d?: (v: string | null) => void,
  e?: (v: string | null) => void,
  f?: (v: string | null) => void,
  g?: (v: boolean) => void,
  h?: (v: any[]) => void
) {
  const args: DisconnectWalletArgs =
    typeof a === "function"
      ? {
          setError: a,
          setWalletConnected: b!,
          setWalletAddress: c!,
          setStakeAddress: d,
          setTxHash: e,
          setSuccess: f,
          setShowWalletPicker: g,
          setInboxMessages: h,
        }
      : a;

  // safe for SSR (window may not exist)
  const anyWindow = typeof window !== "undefined" ? (window as any) : null;
  if (anyWindow?.lucid) delete anyWindow.lucid;

  // minimum reset
  args.setWalletConnected(false);
  args.setWalletAddress(null);
  args.setError(null);

  // optional resets
  args.setStakeAddress?.(null);
  args.setTxHash?.(null);
  args.setSuccess?.(null);
  args.setShowWalletPicker?.(false);
  args.setInboxMessages?.([]);
}

// Backward-compat alias (if niekde používaš starý názov)
export const coreDisconnectWallet = disconnectWallet;
