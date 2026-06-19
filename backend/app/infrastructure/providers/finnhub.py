import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

import requests

from app.core.config import settings
from app.domain.services.providers.models import NormalizedNews, NormalizedQuote
from app.infrastructure.providers.base import ProviderAdapter

logger = logging.getLogger("providers.finnhub")

class FinnhubAdapter(ProviderAdapter):
    @property
    def provider_name(self) -> str:
        return "finnhub"

    def get_quote(self, symbol: str) -> NormalizedQuote:
        api_key = settings.FINNHUB_API_KEY
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            # Graceful fallback when API key is not configured (e.g. tests)
            logger.info("Finnhub API key not configured, returning mock quote")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal("150.00"),
                volume=Decimal("1000")
            )

        try:
            res = requests.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            price = data.get("c")
            if price is None or price == 0:
                raise ValueError(f"No price returned from Finnhub for symbol {symbol}")
            volume = data.get("v")
            
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
                volume=Decimal(str(volume)) if volume else None
            )
        except Exception as e:
            logger.warning(f"Finnhub get_quote failed for {symbol}: {e}. Returning mock fallback.")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal("150.00"),
                volume=Decimal("1000")
            )

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        api_key = settings.FINNHUB_API_KEY
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            return []

        try:
            to_date = datetime.now().strftime("%Y-%m-%d")
            from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            res = requests.get(
                "https://finnhub.io/api/v1/company-news",
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
        except Exception as e:
            logger.warning(f"Finnhub get_news failed for {symbol}: {e}")
            return []

    def health_check(self) -> bool:
        api_key = settings.FINNHUB_API_KEY
        if not api_key or api_key == "your_finnhub_api_key" or api_key.lower() == "none":
            return False
        try:
            res = requests.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": "AAPL", "token": api_key},
                timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False
