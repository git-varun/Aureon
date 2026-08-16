import { prisma } from "../../prisma";
import { NotFoundError, ProviderError } from "../errors";
import * as yahoo from "./yahoo";

/** Port of AssetsService._refresh_fundamentals. Swallows ProviderError (e.g.
 * yfinance has no coverage for this symbol, or it's a mutual fund/crypto
 * asset yahoo-finance2 can't resolve) so a refresh attempt on an
 * unsupported symbol doesn't 500 the whole page — the response just keeps
 * serving whatever real data already exists. */
async function refreshFundamentals(symbol: string, assetId: string): Promise<void> {
  try {
    const f = await yahoo.getFundamentals(symbol);
    const now = new Date();
    await prisma.assetFundamentals.upsert({
      where: { assetId },
      create: {
        assetId,
        trailingPe: f.trailing_pe as number | null,
        priceToBook: f.price_to_book as number | null,
        roe: f.roe as number | null,
        debtToEquity: f.debt_to_equity as number | null,
        profitMargin: f.profit_margin as number | null,
        revenueGrowth: f.revenue_growth as number | null,
        dividendYield: f.dividend_yield as number | null,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        trailingPe: f.trailing_pe as number | null,
        priceToBook: f.price_to_book as number | null,
        roe: f.roe as number | null,
        debtToEquity: f.debt_to_equity as number | null,
        profitMargin: f.profit_margin as number | null,
        revenueGrowth: f.revenue_growth as number | null,
        dividendYield: f.dividend_yield as number | null,
        updatedAt: now,
      },
    });
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    // Swallowed — matches Python's except ProviderError: rollback and keep serving existing data.
  }
}

/** Port of AssetsService.get_fundamentals. Reads asset_snapshot + asset_scores
 * + asset_fundamentals; pe_ratio prefers fund.trailing_pe over the older,
 * frequently-null snap.pe_ratio; de_ratio/dividend_yield are /100-normalized
 * to true fractions (yfinance's raw convention — see yahoo.ts's dividend_yield
 * comment for why Node's adapter re-scales *100 before storage so this
 * read-time /100 stays correct regardless of which backend refreshed the row).
 * Exactly 6 fields are hardcoded null (no backing source anywhere in Aureon
 * today): eps, beta, vol_30d, high_52w, low_52w, graham_number. */
export async function getFundamentals(symbolRaw: string, refresh = false): Promise<Record<string, unknown>> {
  const symbol = symbolRaw.toUpperCase().trim();
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  if (!quote) throw new NotFoundError("Asset not found");

  if (refresh && quote.assetId) {
    await refreshFundamentals(symbol, quote.assetId);
  }

  const snap = quote.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
  const score = quote.assetId
    ? await prisma.assetScore.findFirst({ where: { assetId: quote.assetId }, orderBy: { generatedAt: "desc" } })
    : null;
  const fund = quote.assetId ? await prisma.assetFundamentals.findUnique({ where: { assetId: quote.assetId } }) : null;

  const peRatio =
    fund?.trailingPe != null ? Number(fund.trailingPe) : snap?.peRatio != null ? Number(snap.peRatio) : null;

  let dataSource: string | null;
  if (fund !== null) dataSource = "live";
  else if (snap !== null || score !== null) dataSource = "partial";
  else dataSource = null;

  return {
    symbol,
    pe_ratio: peRatio,
    rsi: snap?.rsi != null ? Number(snap.rsi) : null,
    market_cap: snap?.marketCap != null ? Number(snap.marketCap) : null,
    momentum_score: snap?.momentumScore != null ? Number(snap.momentumScore) : null,
    volatility_score: snap?.volatilityScore != null ? Number(snap.volatilityScore) : null,
    sentiment_score: snap?.sentimentScore != null ? Number(snap.sentimentScore) : null,
    quality_score: score?.qualityScore != null ? Number(score.qualityScore) : null,
    valuation_score: score?.valuationScore != null ? Number(score.valuationScore) : null,
    pb_ratio: fund?.priceToBook != null ? Number(fund.priceToBook) : null,
    roe: fund?.roe != null ? Number(fund.roe) : null,
    de_ratio: fund?.debtToEquity != null ? Number(fund.debtToEquity) / 100 : null,
    dividend_yield: fund?.dividendYield != null ? Number(fund.dividendYield) / 100 : null,
    eps: null,
    beta: null,
    vol_30d: null,
    high_52w: null,
    low_52w: null,
    graham_number: null,
    data_source: dataSource,
  };
}
