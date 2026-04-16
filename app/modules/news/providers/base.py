"""Base abstraction for news providers."""

import logging
from abc import ABC, abstractmethod
from typing import List

from app.shared.interfaces import NewsPayload

logger = logging.getLogger(__name__)


class BaseNewsProvider(ABC):
    """Abstract base class for all news providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the name of this provider (e.g., 'rss', 'finnhub', 'newsapi')."""
        pass

    @abstractmethod
    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        """
        Fetch news headlines for a given symbol.

        Args:
            symbol: Stock ticker symbol (e.g., 'AAPL', 'TCS')

        Returns:
            List of NewsPayload objects. Should return empty list on error,
            never raise exceptions.
        """
        pass

    def _log_fetch(self, symbol: str, count: int, error: Exception = None):
        """Helper to log fetch attempts."""
        if error:
            logger.warning(
                "Provider %s failed to fetch news for %s: %s",
                self.provider_name,
                symbol,
                error,
            )
        else:
            logger.debug(
                "Provider %s fetched %d headlines for %s",
                self.provider_name,
                count,
                symbol,
            )
