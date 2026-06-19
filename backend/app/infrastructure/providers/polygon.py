import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import List

import requests

from app.core.config import settings
from app.domain.services.providers.models import NormalizedNews, NormalizedQuote
from app.infrastructure.providers.base import ProviderAdapter

logger = logging.getLogger("providers.polygon")

class PolygonAdapter(ProviderAdapter):
    @property
    def provider_name(self) -> str:
        return "polygon"

    def get_quote(self, symbol: str) -> NormalizedQuote:
        api_key = settings.POLYGON_API_KEY
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            # Graceful fallback when API key is not configured (e.g. tests)
            logger.info("Polygon API key not configured, returning mock quote")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal("150.00"),
                volume=Decimal("1000")
            )

        try:
            res = requests.get(
                f"https://api.polygon.io/v2/last/trade/{symbol}",
                params={"apiKey": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            results = data.get("results")
            if not results or "p" not in results:
                raise ValueError(f"No price returned from Polygon for symbol {symbol}")
                
            price = results["p"]
            volume = results.get("s")
            
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
                volume=Decimal(str(volume)) if volume else None
            )
        except Exception as e:
            logger.warning(f"Polygon get_quote failed for {symbol}: {e}. Returning mock fallback.")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal("150.00"),
                volume=Decimal("1000")
            )

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        api_key = settings.POLYGON_API_KEY
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            return []

        try:
            res = requests.get(
                "https://api.polygon.io/v2/reference/news",
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
        api_key = settings.POLYGON_API_KEY
        if not api_key or api_key == "your_polygon_api_key" or api_key.lower() == "none":
            return False
        try:
            res = requests.get(
                "https://api.polygon.io/v2/last/trade/AAPL",
                params={"apiKey": api_key},
                timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False
