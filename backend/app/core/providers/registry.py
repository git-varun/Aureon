"""Provider registry — the single place providers are discovered from.

Providers self-register at import time (see the bottom of each
app/infrastructure/providers/<category>/<name>/provider.py file). Services
never instantiate a provider class directly; they ask the registry (usually
via ProviderFactory) for one by name or by capability.
"""
import importlib
import logging
import pkgutil
from typing import Optional, Type

from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import ProviderProtocol

logger = logging.getLogger("providers.registry")


class ProviderRegistry:
    def __init__(self):
        self._providers: dict[str, Type[ProviderProtocol]] = {}
        self._instances: dict[str, ProviderProtocol] = {}
        self._discovered = False

    def register(self, provider_cls: Type[ProviderProtocol]) -> None:
        instance = provider_cls()
        name = instance.provider_name
        if name in self._providers:
            logger.info(f"Re-registering provider '{name}' ({provider_cls.__name__})")
        self._providers[name] = provider_cls
        self._instances[name] = instance
        logger.info(f"Registered provider '{name}' ({provider_cls.__name__})")

    def unregister(self, name: str) -> None:
        self._providers.pop(name, None)
        instance = self._instances.pop(name, None)
        if instance is not None:
            try:
                instance.shutdown()
            except Exception as e:
                logger.warning(f"shutdown() failed for provider '{name}': {e}")

    def get(self, name: str) -> Optional[ProviderProtocol]:
        self.discover()
        return self._instances.get(name)

    def list(self, capability: Optional[Capability] = None) -> list[ProviderProtocol]:
        self.discover()
        providers = list(self._instances.values())
        if capability is not None:
            providers = [p for p in providers if capability in p.capabilities()]
        return providers

    def health(self, name: str) -> bool:
        provider = self.get(name)
        if provider is None:
            return False
        try:
            return provider.health_check()
        except Exception as e:
            logger.warning(f"health_check() raised for provider '{name}': {e}")
            return False

    def discover(self) -> None:
        """Import-scan app.infrastructure.providers so every provider.py module's
        self-registration call runs at least once. Idempotent — safe to call repeatedly."""
        if self._discovered:
            return
        self._discovered = True
        import app.infrastructure.providers as providers_pkg

        for finder, name, is_pkg in pkgutil.walk_packages(
            providers_pkg.__path__, prefix=f"{providers_pkg.__name__}."
        ):
            if name.endswith(".provider"):
                try:
                    importlib.import_module(name)
                except Exception as e:
                    logger.error(f"Failed to import provider module '{name}': {e}")


registry = ProviderRegistry()
