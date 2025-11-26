import {
  BLOCKFROST_API,
  BLOCKFROST_KEY,
  ADA_HANDLE_POLICY_ID,
} from "./constants";

// Basic heuristic: looks like an ADA Handle if not addr/stake and not containing spaces.
export function looksLikeAdaHandle(value: string): boolean {
  const v = value.trim();
  if (!v) return false;

  if (v.startsWith("$")) return true;
  if (
    !v.startsWith("addr") &&
    !v.startsWith("stake") &&
    !v.includes(" ")
  ) {
    return true;
  }
  return false;
}

// Resolve ADA Handle to a base (payment) address.
// 1) Try handle.me → get stake → get associated addresses
// 2) Try fallback: resolve OG Handle NFT by policyId + assetName variants
export async function resolveAdaHandle(
  handle: string
): Promise<string | null> {
  try {
    const raw = handle.trim();
    const base = raw.startsWith("$") ? raw.slice(1) : raw;
    const name = base.trim();

    if (!name) return null;

    //
    // 1) handle.me
    //
    try {
      const apiResp = await fetch(
        `https://api.handle.me/handles/${encodeURIComponent(name)}`
      );

      if (apiResp.ok) {
        const data: any = await apiResp.json();
        const stake = data?.holder; // stake address

        // Prefer resolving via stake1... → Blockfrost
        if (typeof stake === "string" && stake.startsWith("stake")) {
          const bfResp = await fetch(
            `${BLOCKFROST_API}/accounts/${stake}/addresses`,
            { headers: { project_id: BLOCKFROST_KEY } }
          );

          if (bfResp.ok) {
            const addrs: any[] = await bfResp.json();

            const baseAddr = addrs.find(
              (a) =>
                a &&
                typeof a.address === "string" &&
                a.address.startsWith("addr")
            );

            if (baseAddr?.address) {
              return baseAddr.address as string;
            }
          }
        }
      }
    } catch (err) {
      console.warn("handle.me resolve error", err);
    }

    //
    // 2) Fallback: find OG ADA Handle NFT by policyId + assetName variants
    //
    const { toHex } = await import("lucid-cardano");

    const variants = Array.from(
      new Set([
        name,
        name[0]?.toUpperCase() + name.slice(1),
        name.toUpperCase(),
      ])
    ).filter(Boolean) as string[];

    for (const variant of variants) {
      const bytes = new TextEncoder().encode(variant);
      const assetNameHex = toHex(bytes).toLowerCase();
      const unit = ADA_HANDLE_POLICY_ID + assetNameHex;

      const resp = await fetch(
        `${BLOCKFROST_API}/assets/${unit}/addresses`,
        { headers: { project_id: BLOCKFROST_KEY } }
      );

      if (!resp.ok) continue;

      const data: any = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const addr = data[0]?.address;
      if (typeof addr === "string" && addr.startsWith("addr")) {
        return addr;
      }
    }

    return null;
  } catch (err) {
    console.error("resolveAdaHandle error", err);
    return null;
  }
}
