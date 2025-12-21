// src/app/api/resolve-handle/route.ts
import { NextRequest, NextResponse } from "next/server";

import { ADA_HANDLE_POLICY_ID, BLOCKFROST_API, BLOCKFROST_KEY } from "@/app/lib/constants";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toLowerCase();
}

/**
 * Resolve an ADA Handle to a base (payment) address.
 * Strategy:
 *  1) handle.me -> stake -> Blockfrost accounts/{stake}/addresses
 *  2) Fallback: OG handle NFT lookup via Blockfrost assets/{unit}/addresses
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const handleRaw = (searchParams.get("handle") ?? "").trim();

  if (!handleRaw) return jsonError("Missing handle");

  const name = handleRaw.startsWith("$")
    ? handleRaw.slice(1).trim()
    : handleRaw.trim();

  if (!name) return jsonError("Invalid handle");


  if (!BLOCKFROST_API || !BLOCKFROST_KEY) {
    return jsonError("Blockfrost is not configured on server", 500);
  }
  if (!ADA_HANDLE_POLICY_ID) {
    return jsonError("ADA_HANDLE_POLICY_ID is not configured on server", 500);
  }

  const headers = { project_id: BLOCKFROST_KEY };

  // 1) handle.me -> stake -> Blockfrost
  try {
    const apiResp = await fetch(
      `https://api.handle.me/handles/${encodeURIComponent(name)}`,
      { cache: "no-store" }
    );

    if (apiResp.ok) {
      const data: any = await apiResp.json();
      const stake = data?.holder;

      if (typeof stake === "string" && stake.startsWith("stake")) {
        const bfResp = await fetch(
          `${BLOCKFROST_API}/accounts/${stake}/addresses`,
          { headers, cache: "no-store" }
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
            return NextResponse.json({
              ok: true,
              address: baseAddr.address,
              source: "handle.me+stake",
            });
          }
        }
      }
    }
  } catch (e: any) {
    // Continue to fallback
    console.warn("resolve-handle: handle.me path failed", e?.message ?? e);
  }

  // 2) Fallback: OG handle asset lookup via policyId + assetName hex
  const variants = Array.from(
    new Set([name, name[0]?.toUpperCase() + name.slice(1), name.toUpperCase()])
  ).filter(Boolean) as string[];

  for (const variant of variants) {
    try {
      const assetNameHex = bytesToHex(new TextEncoder().encode(variant));
      const unit = ADA_HANDLE_POLICY_ID + assetNameHex;

      const resp = await fetch(`${BLOCKFROST_API}/assets/${unit}/addresses`, {
        headers,
        cache: "no-store",
      });

      if (!resp.ok) continue;

      const data: any = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const addr = data[0]?.address;
      if (typeof addr === "string" && addr.startsWith("addr")) {
        return NextResponse.json({
          ok: true,
          address: addr,
          source: "og-asset",
        });
      }
    } catch (e: any) {
      console.warn("resolve-handle: OG lookup failed", e?.message ?? e);
    }
  }

  return NextResponse.json({ ok: false, address: null, error: "not_found" });
}
