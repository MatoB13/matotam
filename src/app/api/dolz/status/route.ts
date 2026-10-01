import { NextRequest, NextResponse } from "next/server";
import { getDolzReport } from "@/app/lib/dolzPortfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// First load walks the full Blockscout history; later loads hit the fetch cache.
export const maxDuration = 120;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function GET(request: NextRequest) {
  // Any of the owner's private dashboard tokens unlocks this page.
  const allowedTokens = [
    process.env.DOLZ_DASHBOARD_TOKEN,
    process.env.SENTIMENT_DASHBOARD_TOKEN,
    process.env.STRIKEBOT_DASHBOARD_TOKEN,
  ].filter((value): value is string => !!value);
  const token = request.nextUrl.searchParams.get("token");

  if (!token || !allowedTokens.includes(token)) {
    return unauthorized();
  }

  try {
    const data = await getDolzReport();
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }
}
