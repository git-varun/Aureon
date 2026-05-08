"""Price provider factory — DB-driven enabled list, injected credentials."""

import logging
from typing import List

from sqlalchemy.orm import Session

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import PriceProvider

logger = logging.getLogger("assets.price_factory")

_ALL_PROVIDERS = {
    "binance_price": "app.modules.assets.providers.binance:BinanceProvider",
    "yfinance": "app.modules.assets.providers.yfinance:YahooFinanceProvider",
    "coingecko": "app.modules.assets.providers.coingecko:CoinGeckoProvider",
    "coinmarketcap": "app.modules.assets.providers.coinmarketcap:CoinMarketCapProvider",
    "mfapi": "app.modules.assets.providers.mfapi:MFAPIPriceProvider",
}


def _import_provider(dotted: str):
    module_path, class_name = dotted.rsplit(":", 1)
    import importlib
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def get_price_providers(session: Session) -> List[PriceProvider]:
    """Return instantiated price providers that are enabled in DB."""
    from app.modules.config.services import ConfigService

    config_svc = ConfigService(session)
    cred_manager = CredentialManager(session)

    enabled = [
        p["provider_name"]
        for p in config_svc.get_providers_by_type("price")
        if p["enabled"]
    ]

    providers: List[PriceProvider] = []
    for name in enabled:
        if name not in _ALL_PROVIDERS:
            logger.warning("get_price_providers: unknown provider '%s', skipping", name)
            continue
        try:
            cls = _import_provider(_ALL_PROVIDERS[name])
            providers.append(cls(cred_manager))
            logger.debug("get_price_providers: loaded '%s'", name)
        except Exception as exc:
            logger.error("get_price_providers: failed to init '%s': %s", name, exc)

    logger.info("get_price_providers: %d/%d providers ready: %s",
                len(providers), len(enabled), enabled)
    return providers
