import { BLOCKFROST_API, BLOCKFROST_KEY, CARDANO_NETWORK } from "./constants";

// Detect wallets and show picker or auto-connect when only one wallet exists.
export async function handleConnectClick(
  setError: (v: string | null) => void,
  setTxHash: (v: string | null) => void,
  setAvailableWallets: (v: string[]) => void,
  setShowWalletPicker: (v: boolean) => void,
  connectWithWallet: (id: string) => Promise<void>
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
      await connectWithWallet(ids[0]);
    } else {
      setAvailableWallets(ids);
      setShowWalletPicker(true);
    }
  } catch (e) {
    console.error(e);
    setError("Failed to detect wallets.");
  }
}

// Enable chosen wallet, initialize Lucid and store base & stake addresses
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

    const addr = await lucid.wallet.address();
    const stake = await lucid.wallet.rewardAddress();

    setWalletAddress(addr);
    setStakeAddress(stake ?? null);
    setWalletConnected(true);
    setShowWalletPicker(false);
  } catch (e) {
    console.error(e);
    setError((e as any)?.message ?? "Failed to connect wallet.");
  }
}

// Disconnect wallet: remove lucid, clear state
export function disconnectWallet(
  setWalletConnected: (v: boolean) => void,
  setWalletAddress: (v: string | null) => void,
  setStakeAddress: (v: string | null) => void,
  setTxHash: (v: string | null) => void,
  setError: (v: string | null) => void,
  setSuccess: (v: string | null) => void,
  setShowWalletPicker: (v: boolean) => void,
  setInboxMessages: (v: any[]) => void
) {
  const anyWindow = window as any;
  if (anyWindow.lucid) delete anyWindow.lucid;

  setWalletConnected(false);
  setWalletAddress(null);
  setStakeAddress(null);
  setTxHash(null);
  setError(null);
  setSuccess(null);
  setShowWalletPicker(false);
  setInboxMessages([]);
}
