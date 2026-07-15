"""Static FX-to-INR rates for normalizing cross-currency position values before
summing (e.g. generate_portfolio_snapshot). Mirrors the frontend's FX_PER_INR
fallback constants (frontend/src/pages/aureon/marketData.js) — not live rates,
just enough to stop mixed-currency sums from adding raw INR + raw USD."""

FX_TO_INR = {
    "INR": 1.0,
    "USD": 83.2,
    "EUR": 90.6,
    "GBP": 105.4,
    "AED": 22.65,
    "JPY": 1 / 1.78,
}


def to_inr(amount: float, currency: str) -> float:
    return amount * FX_TO_INR.get(currency, 1.0)
