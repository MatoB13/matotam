import { NextRequest, NextResponse } from "next/server";
import { getSentimentStatus } from "@/app/lib/sentiment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.SENTIMENT_DASHBOARD_TOKEN || process.env.STRIKEBOT_DASHBOARD_TOKEN;
  const token = request.nextUrl.searchParams.get("token");

  if (!expectedToken || !token || token !== expectedToken) {
    return unauthorized();
  }

  try {
    const data = await getSentimentStatus();
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
