import type { AssetFundamentals } from "../../generated/prisma";

// Port of app/modules/ai/services/fundamentals_scoring.py.
// Equities are the only asset class with a real fundamentals data source
// today (FUNDAMENTALS_SCORING_SCOPE.md §2) — crypto/funds/NPS/EPF stay
// unavailable.
const SCORABLE_ASSET_CLASS = "equity";

// Clamped linear interpolation bounds, per FUNDAMENTALS_SCORING_SCOPE.md §5.2.
// Each pair is (good, bad): `good` maps to score 1.0, `bad` maps to score 0.0.
const VALUATION_TRAILING_PE_GOOD = 15.0;
const VALUATION_TRAILING_PE_BAD = 40.0;
const VALUATION_PRICE_TO_BOOK_GOOD = 1.0;
const VALUATION_PRICE_TO_BOOK_BAD = 6.0;
const VALUATION_DIVIDEND_YIELD_GOOD = 5.0;
const VALUATION_DIVIDEND_YIELD_BAD = 0.0;

const QUALITY_ROE_GOOD = 0.2;
const QUALITY_ROE_BAD = 0.05;
const QUALITY_PROFIT_MARGIN_GOOD = 0.2;
const QUALITY_PROFIT_MARGIN_BAD = 0.0;
const QUALITY_REVENUE_GROWTH_GOOD = 0.2;
const QUALITY_REVENUE_GROWTH_BAD = 0.0;
const QUALITY_DEBT_TO_EQUITY_GOOD = 50.0;
const QUALITY_DEBT_TO_EQUITY_BAD = 150.0;

// FUNDAMENTALS_SCORING_SCOPE.md §5.3: below this many present metrics, the
// whole score stays unavailable rather than being computed from too thin a
// sample to be a signal the BUY/REDUCE gates should act on.
const VALUATION_MIN_METRICS_REQUIRED = 2;
const QUALITY_MIN_METRICS_REQUIRED = 2;

function linearScore(value: number, good: number, bad: number): number {
  if (good === bad) return 1.0;
  const frac = (value - bad) / (good - bad);
  return Math.max(0.0, Math.min(1.0, frac));
}

export interface QualityValuationResult {
  qualityScore: number | null;
  valuationScore: number | null;
  unavailableInputs: string[];
}

/** Port of compute_quality_valuation_scores. Renormalizes the weighted
 * average over whichever metrics are present (never fabricates a value for
 * a missing one) and requires a minimum metric count before computing a
 * partial score at all. Non-equity assets, or equities with no fundamentals
 * row yet, get (null, null) — unavailable, not a fabricated neutral value. */
export function computeQualityValuationScores(
  assetClass: string | null,
  fundamentals: AssetFundamentals | null,
): QualityValuationResult {
  const unavailableInputs: string[] = [];

  if (assetClass !== SCORABLE_ASSET_CLASS || fundamentals === null) {
    unavailableInputs.push("quality_score", "valuation_score");
    return { qualityScore: null, valuationScore: null, unavailableInputs };
  }

  const valuationTerms: number[] = [];
  if (fundamentals.trailingPe !== null) {
    valuationTerms.push(linearScore(Number(fundamentals.trailingPe), VALUATION_TRAILING_PE_GOOD, VALUATION_TRAILING_PE_BAD));
  } else {
    unavailableInputs.push("trailing_pe");
  }
  if (fundamentals.priceToBook !== null) {
    valuationTerms.push(linearScore(Number(fundamentals.priceToBook), VALUATION_PRICE_TO_BOOK_GOOD, VALUATION_PRICE_TO_BOOK_BAD));
  } else {
    unavailableInputs.push("price_to_book");
  }
  if (fundamentals.dividendYield !== null) {
    valuationTerms.push(linearScore(Number(fundamentals.dividendYield), VALUATION_DIVIDEND_YIELD_GOOD, VALUATION_DIVIDEND_YIELD_BAD));
  } else {
    unavailableInputs.push("dividend_yield");
  }

  let valuationScore: number | null;
  if (valuationTerms.length >= VALUATION_MIN_METRICS_REQUIRED) {
    valuationScore = valuationTerms.reduce((a, b) => a + b, 0) / valuationTerms.length;
  } else {
    valuationScore = null;
    unavailableInputs.push("valuation_score");
  }

  const qualityTerms: number[] = [];
  if (fundamentals.roe !== null) {
    qualityTerms.push(linearScore(Number(fundamentals.roe), QUALITY_ROE_GOOD, QUALITY_ROE_BAD));
  } else {
    unavailableInputs.push("roe");
  }
  if (fundamentals.profitMargin !== null) {
    qualityTerms.push(linearScore(Number(fundamentals.profitMargin), QUALITY_PROFIT_MARGIN_GOOD, QUALITY_PROFIT_MARGIN_BAD));
  } else {
    unavailableInputs.push("profit_margin");
  }
  if (fundamentals.revenueGrowth !== null) {
    qualityTerms.push(linearScore(Number(fundamentals.revenueGrowth), QUALITY_REVENUE_GROWTH_GOOD, QUALITY_REVENUE_GROWTH_BAD));
  } else {
    unavailableInputs.push("revenue_growth");
  }
  if (fundamentals.debtToEquity !== null) {
    qualityTerms.push(linearScore(Number(fundamentals.debtToEquity), QUALITY_DEBT_TO_EQUITY_GOOD, QUALITY_DEBT_TO_EQUITY_BAD));
  } else {
    unavailableInputs.push("debt_to_equity");
  }

  let qualityScore: number | null;
  if (qualityTerms.length >= QUALITY_MIN_METRICS_REQUIRED) {
    qualityScore = qualityTerms.reduce((a, b) => a + b, 0) / qualityTerms.length;
  } else {
    qualityScore = null;
    unavailableInputs.push("quality_score");
  }

  return { qualityScore, valuationScore, unavailableInputs };
}
