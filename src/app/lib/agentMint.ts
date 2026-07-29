// src/app/lib/agentMint.ts
//
// Headless wallet-to-wallet send: no browser, no CIP-30 extension, no human
// clicking "sign". This is what src/app/page.tsx does when a human mints a
// message through the UI (build the native-script policy, attach metadata,
// mint, sign, submit), factored out so an AI agent or bot can call it
// directly from a Node process. The caller supplies its own private key and
// its own Blockfrost project — matotam's server never sees either.
import { buildMatotamMintData } from "./mint";
import { resolveAdaHandle } from "./adaHandle";
import { encryptMessageWithPassphrase, type EncryptedPayload } from "./encryption";
import { DEV_ADDRESS } from "./constants";

export type SendMatotamMessageParams = {
  /** Bech32 ed25519 private key (e.g. "ed25519_sk1...") of the sending wallet. */
  senderPrivateKey: string;
  /** Recipient Cardano address (addr1...) or ADA Handle ($name). */
  recipientAddress: string;
  message: string;
  /** If set, the message is AES-GCM encrypted on-chain with this passphrase. */
  passphrase?: string;
  /** Caller's own Blockfrost project, e.g. "https://cardano-mainnet.blockfrost.io/api/v0". */
  blockfrostApi: string;
  /** Caller's own Blockfrost project id. */
  blockfrostKey: string;
  network?: "Mainnet" | "Preprod" | "Preview";
};

export type SendMatotamMessageResult = {
  txHash: string;
  unit: string;
  assetNameBase: string;
  senderAddress: string;
  recipientAddress: string;
};

const DEV_FEE_LOVELACE = 1_000_000n; // 1 ADA, same fee the web UI charges

/**
 * Build, sign, and submit a Matotam message NFT end-to-end using a raw
 * private key instead of a CIP-30 wallet extension. This performs a real
 * on-chain transaction that spends ADA from the sender's wallet — callers
 * are responsible for authorizing that spend themselves.
 */
export async function sendMatotamMessageOnChain(
  params: SendMatotamMessageParams
): Promise<SendMatotamMessageResult> {
  const {
    senderPrivateKey,
    recipientAddress: recipientInput,
    message,
    passphrase,
    blockfrostApi,
    blockfrostKey,
    network = "Mainnet",
  } = params;

  if (!blockfrostApi || !blockfrostKey) {
    throw new Error("blockfrostApi and blockfrostKey are required.");
  }
  if (!message.trim()) {
    throw new Error("message must not be empty.");
  }

  const { Lucid, Blockfrost } = await import("lucid-cardano");
  const lucid = await Lucid.new(new Blockfrost(blockfrostApi, blockfrostKey), network);
  lucid.selectWalletFromPrivateKey(senderPrivateKey);

  const senderAddr = await lucid.wallet.address();

  const trimmedRecipient = recipientInput.trim();
  const recipientAddress = trimmedRecipient.startsWith("$")
    ? await resolveAdaHandle(trimmedRecipient, { blockfrostApi, blockfrostKey })
    : trimmedRecipient;

  if (!recipientAddress || !recipientAddress.startsWith("addr")) {
    throw new Error(`Could not resolve recipient address: ${recipientInput}`);
  }

  // Mint policy: any of sender, recipient, or matotam dev key may later burn it.
  const senderCred = lucid.utils.paymentCredentialOf(senderAddr);
  const recipientCred = lucid.utils.paymentCredentialOf(recipientAddress);
  const devCred = lucid.utils.paymentCredentialOf(DEV_ADDRESS);

  const policy = lucid.utils.nativeScriptFromJson({
    type: "any",
    scripts: [
      { type: "sig", keyHash: senderCred.hash },
      { type: "sig", keyHash: recipientCred.hash },
      { type: "sig", keyHash: devCred.hash },
    ],
  });
  const policyId = lucid.utils.mintingPolicyToId(policy);

  const encryptedPayload: EncryptedPayload | undefined = passphrase
    ? await encryptMessageWithPassphrase(message.trim(), passphrase)
    : undefined;

  const mintData = await buildMatotamMintData({
    senderAddr,
    recipientAddress,
    message: message.trim(),
    policyId,
    encryptedPayload,
    blockfrostApi,
    blockfrostKey,
  });

  const tx = await lucid
    .newTx()
    .attachMetadata(721, mintData.metadata721)
    .attachMintingPolicy(policy)
    .mintAssets({ [mintData.unit]: 1n }, undefined as any)
    .payToAddress(recipientAddress, { [mintData.unit]: 1n })
    .payToAddress(DEV_ADDRESS, { lovelace: DEV_FEE_LOVELACE })
    .complete();

  const signedTx = await tx.sign().complete();
  const txHash = await signedTx.submit();

  return {
    txHash,
    unit: mintData.unit,
    assetNameBase: mintData.assetNameBase,
    senderAddress: senderAddr,
    recipientAddress,
  };
}
