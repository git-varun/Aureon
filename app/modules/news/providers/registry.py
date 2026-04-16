"""Provider registry for managing news providers."""

import logging
from typing import Dict, List

from app.modules.news.providers.base import BaseNewsProvider
from app.modules.news.providers.rss_provider import RSSNewsProvider
from app.modules.news.providers.finnhub import FinnhubNewsProvider
from app.modules.news.providers.newsapi import NewsAPIProvider
from app.modules.news.providers.alphavantage import AlphaVantageNewsProvider

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """Registry to manage and load news providers."""

    # All available providers
    _ALL_PROVIDERS = {
        "rss": RSSNewsProvider,
        "finnhub": FinnhubNewsProvider,
        "newsapi": NewsAPIProvider,
        "alphavantage": AlphaVantageNewsProvider,
    }

    def __init__(self, enabled_providers: List[str] = None):
        """
        Initialize registry with optional list of enabled providers.

        Args:
            enabled_providers: List of provider names to enable (e.g., ['rss', 'finnhub']).
                             If None, all available providers are enabled.
        """
        self.enabled_providers = enabled_providers or list(self._ALL_PROVIDERS.keys())
        self.providers: Dict[str, BaseNewsProvider] = {}
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize and cache provider instances."""
        for name in self.enabled_providers:
            if name not in self._ALL_PROVIDERS:
                logger.warning("ProviderRegistry: unknown provider '%s', skipping", name)
                continue

            try:
                provider_class = self._ALL_PROVIDERS[name]
                provider = provider_class()
                self.providers[name] = provider
                logger.debug("ProviderRegistry: loaded provider '%s'", name)
            except Exception as exc:
                logger.error(
                    "ProviderRegistry: failed to initialize provider '%s': %s",
                    name,
                    exc,
                )

        logger.info(
            "ProviderRegistry: initialized with %d/%d providers",
            len(self.providers),
            len(self.enabled_providers),
        )

    def get_providers(self) -> List[BaseNewsProvider]:
        """Return list of initialized provider instances."""
        return list(self.providers.values())

    def get_provider(self, name: str) -> BaseNewsProvider | None:
        """Get a specific provider by name."""
        return self.providers.get(name)

    def is_enabled(self, name: str) -> bool:
        """Check if a provider is enabled and initialized."""
        return name in self.providers

    def list_enabled(self) -> List[str]:
        """List names of enabled providers."""
        return list(self.providers.keys())


# Default registry (used by NewsService)
_default_registry = ProviderRegistry(enabled_providers=["rss", "finnhub", "newsapi"])


def get_default_registry() -> ProviderRegistry:
    """Get the default provider registry."""
    return _default_registry
