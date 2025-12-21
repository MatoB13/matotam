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
  if (!v.startsWith("addr") && !v.startsWith("stake") && !v.includes(" ")) {
    return true;
  }
  return false;
}

/**
 * Resolve ADA Handle to a base (payment) address.
 *
 * IMPORTANT:
 * - In the browser (client), do NOT call handle.me or Blockfrost directly (CORS / rate limits / extensions).
 *   Instead, call our server route: /api/resolve-handle
 * - On the server (route code), you can call handle.me + Blockfrost safely.
 */
export async function resolveAdaHandle(handle: string): Promise<string | null> {
  try {
    const raw = handle.trim();
    const base = raw.startsWith("$") ? raw.slice(1) : raw;
    const name = base.trim();
    if (!name) return null;

    // ----------------------------
    // CLIENT: always call our API route (avoids CORS)
    // ----------------------------
    if (typeof window !== "undefined") {
      const resp = await fetch(
        `/api/resolve-handle?handle=${encodeURIComponent(name)}`,
        { cache: "no-store" }
      );

      if (!resp.ok) return null;

      const data: any = await resp.json();
      const addr = data?.address;

      if (data?.ok === true && typeof addr === "string" && addr.startsWith("addr")) {
        return addr;
      }
      return null;
    }

    // ----------------------------
    // SERVER: best-effort direct resolution (should mainly run inside API route)
    // ----------------------------

    // 1) handle.me -> stake -> Blockfrost account addresses -> first base addr
    try {
      const apiResp = await fetch(
        `https://api.handle.me/handles/${encodeURIComponent(name)}`
      );

      if (apiResp.ok) {
        const data: any = await apiResp.json();
        const stake = data?.holder;

        if (typeof stake === "string" && stake.startsWith("stake")) {
          if (!BLOCKFROST_API || !BLOCKFROST_KEY) return null;

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

            if (baseAddr?.address) return baseAddr.address as string;
          }
        }
      }
    } catch {
      // ignore and continue to fallback
    }

    // 2) Fallback: resolve OG ADA Handle NFT by policyId + assetName variants
    if (!BLOCKFROST_API || !BLOCKFROST_KEY || !ADA_HANDLE_POLICY_ID) return null;

    const variants = Array.from(
      new Set([
        name,
        name[0]?.toUpperCase() + name.slice(1),
        name.toUpperCase(),
      ])
    ).filter(Boolean) as string[];

    for (const variant of variants) {
      const bytes = new TextEncoder().encode(variant);
      const assetNameHex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toLowerCase();

      const unit = ADA_HANDLE_POLICY_ID + assetNameHex;

      const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}/addresses`, {
        headers: { project_id: BLOCKFROST_KEY },
      });

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

/**
 * Reverse lookup: try to find an ADA Handle owned by the given address.
 * Note: This can be expensive; keep it best-effort.
 */
export async function reverseLookupAdaHandle(address: string): Promise<string | null> {
  try {
    const addr = address.trim();
    if (!addr || !addr.startsWith("addr")) return null;
    if (!BLOCKFROST_API || !BLOCKFROST_KEY || !ADA_HANDLE_POLICY_ID) return null;

    // 1) Convert base address -> stake address via Blockfrost
    const addrResp = await fetch(`${BLOCKFROST_API}/addresses/${addr}`, {
      headers: { project_id: BLOCKFROST_KEY },
    });

    if (!addrResp.ok) return null;

    const addrData: any = await addrResp.json();
    const stake = addrData?.stake_address;

    if (typeof stake !== "string" || !stake.startsWith("stake")) return null;

    // 2) List assets held by that stake account (paginated)
    let page = 1;
    const maxPages = 5;

    while (page <= maxPages) {
      const assetsResp = await fetch(
        `${BLOCKFROST_API}/accounts/${stake}/addresses/assets?page=${page}&count=100`,
        { headers: { project_id: BLOCKFROST_KEY } }
      );

      if (!assetsResp.ok) break;

      const assets: any[] = await assetsResp.json();
      if (!Array.isArray(assets) || assets.length === 0) break;

      const hit = assets.find((a) => {
        const unit = a?.unit;
        return typeof unit === "string" && unit.startsWith(ADA_HANDLE_POLICY_ID);
      });

      if (hit?.unit && typeof hit.unit === "string") {
        const assetNameHex = hit.unit.slice(ADA_HANDLE_POLICY_ID.length);

        try {
          const parts: string[] | null = assetNameHex.match(/.{1,2}/g);
          if (!parts) return null;

          const bytes = parts.map((h) => parseInt(h, 16));
          if (bytes.some((n) => Number.isNaN(n))) return null;

          const text = new TextDecoder().decode(new Uint8Array(bytes));
          const name = text?.trim();
          if (!name) return null;

          return name.startsWith("$") ? name : `$${name}`;
        } catch {
          return null;
        }
      }

      page += 1;
    }

    return null;
  } catch (err) {
    console.warn("reverseLookupAdaHandle error", err);
    return null;
  }
}
