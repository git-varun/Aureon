import { ConfigurationError, ProviderError } from "../errors";
import { logger } from "../logger";
import { isNonUsExchangeSymbol } from "./routing";
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

/** Port target: real ratio depth via /stock/metric?metric=all, replacing
 * the old profile2-only stub (market_cap/sector/industry only). Values are
 * pre-scaled here to match asset_fundamentals's on-disk convention (see
 * fundamentals.ts unit-normalization table) so every caller can write
 * straight through with no further math. */
export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  const apiKey = requireKey();
  try {
    const profileUrl = new URL("https://finnhub.io/api/v1/stock/profile2");
    profileUrl.searchParams.set("symbol", symbol);
    profileUrl.searchParams.set("token", apiKey);
    const profileRes = await fetch(profileUrl, { signal: AbortSignal.timeout(10_000) });
    if (!profileRes.ok) throw new Error(`HTTP ${profileRes.status}`);
    const profile = (await profileRes.json()) as { marketCapitalization?: number; finnhubIndustry?: string };

    const metricUrl = new URL("https://finnhub.io/api/v1/stock/metric");
    metricUrl.searchParams.set("symbol", symbol);
    metricUrl.searchParams.set("metric", "all");
    metricUrl.searchParams.set("token", apiKey);
    const metricRes = await fetch(metricUrl, { signal: AbortSignal.timeout(10_000) });
    if (!metricRes.ok) throw new Error(`HTTP ${metricRes.status}`);
    const metricData = (await metricRes.json()) as { metric?: Record<string, number | undefined> };
    const m = metricData.metric ?? {};

    if (!profile || Object.keys(profile).length === 0) {
      throw new ProviderError(`No fundamentals returned from Finnhub for symbol ${symbol}`);
    }

    const pct = (v: number | undefined): number | null => (v == null ? null : v / 100);

    return {
      market_cap: profile.marketCapitalization ?? null,
      sector: profile.finnhubIndustry ?? null,
      industry: profile.finnhubIndustry ?? null,
      trailing_pe: m.peTTM ?? m.peExclExtraTTM ?? null,
      price_to_book: m.pbAnnual ?? null,
      roe: pct(m.roeTTM),
      profit_margin: pct(m.netProfitMarginTTM),
      revenue_growth: pct(m.revenueGrowthTTMYoy),
      debt_to_equity: m["totalDebt/totalEquityAnnual"] != null ? m["totalDebt/totalEquityAnnual"] * 100 : null,
      dividend_yield: m.dividendYieldIndicatedAnnual ?? null,
      current_ratio: m.currentRatioAnnual ?? null,
      quick_ratio: m.quickRatioAnnual ?? null,
      gross_margin: pct(m.grossMarginTTM),
      operating_margin: pct(m.operatingMarginTTM),
      eps: m.epsTTM ?? null,
      beta: m.beta ?? null,
      high_52w: m["52WeekHigh"] ?? null,
      low_52w: m["52WeekLow"] ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Finnhub get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

interface FinnhubNewsItem {
  headline?: string;
  url?: string;
  datetime?: number;
  summary?: string;
}

// Corporate-form / filler tokens stripped when deriving match aliases from a
// company name — "Apple Inc" -> ["apple"], not ["apple", "inc"].
const NAME_STOPWORDS = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited",
  "plc", "llc", "lp", "holdings", "holding", "group", "sa", "ag", "nv", "se",
  "the", "class", "technologies", "technology", "company's",
]);

/** Build the lowercase tokens used to decide whether a Finnhub company-news
 * item is actually about `symbol`. Finnhub's `company-news` payload has no
 * usable relevance signal — `related` only ever echoes the queried symbol
 * back and `category` is always "company" (confirmed live 2026-09-03) — so
 * relevance is judged by matching the real company name (from profile2) plus
 * the bare ticker against the item's headline + summary text.
 *
 * Returns [] when no company name is available (crypto, non-US symbols
 * profile2 does not cover): with nothing reliable to match on, the caller
 * drops Finnhub news for that symbol entirely rather than trust it blindly.
 * Yahoo still covers those symbols (its relatedTickers filter keeps crypto). */
