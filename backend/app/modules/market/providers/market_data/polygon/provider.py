from datetime import datetime, timezone
from decimal import Decimal
from typing import List

from app.core.config import settings
from app.core.exceptions import ConfigurationError, ProviderError
from app.core.logging import logger
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote


class PolygonAdapter(MarketDataProvider):
    def __init__(self):
        self._api_key: str | None = settings.POLYGON_API_KEY

    @property
    def provider_name(self) -> str:
        return "polygon"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.OHLC, Capability.CORPORATE_ACTIONS]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def _resolved_key(self) -> str | None:
        return self._api_key or settings.POLYGON_API_KEY

    def get_quote(self, symbol: str) -> NormalizedQuote:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            raise ConfigurationError("Polygon API key is not configured")

        try:
            res = http_client.get(
                "Polygon", f"https://api.polygon.io/v2/last/trade/{symbol}",
                params={"apiKey": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            results = data.get("results")
            if not results or "p" not in results:
                raise ProviderError(f"No price returned from Polygon for symbol {symbol}")

            price = results["p"]
            volume = results.get("s")

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
            raise ProviderError(f"Polygon get_quote failed for {symbol}: {e}") from e

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            return []

        try:
            res = http_client.get(
                "Polygon", "https://api.polygon.io/v2/reference/news",
                params={"ticker": symbol, "limit": 20, "apiKey": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            results = []
            for item in data.get("results", []):
                title = item.get("title")
                url = item.get("article_url")
                pub_utc = item.get("published_utc")
                if title and url:
                    pub = datetime.fromisoformat(pub_utc.replace("Z", "+00:00")) if pub_utc else datetime.now(timezone.utc)
                    results.append(NormalizedNews(
                        provider=self.provider_name,
                        title=title,
                        url=url,
                        published_at=pub
                    ))
            return results
        except Exception as e:
            logger.warning(f"Polygon get_news failed for {symbol}: {e}")
            return []

    def health_check(self) -> bool:
        api_key = self._resolved_key()
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            return False
        try:
            res = http_client.get(
                "Polygon", "https://api.polygon.io/v2/last/trade/AAPL",
                params={"apiKey": api_key},
                timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False


registry.register(PolygonAdapter)
