import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../dolz/auth";
import { getOverview } from "@/app/lib/walletLedger";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: HEADERS });
  }
  try {
    return NextResponse.json({ ok: true, data: await getOverview() }, { headers: HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: HEADERS });
  }
}