export function finnhubRelevanceAliases(symbol: string, companyName: string | null): string[] {
  if (!companyName) return [];
  const aliases = new Set<string>();
  const base = symbol.toUpperCase().split(/[-.]/)[0].trim();
  if (base.length >= 2) aliases.add(base.toLowerCase());
  for (const tok of companyName.toLowerCase().split(/[^a-z0-9&]+/)) {
    if (tok.length >= 3 && !NAME_STOPWORDS.has(tok)) aliases.add(tok);
  }
  return [...aliases];
}

function aliasMatches(haystack: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

/** Pure filter/mapper for Finnhub company-news, split out for fixture-based
 * testing — same rationale as yahoo's filterYahooSearchNews. Keeps an item
 * only when at least one relevance alias appears (word-boundary match) in its
 * headline or summary; the 20-item cap is applied *after* filtering so a
 * symbol with a high volume of off-topic copy still yields up to 20 genuine
 * articles. Empty `aliases` drops everything (see finnhubRelevanceAliases). */
export function filterFinnhubCompanyNews(items: FinnhubNewsItem[], aliases: string[]): NormalizedNews[] {
  if (aliases.length === 0) return [];
  const results: NormalizedNews[] = [];
  for (const item of items) {
    if (!item.headline || !item.url) continue;
    const haystack = `${item.headline} ${item.summary ?? ""}`.toLowerCase();
    if (!aliases.some((a) => aliasMatches(haystack, a))) continue;
    results.push({
      provider: PROVIDER_NAME,
      title: item.headline,
      url: item.url,
      publishedAt: item.datetime ? new Date(item.datetime * 1000) : new Date(),
    });
    if (results.length >= 20) break;
  }
  return results;
}

async function resolveCompanyName(symbol: string, apiKey: string): Promise<string | null> {
  try {
    const url = new URL("https://finnhub.io/api/v1/stock/profile2");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string };
    return data.name && data.name.trim() ? data.name.trim() : null;
  } catch {
    return null;
  }
}

/** Port of FinnhubAdapter.get_news — company-news, last 30 days, capped at
 * 20 items. Returns [] rather than throwing when unconfigured (unlike
 * getQuote/getFundamentals's requireKey), matching Python's own get_news
 * early-return.
 *
 * Diverges from Python by relevance-filtering the response: `company-news`
 * mixes large volumes of off-topic market copy in with the genuine articles
 * and attributes all of it to the queried symbol (confirmed live: Warren
 * Buffett / UnitedHealth / Google-antitrust stories all tagged AAPL). Yahoo's
 * getNews already does the equivalent via relatedTickers; Finnhub has no such
 * field, so it is matched on the company name from profile2 instead. */
export async function getNews(symbol: string): Promise<NormalizedNews[]> {
  const apiKey = resolvedKey();
  if (!apiKey || apiKey === "your_finnhub_api_key" || apiKey.toLowerCase() === "none") return [];

  // Finnhub's free tier is US-listed-only — company-news and profile2 both
  // 403 on every .NS/.BO/JP/HK/EU symbol. Skip the guaranteed-failing calls
  // (same non-US-exchange gate the quote fallback chain uses, routing.ts).
  // Returning [] rather than throwing also stops an NSE-heavy fetch_news
  // slate from logging a spurious whole-cycle FAILED on a Yahoo hiccup.
  if (isNonUsExchangeSymbol(symbol)) return [];

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
    const data = (await res.json()) as FinnhubNewsItem[];

    const companyName = await resolveCompanyName(symbol, apiKey);
    const aliases = finnhubRelevanceAliases(symbol, companyName);
    if (aliases.length === 0) {
      logger.warn(
        { symbol },
        "finnhub getNews: no company name resolved — dropping Finnhub company-news for this symbol (relevance unverifiable)",
      );
      return [];
    }
    return filterFinnhubCompanyNews(data, aliases);
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
