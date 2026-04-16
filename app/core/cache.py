"""Redis cache singleton."""

import json
from typing import Any

try:
    import redis
except ImportError:
    redis = None  # type: ignore[assignment]

from app.core.config import settings


class CacheManager:
    """Redis cache wrapper."""

    def __init__(self):
        self.client: Any | None = None
        if settings.redis_url and redis is not None:
            try:
                self.client = redis.from_url(settings.redis_url, decode_responses=True)
                self.client.ping()
            except Exception:
                self.client = None

    def get(self, key: str, default=None):
        """Get value from cache."""
        if self.client is None:
            return default
        try:
            val = self.client.get(key)
            if val is None:
                return default
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return val
        except Exception:
            return default

    def set(self, key: str, value, ttl: int = 3600):
        """Set value in cache with TTL (seconds)."""
        if self.client is None:
            return
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            self.client.setex(key, ttl, value)
        except Exception:
            pass

    def delete(self, key: str):
        """Delete key from cache."""
        if self.client is None:
            return
        try:
            self.client.delete(key)
        except Exception:
            pass

    def clear_pattern(self, pattern: str):
        """Delete all keys matching pattern."""
        if self.client is None:
            return
        try:
            for key in self.client.scan_iter(match=pattern):
                self.client.delete(key)
        except Exception:
            pass


cache = CacheManager()


def get_cache() -> CacheManager:
    """Dependency: get cache manager."""
    return cache
