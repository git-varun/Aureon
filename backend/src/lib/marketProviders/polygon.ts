import { ConfigurationError, ProviderError } from "../errors";
import type { NormalizedQuote } from "./types";

const PROVIDER_NAME = "polygon";

// Same env-var-only key convention as finnhub.ts/twelvedata.ts/alphavantage.ts
// — Python's PolygonAdapter resolves its key from ProviderFactory (which
// decrypts config.provider_configs.encrypted_keys DB-side); this port instead
// reads process.env.POLYGON_API_KEY, matching every other keyed adapter
// already ported in this backend. Known divergence, not fixed here.
function resolvedKey(): string | undefined {
  return process.env.POLYGON_API_KEY;
}

function requireKey(): string {
  const key = resolvedKey();
  if (!key || key === "your_polygon_api_key" || key.toLowerCase() === "none") {
    throw new ConfigurationError("Polygon API key is not configured");
  }
  return key;
}

/** Port of PolygonAdapter.get_quote. */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const apiKey = requireKey();
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
  const apiKey = resolvedKey();
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
