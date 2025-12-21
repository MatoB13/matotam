// Shared burn logic for matotam NFTs
// Builds and submits a burn transaction and returns tx hash.

type BurnParams = {
  lucid: any;
  walletAddress: string;
  devAddress: string;

  // NEW (preferred): pass Blockfrost /assets/{unit} JSON
  asset?: any;

  // Backward-compatible (old API)
  unit?: string;
  fromAddrMeta?: string;
  toAddrMeta?: string;
};

function joinSegments(v: any): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.map(String).join("");
  if (typeof v === "string") return v;
  return undefined;
}

function extractFromToFromAsset(asset: any): {
  unit?: string;
  fromAddrMeta?: string;
  toAddrMeta?: string;
} {
  if (!asset) return {};

  // Blockfrost asset id (unit) is in field "asset"
  const unit = typeof asset.asset === "string" ? asset.asset : undefined;

  const meta = asset.onchain_metadata ?? asset.metadata ?? null;

  // We support multiple metadata shapes (same as inbox.ts)
  const fromAddrMeta =
    joinSegments(meta?.Sender) ??
    joinSegments(meta?.fromAddressSegments) ??
    (typeof meta?.fromAddress === "string" ? String(meta.fromAddress) : undefined);

  const toAddrMeta =
    joinSegments(meta?.Receiver) ??
    joinSegments(meta?.toAddressSegments) ??
    (typeof meta?.toAddress === "string" ? String(meta.toAddress) : undefined);

  return { unit, fromAddrMeta, toAddrMeta };
}

export async function burnMatotamNFT(params: BurnParams): Promise<string> {
  const { lucid, walletAddress, devAddress } = params;

  // Derive unit/from/to either from asset or from explicit params
  const extracted = params.asset ? extractFromToFromAsset(params.asset) : {};
  const unit = params.unit ?? extracted.unit;
  const fromAddrMeta = params.fromAddrMeta ?? extracted.fromAddrMeta;
  const toAddrMeta = params.toAddrMeta ?? extracted.toAddrMeta;

  if (!unit) {
    throw new Error("missing_unit");
  }
  if (!fromAddrMeta || !toAddrMeta) {
    // We need both addresses to build the native-script policy and authorization logic
    throw new Error("missing_from_to");
  }

  const myAddr = await lucid.wallet.address();
  const myCred = lucid.utils.paymentCredentialOf(myAddr);

  const fromCred = lucid.utils.paymentCredentialOf(fromAddrMeta);
  const toCred = lucid.utils.paymentCredentialOf(toAddrMeta);
  const matotamCred = lucid.utils.paymentCredentialOf(devAddress);

  // Only sender, receiver or matotam can burn
  if (
    myCred.hash !== fromCred.hash &&
    myCred.hash !== toCred.hash &&
    myCred.hash !== matotamCred.hash
  ) {
    throw new Error("not_authorized");
  }

  // Minting policy for burn (any of the 3 sigs)
  const policyJson = {
    type: "any",
    scripts: [
      { type: "sig", keyHash: fromCred.hash },
      { type: "sig", keyHash: toCred.hash },
      { type: "sig", keyHash: matotamCred.hash },
    ],
  };

  const policy = lucid.utils.nativeScriptFromJson(policyJson);
  const policyId = lucid.utils.mintingPolicyToId(policy);

  // Ensure NFT belongs to this policy
  if (!unit.startsWith(policyId)) {
    throw new Error("wrong_policy");
  }

  // Find UTxO holding this NFT
  const utxos = await lucid.utxosAt(walletAddress);
  const target = utxos.find((u: any) => {
    const qty = u.assets?.[unit];
    return typeof qty === "bigint" && qty > 0n;
  });

  if (!target) {
    throw new Error("no_utxo");
  }

  const tx = await lucid
    .newTx()
    .collectFrom([target])
    .mintAssets({ [unit]: -1n })
    .attachMintingPolicy(policy)
    .complete();

  const signed = await tx.sign().complete();
  const hash = await signed.submit();
  return hash;
}
