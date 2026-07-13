from typing import Optional

from app.modules.market.entities.market import AssetFundamentals

# Equities are the only asset class with a real fundamentals data source today
# (see FUNDAMENTALS_SCORING_SCOPE.md §2) — crypto/funds/NPS/EPF stay unavailable.
_SCORABLE_ASSET_CLASS = "equity"

# Clamped linear interpolation bounds, per FUNDAMENTALS_SCORING_SCOPE.md §5.2.
# Each pair is (good, bad): `good` maps to score 1.0, `bad` maps to score 0.0.
# valuation_score: high score = cheap (§5.1) — trailing P/E and P/B are
# "lower is better" (good < bad); dividend yield is "higher is better"
# (good > bad) — the one most likely to get flipped by mistake.
VALUATION_TRAILING_PE_GOOD = 15.0
VALUATION_TRAILING_PE_BAD = 40.0
VALUATION_PRICE_TO_BOOK_GOOD = 1.0
VALUATION_PRICE_TO_BOOK_BAD = 6.0
# dividend_yield is stored on yfinance's percent scale (e.g. 3.14 == 3.14%).
VALUATION_DIVIDEND_YIELD_GOOD = 5.0
VALUATION_DIVIDEND_YIELD_BAD = 0.0

# quality_score: ROE, profit margin, revenue growth are "higher is better";
# debt/equity is "lower is better".
QUALITY_ROE_GOOD = 0.20
QUALITY_ROE_BAD = 0.05
QUALITY_PROFIT_MARGIN_GOOD = 0.20
QUALITY_PROFIT_MARGIN_BAD = 0.0
QUALITY_REVENUE_GROWTH_GOOD = 0.20
QUALITY_REVENUE_GROWTH_BAD = 0.0
# debt_to_equity is stored on yfinance's percent-points scale (e.g. 36.65).
QUALITY_DEBT_TO_EQUITY_GOOD = 50.0
QUALITY_DEBT_TO_EQUITY_BAD = 150.0

# FUNDAMENTALS_SCORING_SCOPE.md §5.3: below this many present metrics, the
# whole score stays unavailable rather than being computed from too thin a
# sample to be a signal the BUY/REDUCE gates should act on.
VALUATION_MIN_METRICS_REQUIRED = 2
QUALITY_MIN_METRICS_REQUIRED = 2


def _linear_score(value: float, good: float, bad: float) -> float:
    """Clamped linear interpolation where `good` maps to 1.0 and `bad` maps to
    0.0. Pass good < bad for "lower is better" metrics, good > bad for
    "higher is better" ones — the formula is polarity-agnostic."""
    if good == bad:
        return 1.0
    frac = (value - bad) / (good - bad)
    return max(0.0, min(1.0, frac))


def compute_quality_valuation_scores(
    asset_class: Optional[str],
    fundamentals: Optional[AssetFundamentals],
) -> tuple[Optional[float], Optional[float], list[str]]:
    """Real quality_score/valuation_score for equities from AssetFundamentals,
    per FUNDAMENTALS_SCORING_SCOPE.md §5. Renormalizes the weighted average
    over whichever metrics are present (never fabricates a value for a
    missing one) and requires a minimum metric count before computing a
    partial score at all. Non-equity assets, or equities with no fundamentals
    row yet, get (None, None) — unavailable, not a fabricated neutral value.
    """
    unavailable_inputs: list[str] = []

    if asset_class != _SCORABLE_ASSET_CLASS or fundamentals is None:
        unavailable_inputs.extend(["quality_score", "valuation_score"])
        return None, None, unavailable_inputs

    valuation_terms: list[tuple[float, float]] = []
    if fundamentals.trailing_pe is not None:
        valuation_terms.append((1.0, _linear_score(
            float(fundamentals.trailing_pe), VALUATION_TRAILING_PE_GOOD, VALUATION_TRAILING_PE_BAD
        )))
    else:
        unavailable_inputs.append("trailing_pe")
    if fundamentals.price_to_book is not None:
        valuation_terms.append((1.0, _linear_score(
            float(fundamentals.price_to_book), VALUATION_PRICE_TO_BOOK_GOOD, VALUATION_PRICE_TO_BOOK_BAD
        )))
    else:
        unavailable_inputs.append("price_to_book")
    if fundamentals.dividend_yield is not None:
        valuation_terms.append((1.0, _linear_score(
            float(fundamentals.dividend_yield), VALUATION_DIVIDEND_YIELD_GOOD, VALUATION_DIVIDEND_YIELD_BAD
        )))
    else:
        unavailable_inputs.append("dividend_yield")

    if len(valuation_terms) >= VALUATION_MIN_METRICS_REQUIRED:
        total_weight = sum(w for w, _ in valuation_terms)
        valuation_score = sum(w * v for w, v in valuation_terms) / total_weight
    else:
        valuation_score = None
        unavailable_inputs.append("valuation_score")

    quality_terms: list[tuple[float, float]] = []
    if fundamentals.roe is not None:
        quality_terms.append((1.0, _linear_score(
            float(fundamentals.roe), QUALITY_ROE_GOOD, QUALITY_ROE_BAD
        )))
    else:
        unavailable_inputs.append("roe")
    if fundamentals.profit_margin is not None:
        quality_terms.append((1.0, _linear_score(
            float(fundamentals.profit_margin), QUALITY_PROFIT_MARGIN_GOOD, QUALITY_PROFIT_MARGIN_BAD
        )))
    else:
        unavailable_inputs.append("profit_margin")
    if fundamentals.revenue_growth is not None:
        quality_terms.append((1.0, _linear_score(
            float(fundamentals.revenue_growth), QUALITY_REVENUE_GROWTH_GOOD, QUALITY_REVENUE_GROWTH_BAD
        )))
    else:
        unavailable_inputs.append("revenue_growth")
    if fundamentals.debt_to_equity is not None:
        quality_terms.append((1.0, _linear_score(
            float(fundamentals.debt_to_equity), QUALITY_DEBT_TO_EQUITY_GOOD, QUALITY_DEBT_TO_EQUITY_BAD
        )))
    else:
        unavailable_inputs.append("debt_to_equity")

    if len(quality_terms) >= QUALITY_MIN_METRICS_REQUIRED:
        total_weight = sum(w for w, _ in quality_terms)
        quality_score = sum(w * v for w, v in quality_terms) / total_weight
    else:
        quality_score = None
        unavailable_inputs.append("quality_score")

    return quality_score, valuation_score, unavailable_inputs
