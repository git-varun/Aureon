import { ConfigurationError, ProviderError } from "../errors";
import type { NormalizedQuote, NormalizedNews } from "./types";

const PROVIDER_NAME = "finnhub";

function resolvedKey(): string | undefined {
  return process.env.FINNHUB_API_KEY;
}

function requireKey(): string {
  const key = resolvedKey();
  if (!key || key === "your_finnhub_api_key" || key.toLowerCase() === "none") {
    throw new ConfigurationError("Finnhub API key is not configured");
  }
  return key;
}

/** Port of FinnhubAdapter.get_quote. No local budget guard, matching Python
 * (relies on the fallback-chain's non-US-exchange exclusion instead of a
 * Redis counter here). */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const apiKey = requireKey();
  try {
    const url = new URL("https://finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { c?: number; v?: number };
    if (!data.c) throw new ProviderError(`No price returned from Finnhub for symbol ${symbol}`);
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price: data.c,
      volume: data.v ?? null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Finnhub get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

/** Port of FinnhubAdapter.get_fundamentals — stock/profile2, company-profile
 * fields only, no valuation ratios. finnhubIndustry is the closest thing to
 * a sector field this endpoint offers. */
export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  const apiKey = requireKey();
  try {
    const url = new URL("https://finnhub.io/api/v1/stock/profile2");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { marketCapitalization?: number; finnhubIndustry?: string };
    if (!data || Object.keys(data).length === 0) {
      throw new ProviderError(`No fundamentals returned from Finnhub for symbol ${symbol}`);
    }
    return {
      market_cap: data.marketCapitalization ?? null,
      sector: data.finnhubIndustry ?? null,
      industry: data.finnhubIndustry ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Finnhub get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

/** Port of FinnhubAdapter.get_news — company-news, last 30 days, capped at
 * 20 items (matching Python's data[:20] slice). Returns [] rather than
 * throwing when unconfigured (unlike getQuote/getFundamentals's requireKey),
 * matching Python's own get_news early-return. */
export async function getNews(symbol: string): Promise<NormalizedNews[]> {
  const apiKey = resolvedKey();
  if (!apiKey || apiKey === "your_finnhub_api_key" || apiKey.toLowerCase() === "none") return [];

  try {
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = new URL("https://finnhub.io/api/v1/company-news");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", fromDate);
    url.searchParams.set("to", toDate);
    url.searchParams.set("token", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ headline?: string; url?: string; datetime?: number }>;
    const results: NormalizedNews[] = [];
    for (const item of data.slice(0, 20)) {
      if (item.headline && item.url) {
        results.push({
          provider: PROVIDER_NAME,
          title: item.headline,
          url: item.url,
          publishedAt: item.datetime ? new Date(item.datetime * 1000) : new Date(),
        });
      }
    }
    return results;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Finnhub get_news failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  const apiKey = resolvedKey();
  if (!apiKey || apiKey === "your_finnhub_api_key" || apiKey.toLowerCase() === "none") return false;
  try {
    const url = new URL("https://finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", "AAPL");
    url.searchParams.set("token", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
