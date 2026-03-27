import logging

import yfinance as yf


class FundamentalsEngine:
    """Fetches P/E, 52-week metrics, and Market Cap for Functional Analysis."""

    def __init__(self):
        self.logger = logging.getLogger("Fundamentals")
        self._cache = {}

    def analyze_asset(self, symbol: str, asset_type: str) -> dict:
        if symbol in self._cache:
            return self._cache[symbol]

        metrics = {"pe_ratio": None, "52w_high": None, "52w_low": None, "fundamental_health": "UNKNOWN"}

        if asset_type not in ["stock", "crypto"] or symbol == "GOLD":
            return metrics

        try:
            info = yf.Ticker(symbol).fast_info

            # Distance from 52-week high/low
            metrics["52w_high"] = round(info.get("year_high", 0), 2)
            metrics["52w_low"] = round(info.get("year_low", 0), 2)

            # yfinance info dict for deeper metrics (like P/E) is sometimes slow, wrap in try/except
            try:
                deep_info = yf.Ticker(symbol).info
                pe = deep_info.get("trailingPE")
                metrics["pe_ratio"] = round(pe, 2) if pe else None

                # Basic Fundamental Health check (Stock specific)
                if asset_type == "stock" and metrics["pe_ratio"]:
                    if metrics["pe_ratio"] < 15:
                        metrics["fundamental_health"] = "UNDERVALUED"
                    elif metrics["pe_ratio"] > 40:
                        metrics["fundamental_health"] = "OVERVALUED"
                    else:
                        metrics["fundamental_health"] = "FAIR VALUE"
            except:
                pass

            self._cache[symbol] = metrics
            return metrics
        except Exception as e:
            self.logger.debug(f"Fundamentals failed for {symbol}: {e}")
            return metrics
