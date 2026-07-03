from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.core.exceptions import ConfigurationError
from app.core.providers.capabilities import Capability
from app.core.providers.factory import ProviderFactory
from app.core.providers.interfaces import ProviderProtocol
from app.core.providers.registry import ProviderRegistry


class DummyProvider(ProviderProtocol):
    def __init__(self):
        self.authenticated_with: dict | None = None

    @property
    def provider_name(self) -> str:
        return "dummy"

    def health_check(self) -> bool:
        return True

    def capabilities(self) -> list[Capability]:
        return [Capability.PRICE]

    def authenticate(self, **credentials) -> None:
        self.authenticated_with = credentials


def _fake_config_service(cfg):
    svc = MagicMock()
    svc.get_provider.return_value = cfg
    svc.get_decrypted_key.side_effect = lambda name, key: f"secret-{key}"
    return svc


@pytest.fixture
def registry_with_dummy(monkeypatch):
    registry = ProviderRegistry()
    registry.register(DummyProvider)
    monkeypatch.setattr("app.core.providers.factory.registry", registry)
    return registry


def test_factory_returns_bare_instance_when_no_db_row(registry_with_dummy):
    cfg_svc = _fake_config_service(None)
    factory = ProviderFactory(cfg_svc)
    provider = factory.get("dummy")
    assert provider is not None
    assert provider.provider_name == "dummy"

def test_factory_raises_when_provider_not_registered(registry_with_dummy):
    cfg_svc = _fake_config_service(None)
    factory = ProviderFactory(cfg_svc)
    with pytest.raises(ConfigurationError):
        factory.get("not-registered")

def test_factory_returns_none_when_not_registered_and_not_required(registry_with_dummy):
    cfg_svc = _fake_config_service(None)
    factory = ProviderFactory(cfg_svc)
    assert factory.get("not-registered", required=False) is None

def test_factory_raises_when_disabled(registry_with_dummy):
    cfg = SimpleNamespace(enabled=False, status="ACTIVE", key_names="[]")
    cfg_svc = _fake_config_service(cfg)
    factory = ProviderFactory(cfg_svc)
    with pytest.raises(ConfigurationError):
        factory.get("dummy")

def test_factory_returns_none_when_disabled_and_not_required(registry_with_dummy):
    cfg = SimpleNamespace(enabled=False, status="ACTIVE", key_names="[]")
    cfg_svc = _fake_config_service(cfg)
    factory = ProviderFactory(cfg_svc)
    assert factory.get("dummy", required=False) is None

def test_factory_raises_when_status_planned(registry_with_dummy):
    cfg = SimpleNamespace(enabled=True, status="PLANNED", key_names="[]")
    cfg_svc = _fake_config_service(cfg)
    factory = ProviderFactory(cfg_svc)
    with pytest.raises(ConfigurationError):
        factory.get("dummy")

def test_factory_authenticates_with_decrypted_credentials(registry_with_dummy):
    cfg = SimpleNamespace(enabled=True, status="ACTIVE", key_names='["api_key"]')
    cfg_svc = _fake_config_service(cfg)
    factory = ProviderFactory(cfg_svc)
    provider = factory.get("dummy")
    assert provider.authenticated_with == {"api_key": "secret-api_key"}

def test_factory_fallback_chain_skips_unavailable(registry_with_dummy):
    cfg_svc = _fake_config_service(None)
    factory = ProviderFactory(cfg_svc)
    chain = factory.get_fallback_chain(["dummy", "not-registered"])
    assert [p.provider_name for p in chain] == ["dummy"]
