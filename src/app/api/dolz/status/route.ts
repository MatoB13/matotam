import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../auth";
import { cachedDolzReport, portfolioWallets } from "@/app/lib/dolzWalletCards";
import { getSniperWallet } from "@/app/lib/dolzSniper";

export const runtime = "nodejs";
// No "force-dynamic": it turns off the data cache (unstable_cache and cached fetches) for the whole
// route. The handler reads the request, so it is rendered per request anyway.
// First load walks the full Blockscout history; later loads hit the fetch cache.
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) {
    return unauthorized();
  }

  try {
    // Cards the sniper buys sit on its hot wallet, so the portfolio covers that wallet too.
    const sniperWallet = await getSniperWallet(request.nextUrl.searchParams.get("token") ?? "");
    const data = await cachedDolzReport(portfolioWallets(sniperWallet));
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
