import YahooFinance from "yahoo-finance2";
import { ProviderError } from "../errors";
import type { NormalizedQuote, NormalizedNews } from "./types";

// Narrowed shape of yahoo-finance2's SearchNews item — just the fields
// filterYahooSearchNews reads, defined locally so it can be exercised with
// synthetic fixtures in tests without importing the library's internal
// module path.
export interface YahooSearchNewsItem {
  title?: string;
  link?: string;
  providerPublishTime?: Date;
  relatedTickers?: string[];
}

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// LSE (and a handful of other UK-linked listings) quote in pence, not
// pounds — confirmed live: ordinary .L equities (SHEL, AZN, HSBA, VOD,
// BARC, LLOY, ...) return currency "GBp"/"GBX" with price in pence, but
// some LSE-listed ETFs (VWRL.L, VUSA.L) are already GBP, and others
// (CSPX.L) are USD outright — the ".L" suffix alone does not determine the
// unit, so this must be resolved from the real per-symbol currency Yahoo
// returns, never assumed from the exchange suffix.
const PENCE_CURRENCIES = new Set(["GBp", "GBX"]);

/** Port of _normalize_pence. Returns [price, currency] with pence-
 * denominated quotes converted to pounds — otherwise a portfolio value
 * computed from a raw GBp price would be silently wrong by 100x. Any other
 * currency (or an unresolved one) is passed through unchanged. */
function normalizePence(price: number, currency: string | null | undefined): [number, string | null] {
  if (currency && PENCE_CURRENCIES.has(currency)) return [price / 100, "GBP"];
  return [price, currency ?? null];
}

const PROVIDER_NAME = "yahoo";

