"""Alpha Vantage news provider."""

import logging
from typing import List

import requests

from app.modules.news.providers.base import BaseNewsProvider
from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import NewsPayload

logger = logging.getLogger(__name__)


class AlphaVantageNewsProvider(BaseNewsProvider):
    """Fetch company news from Alpha Vantage API."""

    @property
    def provider_name(self) -> str:
        return "alphavantage"

    def __init__(self, cred_manager=None):
        cred_manager = cred_manager or CredentialManager()
        self.api_key = cred_manager.get_alphavantage_key()
        self.base_url = "https://www.alphavantage.co/query"

    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        """
        Fetch news headlines for a symbol from Alpha Vantage.
        Returns empty list on error or if API key not configured.
        """
        if not self.api_key:
            logger.debug("AlphaVantageNewsProvider: API key not configured, skipping")
            return []

        try:
            params = {
                "function": "NEWS_SENTIMENT",
                "tickers": symbol,
                "apikey": self.api_key,
                "limit": 20,
            }
            response = requests.get(
                self.base_url,
                params=params,
                timeout=10,
            )
            response.raise_for_status()

            data = response.json()
            results = []

            for item in data.get("feed", [])[:20]:  # Limit to 20
                title = item.get("title")
                summary = item.get("summary", "")
                url = item.get("url")

                if not title or not url:
                    continue

                results.append(
                    NewsPayload(
                        title=title,
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
            logger.exception("AlphaVantageNewsProvider: unexpected error: %s", exc)
            return []
