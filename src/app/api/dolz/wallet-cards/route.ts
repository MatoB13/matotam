import { NextRequest, NextResponse } from "next/server";
import { isDolzAuthorized } from "../auth";
import { getSniperCards, getSniperWallet } from "@/app/lib/dolzSniper";
import { portfolioWallets, SNIPER_HOT_WALLET, sortCards, walletCards } from "@/app/lib/dolzWalletCards";

const MAIN_WALLET = "0xa4cd3de07dafa3f700c908043118b39547190143";
const DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc";

export const runtime = "nodejs";
// No "force-dynamic": it would turn off the data cache this route relies on.
export const maxDuration = 60;

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
    const { cards: listed, source } = await walletCards(address);
    // Cards Blockscout has no metadata for (new ones, e.g. auction prizes) get their names from the sniper's card cache.
    const unnamed = listed.filter((card) => !card.name && card.contract === DOLZ_NFT).map((card) => card.id);
    const meta = await getSniperCards(request.nextUrl.searchParams.get("token") ?? "", unnamed).catch(() => ({}) as Awaited<ReturnType<typeof getSniperCards>>);
    const cards = unnamed.length
      ? sortCards(
          listed.map((card) => {
            const known = card.contract === DOLZ_NFT && !card.name ? meta[card.id] : undefined;
            if (!known?.name) return card;
            return {
              ...card,
              name: known.name,
              card: card.card ?? known.card,
              tier: card.tier ?? known.tier,
              rarity: card.rarity ?? known.rarity,
              serial: card.serial ?? (known.serial != null ? String(known.serial) : null),
            };
          }),
        )
      : listed;
    return NextResponse.json({ ok: true, address, target: SNIPER_HOT_WALLET, cards, source }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Načítanie kariet zlyhalo.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers });
  }
}
