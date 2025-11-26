// Shared burn logic for matotam NFTs
// Builds and submits a burn transaction and returns tx hash.

export async function burnMatotamNFT(params: {
  lucid: any;
  walletAddress: string;
  unit: string;
  fromAddrMeta: string;
  toAddrMeta: string;
  devAddress: string;
}): Promise<string> {
  const { lucid, walletAddress, unit, fromAddrMeta, toAddrMeta, devAddress } =
    params;

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
