"""Bond valuation: yfinance NSE ticker → accrual fallback."""

import datetime
import logging
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.bond")


class BondValuationProvider(ValuationProvider):
    provider_name = "bond_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        """Try yfinance for NSE-listed bonds; fall back to accrual value."""
        nse_symbol = asset_metadata.get("nse_symbol")
        if nse_symbol:
            price = self._fetch_yfinance_price(nse_symbol)
            if price:
                return price

        return self._compute_accrual_value(asset_metadata)

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        return asset_metadata.get("coupon_rate")

    def _fetch_yfinance_price(self, nse_symbol: str) -> Optional[float]:
        try:
            import yfinance as yf
            ticker = yf.Ticker(f"{nse_symbol}.NS")
            hist = ticker.history(period="1d")
            if not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception as exc:
            logger.warning("BondValuationProvider: yfinance fetch failed for %s: %s", nse_symbol, exc)
        return None

    def _compute_accrual_value(self, metadata: dict) -> float:
        """face_value + accrued coupon since last payment date."""
        face_value = float(metadata.get("face_value", 1000.0))
        coupon_rate = float(metadata.get("coupon_rate", 0.0)) / 100.0
        frequency_str = metadata.get("coupon_frequency", "semi-annual")
        freq = {"annual": 1, "semi-annual": 2, "quarterly": 4}.get(frequency_str, 2)

        days_in_period = 365.25 / freq
        today = datetime.date.today()
        # Approximate days since last coupon: use today's day-of-year mod period
        days_since_coupon = today.timetuple().tm_yday % int(days_in_period)
        accrued = face_value * coupon_rate * (days_since_coupon / 365.25)
        return round(face_value + accrued, 4)
