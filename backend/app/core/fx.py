"""FX-to-INR rates for normalizing cross-currency position values before
summing (e.g. generate_portfolio_snapshot). Fetches live rates from
open.er-api.com — the same source the frontend's per-holding display uses
(V4Context.jsx) — so a backend-aggregated net worth and a live-rate-recomputed
sum of displayed holdings agree, rather than diverging by however stale these
static rates have gotten. Falls back to these constants (mirrors the
frontend's FX_PER_INR fallback, frontend/src/pages/aureon/marketData.js) if
the live fetch fails or hasn't succeeded yet, same graceful-degradation the
frontend already does."""

from app.core.logging import logger
from app.core.logging.http import http_client
from app.core.redis import cache_fx_rates, get_cached_fx_rates

FX_TO_INR = {
    "INR": 1.0,
    "USD": 83.2,
    "EUR": 90.6,
    "GBP": 105.4,
    "AED": 22.65,
    "JPY": 1 / 1.78,
}


def _fetch_live_fx_rates() -> dict[str, float]:
    response = http_client.get("fx", "https://open.er-api.com/v6/latest/INR", timeout=5)
    data = response.json()
    live_rates = data.get("rates")
    if data.get("result") != "success" or not live_rates:
        raise ValueError("open.er-api.com returned no usable rates")
    return {ccy: 1.0 / live_rates[ccy] for ccy in FX_TO_INR if ccy in live_rates and ccy != "INR"} | {"INR": 1.0}


def _get_fx_rates() -> dict[str, float]:
    cached = get_cached_fx_rates()
    if cached:
        return cached
    try:
        rates = _fetch_live_fx_rates()
    except Exception as e:
        logger.warning(f"fx_live_rate_fetch_failed error={e}")
        return FX_TO_INR
    cache_fx_rates(rates)
    return rates


def to_inr(amount: float, currency: str) -> float:
    rates = _get_fx_rates()
    return amount * rates.get(currency, FX_TO_INR.get(currency, 1.0))
