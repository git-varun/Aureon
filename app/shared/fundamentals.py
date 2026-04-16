"""Fundamentals data fetching using yfinance."""

import logging
import math
from typing import Optional, Dict, Any

logger = logging.getLogger("fundamentals")


class FundamentalsEngine:
    """Fetch fundamental financial data for a given yfinance symbol.

    Stateless — no DB or cache dependencies. Never raises; missing values
    are represented as None.
    """

    def fetch_fundamentals(self, yf_symbol: str) -> Dict[str, Any]:
        """Fetch fundamental indicators from yfinance.

        Args:
            yf_symbol: Symbol in yfinance format (e.g. "RELIANCE.NS", "BTC-USD").

        Returns:
            dict with keys:
              pe_ratio       Optional[float]  — trailingPE
              eps            Optional[float]  — trailingEps
              market_cap     Optional[float]  — marketCap
              high_52w       Optional[float]  — fiftyTwoWeekHigh
              low_52w        Optional[float]  — fiftyTwoWeekLow
              dividend_yield Optional[float]  — dividendYield
              graham_number  Optional[float]  — sqrt(22.5 * eps * book_value)
        """
        result: Dict[str, Any] = {
            "pe_ratio":       None,
            "eps":            None,
            "market_cap":     None,
            "high_52w":       None,
            "low_52w":        None,
            "dividend_yield": None,
            "graham_number":  None,
        }

        try:
            import yfinance as yf
            info: Dict[str, Any] = yf.Ticker(yf_symbol).info or {}
        except Exception as exc:
            logger.warning(f"FundamentalsEngine: yfinance fetch failed for {yf_symbol}: {exc}")
            return result

        def _safe(key: str) -> Optional[float]:
            val = info.get(key)
            try:
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        result["pe_ratio"]       = _safe("trailingPE")
        result["eps"]            = _safe("trailingEps")
        result["market_cap"]     = _safe("marketCap")
        result["high_52w"]       = _safe("fiftyTwoWeekHigh")
        result["low_52w"]        = _safe("fiftyTwoWeekLow")
        result["dividend_yield"] = _safe("dividendYield")

        # Graham number = sqrt(22.5 * EPS * book_value_per_share)
        eps        = result["eps"]
        book_value = _safe("bookValue")
        if eps is not None and book_value is not None and eps > 0 and book_value > 0:
            try:
                result["graham_number"] = math.sqrt(22.5 * eps * book_value)
            except Exception as exc:
                logger.warning(f"FundamentalsEngine: Graham number computation failed: {exc}")

        return result
