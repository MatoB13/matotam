import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { isDolzAuthorized } from "../auth";
import { configuredDolzWallets, getDolzReport } from "@/app/lib/dolzPortfolio";
import { getSniperWallet } from "@/app/lib/dolzSniper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// First load walks the full Blockscout history; later loads hit the fetch cache.
export const maxDuration = 300;

const SNIPER_HOT_WALLET = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6";

const REPORT_TAG = "dolz-report";

// The report takes tens of seconds to build, so page loads share one copy. After 10 minutes the
// next load still gets the stored copy at once while a fresh one is built in the background.
const cachedReport = unstable_cache(async (wallets: string[]) => getDolzReport(wallets), ["dolz-report-v2"], {
  revalidate: 600,
  tags: [REPORT_TAG],
});

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
    // Cards the sniper buys sit on its hot wallet, so track that wallet too: the known address always,
    // plus whatever the sniper reports (in case its wallet is ever replaced).
    const sniperWallet = await getSniperWallet(request.nextUrl.searchParams.get("token") ?? "");
    const wallets = [...new Set([...configuredDolzWallets(), SNIPER_HOT_WALLET])];
    // "Obnoviť" asks for a fresh report instead of the stored one.
    if (request.nextUrl.searchParams.get("fresh") === "1") revalidateTag(REPORT_TAG, { expire: 0 });
    const data = await cachedReport(sniperWallet && !wallets.includes(sniperWallet) ? [...wallets, sniperWallet] : wallets);
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
