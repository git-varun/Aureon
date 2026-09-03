import YahooFinance from "yahoo-finance2";
import {ProviderError} from "../errors";
import {toPythonIsoString} from "../tz";
import type {NormalizedNews, NormalizedQuote} from "./types";

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

const MAX_UPGRADE_DOWNGRADE_ROWS = 20;
const MAX_ANALYST_REPORTS = 5;

export interface AnalystSignals {
    symbol: string;
    recommendation_trend: Array<{
        period: string;
        strong_buy: number | null;
        buy: number | null;
        hold: number | null;
        sell: number | null;
        strong_sell: number | null
    }>;
    upgrade_downgrade_history: Array<{
        date: string;
        firm: string | null;
        to_grade: string | null;
        from_grade: string | null;
        action: string | null;
        price_target_action: string | null;
        current_price_target: number | null;
        prior_price_target: number | null;
    }>;
    earnings_trend: Array<{
        period: string;
        end_date: string | null;
        growth: number | null;
        eps_estimate_avg: number | null;
        eps_estimate_low: number | null;
        eps_estimate_high: number | null;
        eps_year_ago: number | null;
        num_analysts: number | null;
        revenue_estimate_avg: number | null;
        revenue_estimate_low: number | null;
        revenue_estimate_high: number | null;
        revenue_year_ago: number | null;
    }>;
    target_price_high: number | null;
    target_price_low: number | null;
    target_price_mean: number | null;
    target_price_median: number | null;
    recommendation_mean: number | null;
    recommendation_key: string | null;
    analyst_count: number | null;
    // A single provider's current rating + target — a distinct source from
    // recommendation_mean/target_price_mean above (those are the consensus
    // across all covering analysts; this is one named provider's latest call).
    current_recommendation: { target_price: number | null; provider: string | null; rating: string | null } | null;
    // Yahoo's insights `reports[].reportTitle` is confirmed live to be the
    // report's full body paragraph, not a short title — `headHtml` is the
    // actual short title. Surfaced as `title` here from `headHtml`, and the
    // long body is dropped entirely (matches getNews's no-full-body
    // convention).
    recent_reports: Array<{
        provider: string | null;
        report_date: string | null;
        report_type: string | null;
        title: string | null;
        target_price: number | null;
        investment_rating: string | null;
    }>;
}

/** Real analyst-signal data: consensus recommendation trend, rating-change
 * history, forward earnings estimates, and target price — all free,
 * unauthenticated Yahoo endpoints. Two separate Yahoo calls: one
 * quoteSummary covering recommendationTrend/upgradeDowngradeHistory/
 * earningsTrend/financialData (following getFundamentals's multi-module
 * pattern), plus a second insights() call for its distinct single-provider
 * rating + per-report ratings. Not `recommendationsBySymbol` — confirmed
 * live that's Yahoo's "similar stocks" recommender, unrelated to analyst
 * ratings despite the name. Live-only, no cache — matches every other
 * Yahoo call in this file (Yahoo has no formal budget in this codebase).
 *
 * Crypto/other symbols with no analyst coverage confirmed live to throw a
 * distinct quoteSummary error ("No fundamentals data found for symbol: X")
 * from a genuinely unknown symbol's error ("Quote not found for symbol: X")
 * — the former is treated as "no coverage" (empty result, not an error);
 * `insights()` itself returns an empty-but-successful shape for these
 * symbols rather than throwing, confirmed live for BTC-USD. */
