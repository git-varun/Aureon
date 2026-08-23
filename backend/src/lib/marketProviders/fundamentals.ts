import { prisma } from "../../prisma";
import { NotFoundError, ProviderError } from "../errors";
import * as yahoo from "./yahoo";
import * as finnhub from "./finnhub";
import * as alphavantage from "./alphavantage";
import * as coingecko from "./coingecko";

const CRYPTO_ASSET_CLASSES = new Set(["crypto", "crypto_futures", "stablecoin"]);

type FundamentalsFields = {
  trailingPe?: number | null; priceToBook?: number | null; roe?: number | null;
  debtToEquity?: number | null; profitMargin?: number | null; revenueGrowth?: number | null;
  dividendYield?: number | null; currentRatio?: number | null; quickRatio?: number | null;
  grossMargin?: number | null; operatingMargin?: number | null; eps?: number | null;
  beta?: number | null; high52w?: number | null; low52w?: number | null;
  marketCap?: number | null; circulatingSupply?: number | null; totalSupply?: number | null;
  maxSupply?: number | null; ath?: number | null; atl?: number | null;
};

function toFields(f: Record<string, unknown>): FundamentalsFields {
  const n = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    trailingPe: n(f.trailing_pe), priceToBook: n(f.price_to_book), roe: n(f.roe),
    debtToEquity: n(f.debt_to_equity), profitMargin: n(f.profit_margin), revenueGrowth: n(f.revenue_growth),
    dividendYield: n(f.dividend_yield), currentRatio: n(f.current_ratio), quickRatio: n(f.quick_ratio),
    grossMargin: n(f.gross_margin), operatingMargin: n(f.operating_margin), eps: n(f.eps),
    beta: n(f.beta), high52w: n(f.high_52w), low52w: n(f.low_52w),
    marketCap: n(f.market_cap), circulatingSupply: n(f.circulating_supply), totalSupply: n(f.total_supply),
    maxSupply: n(f.max_supply), ath: n(f.ath), atl: n(f.atl),
  };
}

async function upsertFundamentals(assetId: string, fields: FundamentalsFields, source: string): Promise<void> {
  const now = new Date();
  await prisma.assetFundamentals.upsert({
    where: { assetId },
    create: { assetId, ...fields, source, createdAt: now, updatedAt: now },
    update: { ...fields, source, updatedAt: now },
  });
}

/** Equity chain: Yahoo (unlimited, primary) -> Finnhub (60/min, generous) ->
 * AlphaVantage OVERVIEW (25/day, last resort — only reached when both
 * upstream calls fail). Each stage merges onto the previous partial result
 * rather than overwriting wholesale, so a Yahoo success with a few nulls
 * still benefits from Finnhub filling gaps (e.g. beta/eps/52w range Yahoo's
 * adapter doesn't extract). Yahoo's own beta (already fetched, previously
 * dropped) is included as a fallback under Finnhub's. */
async function refreshEquityFundamentals(symbol: string, assetId: string): Promise<void> {
  let merged: Record<string, unknown> = {};
  let source = "none";
  try {
    merged = { ...(await yahoo.getFundamentals(symbol)) };
    source = "yahoo";
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
  }
  try {
    const fh = await finnhub.getFundamentals(symbol);
    merged = { ...fh, ...Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null)) };
    if (source === "none") source = "finnhub";
    else source = `${source}+finnhub`;
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
  }
  if (Object.values(merged).every((v) => v == null)) {
    try {
      merged = await alphavantage.getFundamentals(symbol);
      source = "alphavantage";
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
    }
  }
  if (Object.values(merged).every((v) => v == null)) return; // total failure, swallow like before

  await upsertFundamentals(assetId, toFields(merged), source);
}

async function refreshCryptoFundamentals(symbol: string, assetId: string): Promise<void> {
  try {
    const f = await coingecko.getFundamentals(symbol);
    await upsertFundamentals(assetId, toFields(f), "coingecko");
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    // Swallowed, matches existing "keep serving existing data" behavior.
  }
}

/** Port of AssetsService._refresh_fundamentals, extended with a real
 * per-asset-class routing decision (previously Yahoo-only regardless of
 * class). CoinGecko is on-demand only (2 calls/60s budget) — never called
 * from a loop/job, only from this explicit ?refresh=true path. */
async function refreshFundamentals(symbol: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { assetClass: true } });
  if (asset && CRYPTO_ASSET_CLASSES.has(asset.assetClass)) {
    await refreshCryptoFundamentals(symbol, assetId);
  } else {
    await refreshEquityFundamentals(symbol, assetId);
  }
}

/** Port of AssetsService.get_fundamentals. Reads asset_snapshot + asset_scores
 * + asset_fundamentals; pe_ratio prefers fund.trailing_pe over the older,
 * frequently-null snap.pe_ratio; de_ratio/dividend_yield are /100-normalized
 * to true fractions (yfinance's raw convention — see yahoo.ts's dividend_yield
 * comment for why Node's adapter re-scales *100 before storage so this
 * read-time /100 stays correct regardless of which backend refreshed the row).
 * vol_30d and graham_number stay hardcoded null (no backing source anywhere
 * in Aureon today). */
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
    market_cap: fund?.marketCap != null ? Number(fund.marketCap) : snap?.marketCap != null ? Number(snap.marketCap) : null,
    momentum_score: snap?.momentumScore != null ? Number(snap.momentumScore) : null,
    volatility_score: snap?.volatilityScore != null ? Number(snap.volatilityScore) : null,
    sentiment_score: snap?.sentimentScore != null ? Number(snap.sentimentScore) : null,
    quality_score: score?.qualityScore != null ? Number(score.qualityScore) : null,
    valuation_score: score?.valuationScore != null ? Number(score.valuationScore) : null,
    pb_ratio: fund?.priceToBook != null ? Number(fund.priceToBook) : null,
    roe: fund?.roe != null ? Number(fund.roe) : null,
    de_ratio: fund?.debtToEquity != null ? Number(fund.debtToEquity) / 100 : null,
    dividend_yield: fund?.dividendYield != null ? Number(fund.dividendYield) / 100 : null,
    current_ratio: fund?.currentRatio != null ? Number(fund.currentRatio) : null,
    quick_ratio: fund?.quickRatio != null ? Number(fund.quickRatio) : null,
    gross_margin: fund?.grossMargin != null ? Number(fund.grossMargin) : null,
    operating_margin: fund?.operatingMargin != null ? Number(fund.operatingMargin) : null,
    eps: fund?.eps != null ? Number(fund.eps) : null,
    beta: fund?.beta != null ? Number(fund.beta) : null,
    vol_30d: null,
    high_52w: fund?.high52w != null ? Number(fund.high52w) : null,
    low_52w: fund?.low52w != null ? Number(fund.low52w) : null,
    graham_number: null,
    circulating_supply: fund?.circulatingSupply != null ? Number(fund.circulatingSupply) : null,
    total_supply: fund?.totalSupply != null ? Number(fund.totalSupply) : null,
    ath: fund?.ath != null ? Number(fund.ath) : null,
    atl: fund?.atl != null ? Number(fund.atl) : null,
    data_source: dataSource,
  };
}
