import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.STRIKEBOT_DASHBOARD_TOKEN;
  const token = request.nextUrl.searchParams.get("token");

  if (!expectedToken || !token || token !== expectedToken) {
    return unauthorized();
  }

  const publicKey = process.env.STRIKEBOT_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIKEBOT_VAPID_PUBLIC_KEY" },
      { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }

  return NextResponse.json(
    { ok: true, publicKey },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
