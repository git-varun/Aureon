"""Retry, cooldown, and circuit-breaker primitives shared by every provider.

Generalized from the ad hoc RateLimitTracker that used to live only in
app/domain/services/ai.py — the same Redis-backed cooldown pattern now
applies to any provider (market data, broker, AI, ...).
"""
import functools
import logging
import time
from typing import Callable, TypeVar

from app.core.exceptions import ProviderError, RateLimitError

logger = logging.getLogger("providers.retry")

T = TypeVar("T")


def with_retry(max_attempts: int = 3, backoff_base: float = 0.5, backoff_cap: float = 8.0):
    """Exponential backoff decorator. Retries on RateLimitError or any ProviderError
    marked retryable=True. Re-raises the last exception once attempts are exhausted."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except ProviderError as e:
                    if not e.retryable or attempt == max_attempts:
                        raise
                    last_exc = e
                    delay = min(backoff_base * (2 ** (attempt - 1)), backoff_cap)
                    logger.warning(
                        f"{func.__qualname__} attempt {attempt}/{max_attempts} failed "
                        f"({type(e).__name__}: {e}); retrying in {delay:.1f}s"
                    )
                    time.sleep(delay)
            if last_exc:
                raise last_exc
            raise RuntimeError("unreachable")  # pragma: no cover

        return wrapper

    return decorator


class CircuitBreaker:
    """Per-key cooldown tracker. Redis-backed with an in-memory fallback so it works
    even if Redis is briefly unavailable. Used to mark a provider (or a specific
    provider+model pair) as temporarily unusable after a rate-limit/failure signal,
    and to check whether it's safe to try again."""

    def __init__(self, namespace: str = "provider"):
        self._namespace = namespace
        self._cooldowns: dict[str, float] = {}

    def _redis_key(self, key: str) -> str:
        return f"{self._namespace}:cooldown:{key}"

    def trip(self, key: str, seconds: float) -> None:
        logger.warning(f"Circuit breaker tripped for {key}: cooling down {seconds}s")
        try:
            from app.core.redis import get_redis_client
            get_redis_client().set(self._redis_key(key), "1", ex=int(seconds))
            return
        except Exception as e:
            logger.warning(f"Redis unavailable for circuit breaker ({e}); falling back to memory")
        self._cooldowns[key] = time.monotonic() + seconds

    def is_open(self, key: str) -> bool:
        """True if the circuit is open (i.e. calls to `key` should currently be skipped)."""
        try:
            from app.core.redis import get_redis_client
            if get_redis_client().get(self._redis_key(key)) is not None:
                return True
        except Exception as e:
            logger.warning(f"Redis unavailable for circuit breaker check ({e}); using memory")

        expiry = self._cooldowns.get(key)
        if expiry is None:
            return False
        if time.monotonic() >= expiry:
            del self._cooldowns[key]
            return False
        return True

    def filter_available(self, keys: list[str]) -> list[str]:
        return [k for k in keys if not self.is_open(k)]
