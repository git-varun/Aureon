from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List

from app.core.config import settings
from app.core.exceptions import ConfigurationError, ProviderError
from app.core.logging import logger
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote


class FinnhubAdapter(MarketDataProvider):
    def __init__(self):
        self._api_key: str | None = settings.FINNHUB_API_KEY

    @property
    def provider_name(self) -> str:
        return "finnhub"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.NEWS, Capability.FUNDAMENTALS]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def _resolved_key(self) -> str | None:
        return self._api_key or settings.FINNHUB_API_KEY

    def get_quote(self, symbol: str) -> NormalizedQuote:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            raise ConfigurationError("Finnhub API key is not configured")

        try:
            res = http_client.get(
                "Finnhub", "https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            price = data.get("c")
            if price is None or price == 0:
                raise ProviderError(f"No price returned from Finnhub for symbol {symbol}")
            volume = data.get("v")

            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
                volume=Decimal(str(volume)) if volume else None
            )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Finnhub get_quote failed for {symbol}: {e}") from e

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            return []

        try:
            to_date = datetime.now().strftime("%Y-%m-%d")
            from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            res = http_client.get(
                "Finnhub", "https://finnhub.io/api/v1/company-news",
                params={"symbol": symbol, "from": from_date, "to": to_date, "token": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            results = []
            for item in data[:20]:
                title = item.get("headline")
                url = item.get("url")
                ts = item.get("datetime")
                if title and url:
                    pub = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc)
                    results.append(NormalizedNews(
                        provider=self.provider_name,
                        title=title,
                        url=url,
                        published_at=pub
                    ))
            return results
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Finnhub get_news failed for {symbol}: {e}") from e

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        """stock/profile2 — confirmed live on the free tier (unlike candle/
        historical OHLCV, which is paid-only, see get_price_history below).
        Only company-profile fields, no valuation ratios (P/E, ROE, etc.) —
        finnhubIndustry is the closest thing to a sector field this endpoint
        offers."""
        api_key = self._resolved_key()
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            raise ConfigurationError("Finnhub API key is not configured")
        try:
            res = http_client.get(
                "Finnhub", "https://finnhub.io/api/v1/stock/profile2",
                params={"symbol": symbol, "token": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            if not data:
                raise ProviderError(f"No fundamentals returned from Finnhub for symbol {symbol}")
            return {
                "market_cap": data.get("marketCapitalization"),
                "sector": data.get("finnhubIndustry"),
                "industry": data.get("finnhubIndustry"),
            }
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Finnhub get_fundamentals failed for {symbol}: {e}") from e

    # get_price_history is deliberately not implemented: stock/candle (the
    # only historical-OHLCV endpoint Finnhub offers) returned
    # {"error":"You don't have access to this resource."} live on this
    # free-tier key — it's paid-tier only, confirmed 2026-08-01, not assumed
    # from docs. The base MarketDataProvider.get_price_history's
    # NotImplementedError is the honest behavior here.

    def health_check(self) -> bool:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            return False
        try:
            res = http_client.get(
                "Finnhub", "https://finnhub.io/api/v1/quote",
                params={"symbol": "AAPL", "token": api_key},
                timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False


registry.register(FinnhubAdapter)