/** Port of YahooAdapter.get_quote. */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  try {
    const q = await yf.quote(symbol);
    const rawPrice = q.currentPrice ?? q.regularMarketPrice ?? q.ask ?? q.bid ?? q.regularMarketPreviousClose;
    if (!rawPrice) throw new ProviderError(`No price returned by Yahoo Finance for symbol ${symbol}`);
    const [price, currency] = normalizePence(rawPrice, q.currency);
    const volume = q.regularMarketVolume ?? q.volume ?? 0;
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price,
      volume: volume || null,
      currency,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Yahoo get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

/** Port of YahooAdapter.get_fundamentals. Values are returned raw (not yet
 * unit-normalized) — roe/debt_to_equity/dividend_yield normalization
 * happens in the fundamentals composition layer, matching AssetsService's
 * split between the adapter and the service in Python. */
export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  try {
    const r = await yf.quoteSummary(symbol, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "summaryProfile"],
    });
    // r.summaryDetail.marketCap is confirmed live to already be in true
    // currency units (GBP) even for GBp/pence-quoted symbols — unlike the
    // live quote price, which genuinely is in pence. Do not normalizePence() here.
    return {
      trailing_pe: r.summaryDetail?.trailingPE ?? null,
      forward_pe: r.summaryDetail?.forwardPE ?? null,
      price_to_book: r.defaultKeyStatistics?.priceToBook ?? null,
      roe: r.financialData?.returnOnEquity ?? null,
      // debt_to_equity matches yfinance's raw convention (a percentage-point
      // number, e.g. 10.211 meaning D/E~0.10211) — still needs the same /100
      // normalization Python applies downstream in the fundamentals
      // composition layer.
      debt_to_equity: r.financialData?.debtToEquity ?? null,
      profit_margin: r.financialData?.profitMargins ?? null,
      revenue_growth: r.financialData?.revenueGrowth ?? null,
      earnings_growth: r.financialData?.earningsGrowth ?? null,
      // market.asset_fundamentals.dividend_yield is a column shared with the
      // untouched Python backend, whose composition layer (services/assets.py)
      // unconditionally divides by 100 assuming yfinance's raw percentage-point
      // convention (e.g. AAPL -> 0.35 meaning 0.35%). yahoo-finance2's
      // summaryDetail.dividendYield is already a true fraction (confirmed
      // live: AAPL -> 0.0035, same real-world 0.35%) — a different library
      // convention for the "same" field. Re-scaled by *100 here so every row
      // in the shared table uses one on-disk convention regardless of which
      // backend's refresh wrote it; the Node composition layer (Task 8) then
      // applies the identical /100 read-time normalization Python does.
      dividend_yield: r.summaryDetail?.dividendYield != null ? r.summaryDetail.dividendYield * 100 : null,
      beta: r.defaultKeyStatistics?.beta ?? null,
      // No enterpriseValue fallback — Python is info.get("marketCap") or
      // nothing; enterprise value adds debt/subtracts cash, a materially
      // different number under the same field name.
      market_cap: r.summaryDetail?.marketCap ?? null,
      sector: r.summaryProfile?.sector ?? null,
      industry: r.summaryProfile?.industry ?? null,
    };
  } catch (e) {
    throw new ProviderError(`Yahoo get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

const PERIOD_TO_DAYS: Record<string, number> = { "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825 };

export interface PriceHistoryRow {
  timestamp: Date;
  close: number;
  volume: number | null;
}

/** Port of YahooAdapter.get_price_history — same pence-normalization as
 * getQuote (LSE GBp/GBX symbols quote in pence), applied uniformly to the
 * whole series via the chart response's meta.currency rather than a
 * per-row lookup. */
export async function getPriceHistory(symbol: string, period: string = "3mo", interval: string = "1d"): Promise<PriceHistoryRow[]> {
  if (interval !== "1d") {
    throw new ProviderError(`${PROVIDER_NAME} only supports daily price history, got interval=${interval}`);
  }
  const days = PERIOD_TO_DAYS[period] ?? 90;
  try {
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await yf.chart(symbol, { period1, interval: "1d", return: "array" });
    const divisor = result.meta.currency && PENCE_CURRENCIES.has(result.meta.currency) ? 100 : 1;
    const rows: PriceHistoryRow[] = [];
    for (const q of result.quotes) {
      if (q.close == null) continue;
      rows.push({ timestamp: q.date, close: q.close / divisor, volume: q.volume ?? null });
    }
    return rows;
  } catch (e) {
    throw new ProviderError(`Yahoo get_price_history failed for ${symbol}: ${(e as Error).message}`);
  }
}

/** Port of YahooAdapter.get_news / _parse_yahoo_news_item. yahoo-finance2's
 * search() news array only ever matches yfinance's legacy flat item shape
 * (title/link/providerPublishTime as a real Date, already parsed) — there is
 * no equivalent of yfinance's newer item["content"]/canonicalUrl branch to
 * port, since search() is a different Yahoo endpoint than yfinance's
 * Ticker.news and returns its own consistent shape.
 *
 * Unlike yfinance's Ticker.news (already symbol-scoped), search() ranks by
 * query relevance and returns adjacent stories about other tickers entirely
 * (confirmed live: a search("AAPL") call returned a Nvidia-only article) —
 * so relatedTickers is used to keep only items actually about this symbol,
 * dropping anything with no relatedTickers at all rather than risk
 * mis-attributing an off-topic story into news_assets/sentiment for this
 * symbol. */
/** Pure item filter/mapper, split out from getNews so the relatedTickers
 * judgment call above can be exercised with synthetic fixtures — this
 * codebase has no live-network test precedent for provider adapters (see
 * routing.test.ts's split of pure logic from the live-only getQuote calls). */
export function filterYahooSearchNews(items: YahooSearchNewsItem[], symbol: string): NormalizedNews[] {
  const parsed: NormalizedNews[] = [];
  for (const item of items) {
    if (!item.title || !item.link) continue;
    const related = item.relatedTickers ?? [];
    if (!related.some((t) => t.toUpperCase() === symbol.toUpperCase())) continue;
    parsed.push({
      provider: PROVIDER_NAME,
      title: item.title,
      url: item.link,
      publishedAt: item.providerPublishTime ?? new Date(),
    });
  }
  return parsed;
}

export async function getNews(symbol: string): Promise<NormalizedNews[]> {
  try {
    const result = await yf.search(symbol);
    return filterYahooSearchNews(result.news ?? [], symbol);
  } catch (e) {
    throw new ProviderError(`Yahoo get_news failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await yf.quote("AAPL");
    return true;
  } catch {
    return false;
  }
}
