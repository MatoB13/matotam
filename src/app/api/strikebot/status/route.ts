import { NextRequest, NextResponse } from "next/server";
import { getStrikebotStatus } from "@/app/lib/strikebot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    {
      status: 401,
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

function normalizeAsset(value: string | null): string {
  const normalized = String(value || "ADA").trim().toUpperCase();
  return ["ADA", "BTC", "ZEC"].includes(normalized) ? normalized : "ADA";
}

function normalizeBotMode(value: string | null): string {
  return String(value || "live").trim().toLowerCase() === "hft" ? "hft" : "live";
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.STRIKEBOT_DASHBOARD_TOKEN;
  const token = request.nextUrl.searchParams.get("token");
  const asset = normalizeAsset(request.nextUrl.searchParams.get("asset"));
  const bot = normalizeBotMode(request.nextUrl.searchParams.get("bot"));

  if (!expectedToken || !token || token !== expectedToken) {
    return unauthorized();
  }

  try {
    const data = await getStrikebotStatus(asset, bot);

    return NextResponse.json(
      { ok: true, data },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
}
