// Card metadata from dolz.io's own card JSON (the same file its site reads), keyed by DolzNFT token id.
// Cards never change once revealed, so responses are cached for a day.

export type DolzCardJson = {
  name: string | null;
  card: string | null;
  tier: string | null;
  season: string | null;
  rarity: string | null;
  serial: string | null;
};

type RawCardJson = { name?: string; attributes?: { trait_type?: string; value?: string | number }[] };

export async function fetchCardJson(tokenId: string): Promise<DolzCardJson | null> {
  const response = await fetch(`https://cardsdata.dolz.io/jsons/${tokenId}.json`, {
    headers: { accept: "application/json" },
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  // A card before its reveal says so in its JSON; it is fetched again (not cached) until revealed.
  const data = (await response.json()) as RawCardJson;
  const attributes = Object.fromEntries((data.attributes ?? []).map((a) => [a.trait_type ?? "", String(a.value ?? "")]));
  const serialNumber = attributes["Serial Number"] ?? "";
  const [serial, tier] = serialNumber.includes("/") ? serialNumber.split("/") : [serialNumber || null, null];
  const card = {
    name: data.name?.trim() || null,
    card: attributes["Card Number"] || null,
    tier: tier || null,
    season: attributes.Season || null,
    rarity: attributes.Rarity || null,
    serial: serial || null,
  };
  if (!/not revealed/i.test(card.rarity ?? "")) return card;
  // The JSON is not updated on a reveal; the dolz.io market's own API has the real rarity and serial.
  const market = await fetchMarketCard(tokenId).catch(() => null);
  return market?.rarity && !/not revealed/i.test(market.rarity) ? { ...card, ...market } : card;
}

type MarketInfos = { traits?: Record<string, string[]>; extendedInfos?: { nftInfos?: Record<string, string> } };

/** Rarity, serial and tier (cards of that rarity) as the dolz.io market shows them. */
async function fetchMarketCard(tokenId: string): Promise<Pick<DolzCardJson, "rarity" | "serial" | "tier"> | null> {
  const response = await fetch("https://back.dolz.io/apiMarket.php", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://dolz.io" },
    body: JSON.stringify({ command: "getNFTInfos", contractAddress: "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc", nftId: tokenId }),
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  const data = JSON.parse(text) as MarketInfos;
  const rarity = data.traits?.Rarity?.[0] ?? null;
  if (!rarity) return null;
  return {
    rarity,
    serial: data.traits?.["Serial Number"]?.[0]?.split("/")[0] || null,
    tier: data.extendedInfos?.nftInfos?.[rarity] ?? null,
  };
}
