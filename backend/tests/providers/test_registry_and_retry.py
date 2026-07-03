import time

import pytest

from app.core.exceptions import ConfigurationError, ProviderError, RateLimitError
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import ProviderProtocol
from app.core.providers.registry import ProviderRegistry
from app.core.providers.retry import CircuitBreaker, with_retry


class FakeProvider(ProviderProtocol):
    def __init__(self, name: str = "fake", caps: list[Capability] | None = None):
        self._name = name
        self._caps = caps or [Capability.PRICE]

    @property
    def provider_name(self) -> str:
        return self._name

    def health_check(self) -> bool:
        return True

    def capabilities(self) -> list[Capability]:
        return self._caps


class OtherFakeProvider(FakeProvider):
    def __init__(self):
        super().__init__(name="other-fake", caps=[Capability.NEWS])


# ── ProviderRegistry ─────────────────────────────────────────────────────────

def test_registry_register_and_get():
    registry = ProviderRegistry()
    registry.register(FakeProvider)
    provider = registry.get("fake")
    assert provider is not None
    assert provider.provider_name == "fake"

def test_registry_get_unknown_returns_none():
    registry = ProviderRegistry()
    assert registry.get("does-not-exist") is None

def test_registry_unregister():
    registry = ProviderRegistry()
    registry.register(FakeProvider)
    assert registry.get("fake") is not None
    registry.unregister("fake")
    assert registry.get("fake") is None

def test_registry_list_filters_by_capability():
    registry = ProviderRegistry()
    registry.register(FakeProvider)
    registry.register(OtherFakeProvider)

    price_providers = registry.list(Capability.PRICE)
    assert [p.provider_name for p in price_providers] == ["fake"]

    news_providers = registry.list(Capability.NEWS)
    assert [p.provider_name for p in news_providers] == ["other-fake"]

    assert len(registry.list()) == 2

def test_registry_health_calls_provider_health_check():
    registry = ProviderRegistry()
    registry.register(FakeProvider)
    assert registry.health("fake") is True

def test_registry_health_unknown_provider_is_false():
    registry = ProviderRegistry()
    assert registry.health("nope") is False

def test_registry_re_register_replaces_instance():
    registry = ProviderRegistry()
    registry.register(FakeProvider)
    first = registry.get("fake")
    registry.register(FakeProvider)
    second = registry.get("fake")
    assert first is not second


# ── with_retry ────────────────────────────────────────────────────────────────

def test_with_retry_succeeds_first_try():
    calls = {"n": 0}

    @with_retry(max_attempts=3, backoff_base=0.01, backoff_cap=0.01)
    def flaky():
        calls["n"] += 1
        return "ok"

    assert flaky() == "ok"
    assert calls["n"] == 1

def test_with_retry_retries_on_retryable_error_then_succeeds():
    calls = {"n": 0}

    @with_retry(max_attempts=3, backoff_base=0.01, backoff_cap=0.01)
    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise RateLimitError("rate limited")
        return "recovered"

    assert flaky() == "recovered"
    assert calls["n"] == 2

def test_with_retry_exhausts_and_reraises():
    calls = {"n": 0}

    @with_retry(max_attempts=2, backoff_base=0.01, backoff_cap=0.01)
    def always_fails():
        calls["n"] += 1
        raise RateLimitError("still limited")

    with pytest.raises(RateLimitError):
        always_fails()
    assert calls["n"] == 2

def test_with_retry_does_not_retry_non_retryable_error():
    calls = {"n": 0}

    @with_retry(max_attempts=3, backoff_base=0.01, backoff_cap=0.01)
    def fails_hard():
        calls["n"] += 1
        raise ConfigurationError("bad config")

    with pytest.raises(ConfigurationError):
        fails_hard()
    assert calls["n"] == 1

def test_with_retry_does_not_catch_non_provider_errors():
    @with_retry(max_attempts=3, backoff_base=0.01, backoff_cap=0.01)
    def raises_value_error():
        raise ValueError("not a provider error")

    with pytest.raises(ValueError):
        raises_value_error()


# ── CircuitBreaker ────────────────────────────────────────────────────────────

def test_circuit_breaker_closed_by_default():
    breaker = CircuitBreaker(namespace=f"test-{time.time_ns()}")
    assert breaker.is_open("some-key") is False

def test_circuit_breaker_trip_opens_circuit():
    breaker = CircuitBreaker(namespace=f"test-{time.time_ns()}")
    breaker.trip("some-key", seconds=30)
    assert breaker.is_open("some-key") is True

def test_circuit_breaker_expires_after_cooldown(monkeypatch):
    # Force the in-memory fallback path so cooldown timing isn't at the mercy of
    # Redis's integer-only EX semantics (int(0.05) == 0, which Redis rejects).
    monkeypatch.setattr(
        "app.core.redis.get_redis_client",
        lambda: (_ for _ in ()).throw(RuntimeError("redis disabled for this test")),
    )
    breaker = CircuitBreaker(namespace=f"test-{time.time_ns()}")
    breaker.trip("some-key", seconds=0.05)
    assert breaker.is_open("some-key") is True
    time.sleep(0.1)
    assert breaker.is_open("some-key") is False

def test_circuit_breaker_filter_available():
    breaker = CircuitBreaker(namespace=f"test-{time.time_ns()}")
    breaker.trip("bad-key", seconds=30)
    result = breaker.filter_available(["good-key", "bad-key", "another-good-key"])
    assert result == ["good-key", "another-good-key"]

def test_circuit_breaker_keys_are_independent():
    breaker = CircuitBreaker(namespace=f"test-{time.time_ns()}")
    breaker.trip("key-a", seconds=30)
    assert breaker.is_open("key-a") is True
    assert breaker.is_open("key-b") is False
