import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../auth";
import { getSniperWallet } from "@/app/lib/dolzSniper";
import { cachedDolzReport, portfolioWallets, SNIPER_HOT_WALLET, walletCards } from "@/app/lib/dolzWalletCards";

const MAIN_WALLET = "0xa4cd3de07dafa3f700c908043118b39547190143";

export const runtime = "nodejs";
// No "force-dynamic": it would turn off the data cache this route relies on.
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** Cards held by one of the portfolio's wallets (default: the main MetaMask wallet), sorted by name. */
export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  try {
    const wallets = portfolioWallets(await getSniperWallet(request.nextUrl.searchParams.get("token") ?? ""));
    const address = (request.nextUrl.searchParams.get("address") ?? (wallets.includes(MAIN_WALLET) ? MAIN_WALLET : wallets[0])).toLowerCase();
    if (!wallets.includes(address)) {
      return NextResponse.json({ ok: false, error: "Tento wallet nie je v portfóliu." }, { status: 400, headers });
    }
    const report = await cachedDolzReport(wallets);
    const cards = await walletCards(address, report);
    return NextResponse.json({ ok: true, address, target: SNIPER_HOT_WALLET, cards }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Načítanie kariet zlyhalo.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers });
  }
}
