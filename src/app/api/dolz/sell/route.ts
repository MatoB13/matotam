import { NextRequest, NextResponse } from "next/server";
import { buildMarketBook, DOLZ_NFT } from "@/app/lib/dolzMarket";
import { answerSniperOffer, cancelSniperListings, getSniperInventory, listSniperCards, transferSniperCards } from "@/app/lib/dolzSniper";
import { cachedDolzReport, portfolioWallets } from "@/app/lib/dolzWalletCards";
import { isDolzAuthorized } from "../auth";

export const runtime = "nodejs";
// No "force-dynamic": it turns off the data cache (unstable_cache and cached fetches) for the whole
// route. The handler reads the request, so it is rendered per request anyway.
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
    // Card and tier come from the sniper, so only sales of other cards may need a (slow) metadata lookup.
    const known = Object.fromEntries(
      inventory.cards.map((card) => [
        card.token_id,
        {
          card: card.card ?? null,
          tier: card.tier != null ? String(card.tier) : null,
          season: card.season != null ? String(card.season) : null,
          rarity: card.rarity ?? null,
          serial: card.serial != null ? String(card.serial) : null,
        },
      ]),
    );
    const market = await Promise.race([
      buildMarketBook(() => null, [], known).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]);
    // Cards the sniper did not buy (moved in from MetaMask, ...): their cost from the cached portfolio report.
    const needCost = inventory.cards.some((card) => card.bought_usd == null);
    const report = needCost
      ? await Promise.race([
          cachedDolzReport(portfolioWallets(inventory.wallet?.toLowerCase() ?? null)).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
        ])
      : null;
    const costs = new Map(
      (report?.holdings ?? []).filter((holding) => holding.token === DOLZ_NFT && holding.costUsd > 0).map((holding) => [holding.id, holding.costUsd]),
    );
    const cards = inventory.cards.map((card) => {
      const cost = card.bought_usd == null ? costs.get(card.token_id) : undefined;
      return {
        ...card,
        ...(cost != null ? { bought_usd: cost, bought_via: "portfólio" as const } : {}),
        market: market?.value(card.token_id) ?? null,
      };
    });
    return NextResponse.json({ ok: true, inventory: { ...inventory, cards } }, { headers });
  } catch (error) {
    return failure(error, "Načítanie kariet zlyhalo.", 502);
  }
}

/**
 * `{items: [{token_id, price_usd, days}]}` lists or reprices; `?action=cancel` with `{token_ids}` cancels;
 * `?action=transfer` with `{token_ids, to}` moves cards to an allowed wallet;
 * `?action=accept_offer` / `reject_offer` with `{token_id, offerer, price_raw}` answers an offer.
 */
export async function POST(request: NextRequest) {
  if (!isDolzAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  // Actions that move USDC or cards also carry the action password typed on the page.
  const token = { token: request.nextUrl.searchParams.get("token") ?? "", password: request.headers.get("x-dolz-password") };
  try {
    const body = (await request.json()) as { items?: unknown; token_ids?: unknown; to?: unknown };
    const action = request.nextUrl.searchParams.get("action");
    const results =
      action === "accept_offer" || action === "reject_offer"
        ? await answerSniperOffer(token, action === "accept_offer" ? "accept" : "reject", body)
        : action === "cancel"
        ? await cancelSniperListings(token, body.token_ids)
        : action === "transfer"
          ? await transferSniperCards(token, body.token_ids, body.to)
          : await listSniperCards(token, body.items);
    return NextResponse.json({ ok: true, results }, { headers });
  } catch (error) {
    return failure(error, "Predaj zlyhal.");
  }
}
