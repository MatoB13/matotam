// Minimal Blockscout v2 client for Polygon with retry on rate limits.

const BLOCKSCOUT = "https://polygon.blockscout.com/api/v2";

const apiKey = process.env.BLOCKSCOUT_API_KEY;

class BlockscoutFatal extends Error {}

export async function blockscout<T>(path: string, revalidate: number | false): Promise<T> {
  const url = `${BLOCKSCOUT}${path}${apiKey ? `${path.includes("?") ? "&" : "?"}apikey=${apiKey}` : ""}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        ...(revalidate === false ? { cache: "force-cache" as const } : { next: { revalidate } }),
      });
      // Blocked (403) or unknown (404) will not change on a retry: fail at once.
      if (response.status === 403 || response.status === 404) throw new BlockscoutFatal(`Blockscout ${response.status} for ${path}`);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Blockscout ${response.status} for ${path}`);
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`Blockscout ${response.status} for ${path}`);
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BlockscoutFatal) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Blockscout request failed: ${path}`);
}
