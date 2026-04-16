"""Fundamentals data provider."""
import yfinance as yf
from typing import Dict, Any


class FundamentalsProvider:
    provider_name = "yfinance_fundamentals"

    def get_fundamentals(self, symbol: str) -> Dict[str, Any]:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            return {
                "pe_ratio": info.get("trailingPE"),
                "eps": info.get("trailingEps"),
                "market_cap": info.get("marketCap"),
                "high_52w": info.get("fiftyTwoWeekHigh"),
                "low_52w": info.get("fiftyTwoWeekLow")
            }
        except Exception:
            return {}