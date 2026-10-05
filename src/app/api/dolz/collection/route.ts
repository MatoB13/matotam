import { NextRequest, NextResponse } from "next/server";
import { getSniperCollection, requestCollectionRefresh } from "@/app/lib/dolzSniper";
import { isDolzAuthorized } from "../auth";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** Owned card numbers and market floors, computed by the sniper. */
export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await getSniperCollection(request.nextUrl.searchParams.get("token") ?? "");
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sniper neodpovedá." }, { status: 502, headers });
  }
}

/** Ask the sniper to recompute now (takes a minute or two). */
export async function POST(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  try {
    await requestCollectionRefresh(request.nextUrl.searchParams.get("token") ?? "");
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sniper neodpovedá." }, { status: 502, headers });
  }
}