export async function getAnalystSignals(symbol: string): Promise<AnalystSignals> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- quoteSummary's module-keyed overload resolves to `unknown` without an explicit generic; every field below is already null-coalesced.
        let r: any = {};
        try {
            r = await yf.quoteSummary(symbol, {modules: ["recommendationTrend", "upgradeDowngradeHistory", "earningsTrend", "financialData"]});
        } catch (e) {
            if (!(e as Error).message?.startsWith("No fundamentals data found")) throw e;
        }
        const ins = await yf.insights(symbol);

        const recommendationTrend = (r.recommendationTrend?.trend ?? []).map((t: any) => ({
            period: t.period,
            strong_buy: t.strongBuy ?? null,
            buy: t.buy ?? null,
            hold: t.hold ?? null,
            sell: t.sell ?? null,
            strong_sell: t.strongSell ?? null,
        }));

        const upgradeDowngradeHistory = (r.upgradeDowngradeHistory?.history ?? [])
            .slice(0, MAX_UPGRADE_DOWNGRADE_ROWS)
            .map((h: any) => ({
                date: toPythonIsoString(h.epochGradeDate),
                firm: h.firm ?? null,
                to_grade: h.toGrade ?? null,
                from_grade: h.fromGrade ?? null,
                action: h.action ?? null,
                price_target_action: h.priceTargetAction ?? null,
                current_price_target: h.currentPriceTarget ?? null,
                prior_price_target: h.priorPriceTarget ?? null,
            }));

        const earningsTrend = (r.earningsTrend?.trend ?? []).map((t: any) => ({
            period: t.period,
            end_date: t.endDate ? toPythonIsoString(t.endDate) : null,
            growth: t.growth ?? null,
            eps_estimate_avg: t.earningsEstimate?.avg ?? null,
            eps_estimate_low: t.earningsEstimate?.low ?? null,
            eps_estimate_high: t.earningsEstimate?.high ?? null,
            eps_year_ago: t.earningsEstimate?.yearAgoEps ?? null,
            num_analysts: t.earningsEstimate?.numberOfAnalysts ?? null,
            revenue_estimate_avg: t.revenueEstimate?.avg ?? null,
            revenue_estimate_low: t.revenueEstimate?.low ?? null,
            revenue_estimate_high: t.revenueEstimate?.high ?? null,
            revenue_year_ago: t.revenueEstimate?.yearAgoRevenue ?? null,
        }));

        const recentReports = (ins.reports ?? []).slice(0, MAX_ANALYST_REPORTS).map((rep) => ({
            provider: rep.provider ?? null,
            report_date: rep.reportDate ? toPythonIsoString(rep.reportDate) : null,
            report_type: rep.reportType ?? null,
            title: rep.headHtml ?? null,
            target_price: rep.targetPrice ?? null,
            investment_rating: rep.investmentRating ?? null,
        }));

        return {
            symbol,
            recommendation_trend: recommendationTrend,
            upgrade_downgrade_history: upgradeDowngradeHistory,
            earnings_trend: earningsTrend,
            target_price_high: r.financialData?.targetHighPrice ?? null,
            target_price_low: r.financialData?.targetLowPrice ?? null,
            target_price_mean: r.financialData?.targetMeanPrice ?? null,
            target_price_median: r.financialData?.targetMedianPrice ?? null,
            recommendation_mean: r.financialData?.recommendationMean ?? null,
            recommendation_key: r.financialData?.recommendationKey ?? null,
            analyst_count: r.financialData?.numberOfAnalystOpinions ?? null,
            current_recommendation: ins.recommendation
                ? {
                    target_price: ins.recommendation.targetPrice ?? null,
                    provider: ins.recommendation.provider ?? null,
                    rating: ins.recommendation.rating ?? null,
                }
                : null,
            recent_reports: recentReports,
        };
    } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError(`Yahoo get_analyst_signals failed for ${symbol}: ${(e as Error).message}`);
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
 * per-row lookup.
 *
 * Uses `adjclose`, not `close`: yfinance's `ticker.history()` defaults to
 * `auto_adjust=True`, so Python's `row.get("Close")` is already the
 * dividend/split-adjusted close — confirmed live (2026-08-11) by diffing
 * yahoo-finance2's `chart()` output against `yfinance` for AAPL/AXISBANK.NS/
 * BTC-USD: `close` (raw) diverges from Python's value on symbols with a
 * dividend inside the window (AAPL: 317.31 raw vs Python's 317.037), while
 * `adjclose` matches Python exactly to the last decimal. Symbols with no
 * dividend/split in-window (AXISBANK.NS, BTC-USD) have close==adjclose, so
 * this only silently regresses when it matters. */
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
      const adjClose = q.adjclose ?? q.close;
      if (adjClose == null) continue;
      rows.push({ timestamp: q.date, close: adjClose / divisor, volume: q.volume ?? null });
    }
    return rows;
  } catch (e) {
    throw new ProviderError(`Yahoo get_price_history failed for ${symbol}: ${(e as Error).message}`);
  }
}

