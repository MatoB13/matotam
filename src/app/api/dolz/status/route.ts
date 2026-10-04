import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../auth";
import { configuredDolzWallets, getDolzReport } from "@/app/lib/dolzPortfolio";
import { getSniperWallet } from "@/app/lib/dolzSniper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
    // Cards the sniper buys sit on its hot wallet, so track that wallet too.
    const sniperWallet = await getSniperWallet(request.nextUrl.searchParams.get("token") ?? "");
    const wallets = configuredDolzWallets();
    const data = await getDolzReport(sniperWallet && !wallets.includes(sniperWallet) ? [...wallets, sniperWallet] : wallets);
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
