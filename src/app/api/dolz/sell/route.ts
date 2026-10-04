import { NextRequest, NextResponse } from "next/server";
import { buildMarketBook } from "@/app/lib/dolzMarket";
import { cancelSniperListings, getSniperInventory, listSniperCards, transferSniperCards } from "@/app/lib/dolzSniper";
import { isDolzAuthorized } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function failure(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

/** The hot wallet's cards, each with the market median for its card and tier. */
export async function GET(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const inventory = await getSniperInventory(token);
    // USDC-era sales only: DOLZ-era prices would need the price book, which the sell view does not load.
    const market = await buildMarketBook(() => null, inventory.cards.map((card) => card.token_id)).catch(() => null);
    const cards = inventory.cards.map((card) => ({ ...card, market: market?.value(card.token_id) ?? null }));
    return NextResponse.json({ ok: true, inventory: { ...inventory, cards } }, { headers });
  } catch (error) {
    return failure(error, "Načítanie kariet zlyhalo.", 502);
  }
}

/**
 * `{items: [{token_id, price_usd, days}]}` lists or reprices; `?action=cancel` with `{token_ids}` cancels;
 * `?action=transfer` with `{token_ids, to}` moves cards to an allowed wallet.
 */
export async function POST(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const body = (await request.json()) as { items?: unknown; token_ids?: unknown; to?: unknown };
    const action = request.nextUrl.searchParams.get("action");
    const results =
      action === "cancel"
        ? await cancelSniperListings(token, body.token_ids)
        : action === "transfer"
          ? await transferSniperCards(token, body.token_ids, body.to)
          : await listSniperCards(token, body.items);
    return NextResponse.json({ ok: true, results }, { headers });
  } catch (error) {
    return failure(error, "Predaj zlyhal.");
  }
}
