"""NewsAPI news provider."""

import logging
from typing import List

import requests

from app.modules.news.providers.base import BaseNewsProvider
from app.shared.interfaces import NewsPayload
from app.core.config import settings

logger = logging.getLogger(__name__)


class NewsAPIProvider(BaseNewsProvider):
    """Fetch news from NewsAPI (general market news aggregation)."""

    @property
    def provider_name(self) -> str:
        return "newsapi"

    def __init__(self):
        self.api_key = settings.newsapi_api_key
        self.base_url = "https://newsapi.org/v2"

    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        """
        Fetch news headlines for a symbol from NewsAPI.
        Returns empty list on error or if API key not configured.
        """
        if not self.api_key:
            logger.debug("NewsAPIProvider: API key not configured, skipping")
            return []

        try:
            # Search for stock symbol in news
            params = {
                "q": f"{symbol} stock",
                "language": "en",
                "sortBy": "publishedAt",
                "apiKey": self.api_key,
            }
            response = requests.get(
                f"{self.base_url}/everything",
                params=params,
                timeout=10,
            )
            response.raise_for_status()

            data = response.json()
            results = []

            for article in data.get("articles", [])[:20]:  # Limit to 20
                title = article.get("title")
                description = article.get("description", "")
                url = article.get("url")

                if not title or not url:
                    continue

                results.append(
                    NewsPayload(
                        title=title,
                        snippet=description,
                        link=url,
                        provider=self.provider_name,
                    )
                )

            self._log_fetch(symbol, len(results))
            return results

        except requests.exceptions.RequestException as exc:
            self._log_fetch(symbol, 0, exc)
            return []
        except Exception as exc:
            logger.exception("NewsAPIProvider: unexpected error: %s", exc)
            return []
