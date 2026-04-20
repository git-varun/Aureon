"""Finnhub news provider."""

import logging
from typing import List

import requests

from app.modules.news.providers.base import BaseNewsProvider
from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import NewsPayload

logger = logging.getLogger(__name__)


class FinnhubNewsProvider(BaseNewsProvider):
    """Fetch news from Finnhub API (real-time market news)."""

    @property
    def provider_name(self) -> str:
        return "finnhub"

    def __init__(self, cred_manager: CredentialManager):
        self.api_key = cred_manager.get_finnhub_key()
        self.base_url = "https://finnhub.io/api/v1"

    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        """
        Fetch news headlines for a symbol from Finnhub.
        Returns empty list on error or if API key not configured.
        """
        if not self.api_key:
            logger.debug("FinnhubNewsProvider: API key not configured, skipping")
            return []

        try:
            params = {"token": self.api_key, "symbol": symbol}
            response = requests.get(
                f"{self.base_url}/company-news",
                params=params,
                timeout=10,
            )
            response.raise_for_status()

            data = response.json()
            results = []

            for item in data[:20]:  # Limit to 20
                headline = item.get("headline")
                summary = item.get("summary", "")
                url = item.get("url")

                if not headline or not url:
                    continue

                results.append(
                    NewsPayload(
                        title=headline,
                        snippet=summary,
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
            logger.exception("FinnhubNewsProvider: unexpected error: %s", exc)
            return []