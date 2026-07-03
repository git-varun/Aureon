"""Resolves a live provider instance for a given name, applying DB-stored
config (enabled/status/credentials) on top of the registry's plain instance.

Services should always go through ProviderFactory rather than importing a
concrete provider class directly — that's what makes "add a provider" mean
"implement + register" instead of "implement + register + edit every caller".
"""
from typing import TYPE_CHECKING, Optional

from app.core.exceptions import ConfigurationError
from app.core.providers.interfaces import ProviderProtocol
from app.core.providers.lifecycle import ProviderStatus
from app.core.providers.registry import registry

if TYPE_CHECKING:
    # Deferred: app.domain.services.ai imports ProviderFactory at module scope, so an
    # eager import here creates a circular import whenever this module loads first
    # (e.g. `import app.core.providers.factory` as a process's first app import).
    from app.domain.services.config import ConfigService


class ProviderFactory:
    def __init__(self, config_service: "ConfigService"):
        self.config_service = config_service

    def get(self, provider_name: str, *, required: bool = True) -> Optional[ProviderProtocol]:
        provider = registry.get(provider_name)
        if provider is None:
            if required:
                raise ConfigurationError(f"No provider implementation registered for '{provider_name}'")
            return None

        cfg = self.config_service.get_provider(provider_name)
        if cfg is None:
            # No DB row (e.g. in a unit test without seeded config) — return the bare instance.
            return provider

        if not cfg.enabled or cfg.status in (ProviderStatus.PLANNED.value, ProviderStatus.DISABLED.value):
            if required:
                raise ConfigurationError(f"Provider '{provider_name}' is not enabled (status={cfg.status})")
            return None

        credentials = {
            key: self.config_service.get_decrypted_key(provider_name, key)
            for key in _key_names(cfg)
        }
        credentials = {k: v for k, v in credentials.items() if v}
        if credentials:
            provider.authenticate(**credentials)
        return provider

    def get_fallback_chain(self, provider_names: list[str]) -> list[ProviderProtocol]:
        """Resolve several providers in priority order, skipping any that are
        unavailable/misconfigured rather than raising."""
        chain = []
        for name in provider_names:
            try:
                p = self.get(name, required=False)
            except ConfigurationError:
                p = None
            if p is not None:
                chain.append(p)
        return chain


def _key_names(cfg) -> list[str]:
    import json
    try:
        return json.loads(cfg.key_names) if cfg.key_names else []
    except Exception:
        return []
