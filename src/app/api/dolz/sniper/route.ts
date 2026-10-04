import { NextRequest, NextResponse } from "next/server";
import { getSniperStatus, isSniperConfigured, saveSniperConfig } from "@/app/lib/dolzSniper";
import { isDolzAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const sniper = await getSniperStatus(token);
  return NextResponse.json({ ok: true, deployed: isSniperConfigured(), reachable: !!sniper, sniper }, { headers });
}

/** Forward settings to the sniper, which validates and stores them. */
export async function POST(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const saved = await saveSniperConfig(token, await request.json());
    return NextResponse.json({ ok: true, ...saved }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Uloženie zlyhalo.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers });
  }
}