/** Raw v8/finance/chart fetch with a native Yahoo `range` shorthand (e.g.
 * "1mo"), bypassing yahoo-finance2's chart() wrapper entirely — that wrapper
 * only accepts explicit period1/period2 dates, which cannot reproduce
 * yfinance's `ticker.history(period="1mo")` window exactly (a calendar-day
 * approximation desyncs the row count from Yahoo's own "1mo" range by
 * exactly the amount that then shifts every value of a recursive/stateful
 * EMA — confirmed live, see getTechnicalIndicators's doc comment). No
 * crumb/cookie needed: this endpoint answers an anonymous request with the
 * same `User-Agent` header nse_direct's live-quote path already uses. */
async function fetchAdjustedCloses(symbol: string, range: string): Promise<Array<number | null>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new ProviderError(`Yahoo chart HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as {
    chart: {
      result: Array<{ indicators: { quote: Array<{ close: Array<number | null> }>; adjclose?: Array<{ adjclose: Array<number | null> }> } }> | null;
    };
  };
  const result = data.chart.result?.[0];
  if (!result) throw new ProviderError(`Yahoo chart: no data for ${symbol}`);
  return result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
}

/** Port of pandas' `.ewm(..., adjust=False).mean()` with its default
 * `ignore_na=False`: a null/NaN input carries the previous output forward
 * *unchanged* (the recurrence step is skipped entirely for that index), not
 * dropped from the series and not treated as a zero-valued input. This is
 * not equivalent to filtering nulls out first — confirmed live: doing that
 * for AXISBANK.NS's trailing null (today's still-open NSE session) shifted
 * `macd_signal` by ~0.5 because the downstream signal-line EMA still runs
 * one more real recurrence step against the *healed* (carried-forward,
 * still-numeric) macd_line value at that index — pandas only skips the
 * step where the *original* input was null, not every step downstream of it.
 * Exported for direct unit testing against pandas' documented semantics. */
export function ewmSkipNaN(values: Array<number | null>, alpha: number): Array<number | null> {
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (const v of values) {
    if (v == null || Number.isNaN(v)) {
      out.push(prev);
    } else if (prev == null) {
      out.push(v);
      prev = v;
    } else {
      const updated: number = (1 - alpha) * prev + alpha * v;
      out.push(updated);
      prev = updated;
    }
  }
  return out;
}

function lastNonNull(arr: Array<number | null>): number | null {
  return arr[arr.length - 1] ?? null;
}

/** Port of _calculate_rsi's final value (Wilder-style, com=period-1 so
 * alpha=1/period), computed over the raw (possibly-trailing-null) close
 * series so ewmSkipNaN's carry-forward semantics apply identically to
 * Python's. */
export function computeRsi(closes: Array<number | null>, period = 14): number | null {
  const deltas: Array<number | null> = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] == null || closes[i - 1] == null ? null : closes[i]! - closes[i - 1]!);
  }
  const up = deltas.map((d) => (d == null ? null : Math.max(d, 0)));
  const down = deltas.map((d) => (d == null ? null : -Math.min(d, 0)));
  const alpha = 1 / period;
  const emaUp = lastNonNull(ewmSkipNaN(up, alpha));
  const emaDown = lastNonNull(ewmSkipNaN(down, alpha));
  if (emaUp == null || emaDown == null) return null;
  const rs = emaUp / emaDown;
  return 100 - 100 / (1 + rs);
}

/** Port of _calculate_macd's final (macd, signal) pair. The inner exp1/exp2
 * EMAs use ewmSkipNaN over the raw close series (matching macd_line's own
 * NaN-carry-forward); the outer signal-line EMA runs over macd_line, which
 * — once inputs have "healed" through the inner carry-forward — has no
 * remaining nulls, so it takes one more genuine recurrence step than a
 * naive "drop nulls first" implementation would. */
export function computeMacd(closes: Array<number | null>, fast = 12, slow = 26, signal = 9): [number, number] | null {
  const alphaFast = 2 / (fast + 1);
  const alphaSlow = 2 / (slow + 1);
  const exp1 = ewmSkipNaN(closes, alphaFast);
  const exp2 = ewmSkipNaN(closes, alphaSlow);
  const macdLine: Array<number | null> = closes.map((_, i) => (exp1[i] == null || exp2[i] == null ? null : exp1[i]! - exp2[i]!));
  const alphaSig = 2 / (signal + 1);
  const signalLine = ewmSkipNaN(macdLine, alphaSig);
  const macdVal = lastNonNull(macdLine);
  const signalVal = lastNonNull(signalLine);
  if (macdVal == null || signalVal == null) return null;
  return [macdVal, signalVal];
}

/** Port of `returns.std()` in get_technical_indicators — pandas' plain
 * (non-ewm) `.pct_change().dropna().std()` is a true null-drop (sample std,
 * ddof=1), not the ewm carry-forward semantics above; those two pandas
 * operations have different NaN handling and must not share an
 * implementation. */
export function computeVolatility(closes: Array<number | null>): number | null {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] == null || closes[i - 1] == null) continue;
    returns.push(closes[i]! / closes[i - 1]! - 1);
  }
  if (returns.length === 0) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  if (returns.length < 2) return 0;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: number | null;
  macd_signal: number | null;
  volatility: number | null;
  sentiment: null;
  action: "BUY" | "SELL" | "HOLD" | null;
  trend: "Overbought" | "Oversold" | "Neutral" | null;
  source: "yfinance" | "unavailable";
  news_timestamp: number | null;
}

const UNAVAILABLE_INDICATORS: TechnicalIndicators = {
  rsi: null, macd: null, macd_signal: null, volatility: null, sentiment: null,
  action: null, trend: null, source: "unavailable", news_timestamp: null,
};

/** Port of YahooAdapter.get_technical_indicators. Swallows failures into the
 * same "unavailable" shape Python returns (this is a best-effort enrichment
 * call in the asset-evaluation chain, not one that should abort the chain).
 *
 * news_timestamp diverges from Python by construction: Python reads
 * `ticker.news` (yfinance's dedicated news accessor); this reuses getNews's
 * `yf.search(symbol).news` results (a different, already-ported Yahoo
 * endpoint — see getNews's own doc comment on why search results need
 * relatedTickers filtering that `ticker.news` doesn't). Flagged, not
 * silently approximated — no Node equivalent of `ticker.news` is ported. */
export async function getTechnicalIndicators(symbol: string): Promise<TechnicalIndicators> {
  try {
    const closes = await fetchAdjustedCloses(symbol, "1mo");
    if (closes.length < 14) return UNAVAILABLE_INDICATORS;

    const rsiVal = computeRsi(closes);
    const macdPair = computeMacd(closes);
    const volatilityVal = computeVolatility(closes);
    if (macdPair == null) return UNAVAILABLE_INDICATORS;
    const [macdVal, macdSig] = macdPair;

    const action = rsiVal == null ? null : rsiVal > 70 ? "SELL" : rsiVal < 30 ? "BUY" : "HOLD";
    const trend = rsiVal == null ? null : rsiVal > 70 ? "Overbought" : rsiVal < 30 ? "Oversold" : "Neutral";

    let newsTimestamp: number | null = null;
    try {
      const news = await getNews(symbol);
      if (news.length > 0) {
        newsTimestamp = Math.max(...news.map((n) => Math.floor(n.publishedAt.getTime() / 1000)));
      }
    } catch {
      // Matches Python's outer try/except: a news-fetch failure degrades
      // news_timestamp to null, not the whole indicators call.
    }

    return { rsi: rsiVal, macd: macdVal, macd_signal: macdSig, volatility: volatilityVal, sentiment: null, action, trend, source: "yfinance", news_timestamp: newsTimestamp };
  } catch {
    return UNAVAILABLE_INDICATORS;
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
