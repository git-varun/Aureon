import { ConfigurationError, ProviderError } from "../errors";
import { getDecryptedKey } from "../settings/providers";
import type { NormalizedQuote } from "./types";

const PROVIDER_NAME = "polygon";

// DB-stored key (provider_configs.encrypted_keys, set via the Settings UI)
// takes precedence; process.env is the fallback for .env-only deploys.
// getDecryptedKey returns null when no row/key exists, composing cleanly.
async function resolvedKey(): Promise<string | undefined> {
  return (await getDecryptedKey(PROVIDER_NAME, "api_key")) ?? process.env.POLYGON_API_KEY;
}

async function requireKey(): Promise<string> {
  const key = await resolvedKey();
  if (!key || key === "your_polygon_api_key" || key.toLowerCase() === "none") {
    throw new ConfigurationError("Polygon API key is not configured");
  }
  return key;
}

/** Port of PolygonAdapter.get_quote. */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const apiKey = await requireKey();
  try {
    const url = new URL(`https://api.polygon.io/v2/last/trade/${symbol}`);
    url.searchParams.set("apiKey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { results?: { p?: number; s?: number } };
    const results = data.results;
    if (!results || results.p == null) {
      throw new ProviderError(`No price returned from Polygon for symbol ${symbol}`);
    }
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price: results.p,
      volume: results.s ?? null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Polygon get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  const apiKey = await resolvedKey();
  if (!apiKey || apiKey === "your_polygon_api_key" || apiKey.toLowerCase() === "none") return false;
  try {
    const url = new URL("https://api.polygon.io/v2/last/trade/AAPL");
    url.searchParams.set("apiKey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
