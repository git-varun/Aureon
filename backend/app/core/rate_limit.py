"""Fixed-window Redis rate limiter for auth endpoints."""
import redis
from fastapi import HTTPException

from app.core.logging import logger
from app.core.redis import get_redis_client


def check_auth_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60) -> None:
    """Increment a fixed-window counter and raise HTTP 429 if over limit.

    key: unique string (e.g. 'rl:login:<ip>' or 'rl:register:<email>')
    Raises HTTPException(429) with Retry-After header when limit exceeded.
    """
    try:
        client = get_redis_client()
        count = client.incr(f"rl:{key}")
        if count == 1:
            # First request in this window — set the TTL
            client.expire(f"rl:{key}", window_seconds)
        if count > max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(window_seconds)},
            )
    except HTTPException:
        raise
    except redis.RedisError as e:
        # Redis unavailable — fail open (don't block the user)
        logger.warning(f"rate_limit_redis_error key={key} error={e}")
