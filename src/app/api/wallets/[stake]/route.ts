import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../../dolz/auth";
import { getWalletDetail } from "@/app/lib/walletLedger";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest, context: { params: Promise<{ stake: string }> }) {
  if (!isDolzAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: HEADERS });
  }
  const { stake } = await context.params;
  if (!/^stake1[a-z0-9]{50,60}$/.test(stake)) {
    return NextResponse.json({ ok: false, error: "Bad stake address" }, { status: 400, headers: HEADERS });
  }
  const params = request.nextUrl.searchParams;
  try {
    const data = await getWalletDetail(stake, {
      kind: params.get("kind"),
      limit: Number(params.get("limit") ?? 100),
      offset: Number(params.get("offset") ?? 0),
    });
    if (!data) return NextResponse.json({ ok: false, error: "Unknown wallet" }, { status: 404, headers: HEADERS });
    return NextResponse.json({ ok: true, data }, { headers: HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: HEADERS });
  }
}
