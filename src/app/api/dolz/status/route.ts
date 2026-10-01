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
  const expectedToken = process.env.DOLZ_DASHBOARD_TOKEN || process.env.STRIKEBOT_DASHBOARD_TOKEN;
  const token = request.nextUrl.searchParams.get("token");

  if (!expectedToken || !token || token !== expectedToken) {
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
