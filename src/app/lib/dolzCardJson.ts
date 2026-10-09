// Card metadata from dolz.io's own card JSON (the same file its site reads), keyed by DolzNFT token id.
// Cards never change, so responses are cached for good.

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
    cache: "force-cache",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as RawCardJson;
  const attributes = Object.fromEntries((data.attributes ?? []).map((a) => [a.trait_type ?? "", String(a.value ?? "")]));
  const serialNumber = attributes["Serial Number"] ?? "";
  const [serial, tier] = serialNumber.includes("/") ? serialNumber.split("/") : [serialNumber || null, null];
  return {
    name: data.name?.trim() || null,
    card: attributes["Card Number"] || null,
    tier: tier || null,
    season: attributes.Season || null,
    rarity: attributes.Rarity || null,
    serial: serial || null,
  };
}
