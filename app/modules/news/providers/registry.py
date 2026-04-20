"""News provider registry — DB-driven enabled list, injected credentials."""

import logging
from typing import Dict, List

from sqlalchemy.orm import Session

from app.modules.news.providers.alphavantage import AlphaVantageNewsProvider
from app.modules.news.providers.base import BaseNewsProvider
from app.modules.news.providers.finnhub import FinnhubNewsProvider
from app.modules.news.providers.newsapi import NewsAPIProvider
from app.modules.news.providers.rss_provider import RSSNewsProvider
from app.modules.portfolio.providers.credential_manager import CredentialManager

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """Assembles enabled news providers from DB config with injected credentials."""

    _ALL_PROVIDERS: Dict[str, type] = {
        "rss": RSSNewsProvider,
        "finnhub": FinnhubNewsProvider,
        "newsapi": NewsAPIProvider,
        "alphavantage": AlphaVantageNewsProvider,
    }

    def __init__(self, session: Session):
        from app.modules.config.services import ConfigService

        config_svc = ConfigService(session)
        cred_manager = CredentialManager(session)

        enabled = [
            p["provider_name"]
            for p in config_svc.get_providers_by_type("news")
            if p["enabled"]
        ]

        self.providers: Dict[str, BaseNewsProvider] = {}
        for name in enabled:
            if name not in self._ALL_PROVIDERS:
                logger.warning("ProviderRegistry: unknown provider '%s', skipping", name)
                continue
            try:
                self.providers[name] = self._ALL_PROVIDERS[name](cred_manager)
                logger.debug("ProviderRegistry: loaded provider '%s'", name)
            except Exception as exc:
                logger.error("ProviderRegistry: failed to init provider '%s': %s", name, exc)

        logger.info("ProviderRegistry: %d/%d providers ready: %s",
                    len(self.providers), len(enabled), list(self.providers))

    def get_providers(self) -> List[BaseNewsProvider]:
        return list(self.providers.values())

    def get_provider(self, name: str) -> BaseNewsProvider | None:
        return self.providers.get(name)

    def list_enabled(self) -> List[str]:
        return list(self.providers.keys())


def get_registry(session: Session) -> ProviderRegistry:
    return ProviderRegistry(session)
