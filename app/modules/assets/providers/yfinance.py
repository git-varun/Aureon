"""Yahoo Finance price provider."""
import logging

import yfinance as yf

from app.shared.interfaces import PriceProvider, PricePayload

logger = logging.getLogger("providers.yfinance")


class YahooFinanceProvider(PriceProvider):
    provider_name = "yfinance"

    def get_price(self, symbol: str, asset_type: str) -> PricePayload | None:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            price = (
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("ask")
                or info.get("bid")
                or info.get("previousClose")
            )
            if price:
                currency = info.get("currency", "USD")
                norm_currency = "INR" if currency == "INR" else "USD"
                return PricePayload(
                    symbol=symbol,
                    price=float(price),
                    currency=norm_currency,
                    provider=self.provider_name,
                )
        except Exception as e:
            logger.debug("yfinance fetch failed for %s: %s", symbol, e)
        return None
