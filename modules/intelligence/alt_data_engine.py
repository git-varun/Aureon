import logging

import requests
import yfinance as yf


class AltDataEngine:
    """Fetches Alternative Data: Fear & Greed, Liquidity Drains (DXY), and Institutional Flow Proxies."""

    def __init__(self):
        self.logger = logging.getLogger("AltData")

    def get_crypto_fear_greed(self) -> dict:
        """Fetches the global Crypto Fear & Greed Index (0-100)."""
        try:
            res = requests.get("https://api.alternative.me/fng/?limit=1", timeout=5).json()
            data = res['data'][0]
            return {
                "value": int(data['value']),
                "classification": data['value_classification']
            }
        except Exception as e:
            self.logger.debug(f"Fear & Greed API failed: {e}")
            return {"value": 50, "classification": "Neutral"}

    def get_fii_liquidity_proxy(self) -> dict:
        """
        Uses the US Dollar Index (DXY) as a proxy for FII flows.
        Rising DXY = FIIs pulling money OUT of India (Risk-Off).
        Falling DXY = FIIs pushing money INTO India (Risk-On).
        """
        try:
            # DX-Y.NYB is the US Dollar Index ticker on Yahoo Finance
            dxy_ticker = yf.Ticker("DX-Y.NYB")
            current_dxy = dxy_ticker.fast_info['last_price']
            prev_close = dxy_ticker.fast_info['previous_close']

            trend = "RISING (Liquidity Drain from India)" if current_dxy > prev_close else "FALLING (Liquidity Flowing into India)"

            return {
                "dxy_value": round(current_dxy, 2),
                "fii_trend": trend
            }
        except Exception as e:
            self.logger.debug(f"DXY fetch failed: {e}")
            return {"dxy_value": 104.00, "fii_trend": "UNKNOWN"}

    def fetch_all_alt_data(self) -> dict:
        """Bundles all alt-data for the AI Prompt and the Web UI."""
        return {
            "fear_and_greed": self.get_crypto_fear_greed(),
            "fii_proxy": self.get_fii_liquidity_proxy()
        }
