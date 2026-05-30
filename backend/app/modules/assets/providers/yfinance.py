"""Yahoo Finance price provider."""
import logging

import yfinance as yf
from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import PricePayload, PriceProvider

logger = logging.getLogger("providers.yfinance")


class YahooFinanceProvider(PriceProvider):
    provider_name = "yfinance"

    def __init__(self, cred_manager: CredentialManager):
        pass  # uses yfinance library, no API key required

    def get_price(self, symbol: str, asset_type: str) -> PricePayload | None:
        try:
            ticker = yf.Ticker(symbol)
            fi = ticker.fast_info
            price = (
                getattr(fi, "last_price", None)
                or getattr(fi, "regular_market_price", None)
                or getattr(fi, "previous_close", None)
            )
            if price:
                currency = getattr(fi, "currency", "USD") or "USD"
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
