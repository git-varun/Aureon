import json
from typing import Any

import redis

from app.core.config import settings
from app.core.logger import logger

import time

# Global Connection Pool
redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)

class ObservabilityRedisWrapper:
    """Wrapper around redis.Redis to intercept and trace cache operations."""
    def __init__(self, client: redis.Redis):
        self._client = client

    def _get_prefix(self, key: str) -> str:
        parts = key.split(":")
        if len(parts) >= 2:
            return f"{parts[0]}:{parts[1]}"
        return parts[0] if parts else "unknown"

    def get(self, name):
        from app.core.observability.metrics import redis_operation_duration_seconds, cache_hits_total, cache_misses_total
        start = time.perf_counter()
        val = self._client.get(name)
        duration_ms = int((time.perf_counter() - start) * 1000)
        
        # Observe execution latency
        redis_operation_duration_seconds.observe(duration_ms / 1000.0, operation="GET")
        if duration_ms > 10:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Redis", duration_ms, details={"operation": "GET", "key": name})
            
        prefix = self._get_prefix(name)

        extra = {
            "category": "CACHE",
            "duration_ms": duration_ms,
            "key": name,
            "prefix": prefix
        }

        if val is not None:
            extra["event"] = "cache.hit"
            cache_hits_total.inc(cache_key_prefix=prefix)
            logger.debug(f"Redis Cache HIT: key={name} - Duration: {duration_ms}ms", extra=extra)
        else:
            extra["event"] = "cache.miss"
            cache_misses_total.inc(cache_key_prefix=prefix)
            logger.debug(f"Redis Cache MISS: key={name} - Duration: {duration_ms}ms", extra=extra)
        return val

    def set(self, name, value, ex=None, px=None, nx=False, xx=False, keepttl=False):
        from app.core.observability.metrics import redis_operation_duration_seconds
        start = time.perf_counter()
        res = self._client.set(name, value, ex=ex, px=px, nx=nx, xx=xx, keepttl=keepttl)
        duration_ms = int((time.perf_counter() - start) * 1000)
        
        redis_operation_duration_seconds.observe(duration_ms / 1000.0, operation="SET")
        if duration_ms > 10:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Redis", duration_ms, details={"operation": "SET", "key": name})
        
        logger.debug(
            f"Redis Cache SET: key={name} ex={ex} - Duration: {duration_ms}ms",
            extra={
                "category": "CACHE",
                "event": "cache.set",
                "duration_ms": duration_ms,
                "key": name,
                "ex": ex
            }
        )
        return res

    def setex(self, name, time_val, value):
        from app.core.observability.metrics import redis_operation_duration_seconds
        start = time.perf_counter()
        res = self._client.setex(name, time_val, value)
        duration_ms = int((time.perf_counter() - start) * 1000)
        
        redis_operation_duration_seconds.observe(duration_ms / 1000.0, operation="SETEX")
        if duration_ms > 10:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Redis", duration_ms, details={"operation": "SETEX", "key": name})
        
        logger.debug(
            f"Redis Cache SETEX: key={name} ttl={time_val} - Duration: {duration_ms}ms",
            extra={
                "category": "CACHE",
                "event": "cache.setex",
                "duration_ms": duration_ms,
                "key": name,
                "ttl": time_val
            }
        )
        return res

    def delete(self, *names):
        from app.core.observability.metrics import redis_operation_duration_seconds
        start = time.perf_counter()
        res = self._client.delete(*names)
        duration_ms = int((time.perf_counter() - start) * 1000)
        
        redis_operation_duration_seconds.observe(duration_ms / 1000.0, operation="DELETE")
        if duration_ms > 10:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Redis", duration_ms, details={"operation": "DELETE", "keys": list(names)})
        
        logger.debug(
            f"Redis Cache DELETE: keys={names} - Duration: {duration_ms}ms",
            extra={
                "category": "CACHE",
                "event": "cache.delete",
                "duration_ms": duration_ms,
                "keys": list(names)
            }
        )
        return res

    def ping(self):
        return self._client.ping()

    def __getattr__(self, item):
        return getattr(self._client, item)

def get_redis_client() -> redis.Redis:
    raw_client = redis.Redis(connection_pool=redis_pool)
    return ObservabilityRedisWrapper(raw_client)  # type: ignore

def check_redis_health() -> bool:
    try:
        client = get_redis_client()
        return client.ping()
    except redis.RedisError as e:
        logger.warning(f"redis_health_check_failed: {str(e)}", exc_info=True)
        return False

def get_quote_cache_key(asset_id: str) -> str:
    return f"market:quote:{asset_id}"

def cache_quote(asset_id: str, quote_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_quote_cache_key(asset_id), 60, json.dumps(quote_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_quote key={get_quote_cache_key(asset_id)} error={str(e)}")

def get_cached_quote(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_quote_cache_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_quote key={get_quote_cache_key(asset_id)} error={str(e)}")
    return None

def get_asset_snapshot_key(asset_id: str) -> str:
    return f"market:snapshot:{asset_id}"

def cache_asset_snapshot(asset_id: str, snapshot_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_asset_snapshot_key(asset_id), 300, json.dumps(snapshot_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_asset_snapshot key={get_asset_snapshot_key(asset_id)} error={str(e)}")

def get_cached_asset_snapshot(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_asset_snapshot_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_asset_snapshot key={get_asset_snapshot_key(asset_id)} error={str(e)}")
    return None

def get_portfolio_snapshot_key(portfolio_id: str) -> str:
    return f"portfolio:snapshot:{portfolio_id}"

def cache_portfolio_snapshot(portfolio_id: str, snapshot_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.set(get_portfolio_snapshot_key(portfolio_id), json.dumps(snapshot_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_portfolio_snapshot key={get_portfolio_snapshot_key(portfolio_id)} error={str(e)}")

def invalidate_portfolio_snapshot(portfolio_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_portfolio_snapshot_key(portfolio_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_portfolio_snapshot key={get_portfolio_snapshot_key(portfolio_id)} error={str(e)}")

def get_cached_portfolio_snapshot(portfolio_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_portfolio_snapshot_key(portfolio_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_portfolio_snapshot key={get_portfolio_snapshot_key(portfolio_id)} error={str(e)}")
    return None

def get_asset_features_key(asset_id: str) -> str:
    return f"market:features:{asset_id}"

def cache_asset_features(asset_id: str, features_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_asset_features_key(asset_id), 900, json.dumps(features_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_asset_features key={get_asset_features_key(asset_id)} error={str(e)}")

def get_cached_asset_features(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_asset_features_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_asset_features key={get_asset_features_key(asset_id)} error={str(e)}")
    return None

def get_asset_scores_key(asset_id: str) -> str:
    return f"evaluation:scores:{asset_id}"

def cache_asset_scores(asset_id: str, scores_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_asset_scores_key(asset_id), 900, json.dumps(scores_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_asset_scores key={get_asset_scores_key(asset_id)} error={str(e)}")

def get_cached_asset_scores(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_asset_scores_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_asset_scores key={get_asset_scores_key(asset_id)} error={str(e)}")
    return None

def get_asset_health_key(asset_id: str) -> str:
    return f"monitoring:asset-health:{asset_id}"

def cache_asset_health(asset_id: str, health_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_asset_health_key(asset_id), 300, json.dumps(health_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_asset_health key={get_asset_health_key(asset_id)} error={str(e)}")

def get_cached_asset_health(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_asset_health_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_asset_health key={get_asset_health_key(asset_id)} error={str(e)}")
    return None

def get_provider_health_key() -> str:
    return "monitoring:provider-health"

def cache_provider_health(health_data: list[dict[str, Any]]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_provider_health_key(), 60, json.dumps(health_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_provider_health key={get_provider_health_key()} error={str(e)}")

def get_cached_provider_health() -> list[dict[str, Any]] | None:
    try:
        client = get_redis_client()
        data = client.get(get_provider_health_key())
        if data:
            result = json.loads(str(data))
            if isinstance(result, list):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_provider_health key={get_provider_health_key()} error={str(e)}")
    return None

def get_asset_signals_key(asset_id: str) -> str:
    return f"market:signals:{asset_id}"

def cache_asset_signals(asset_id: str, signals_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_asset_signals_key(asset_id), 900, json.dumps(signals_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_asset_signals key={get_asset_signals_key(asset_id)} error={str(e)}")

def get_cached_asset_signals(asset_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_asset_signals_key(asset_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_asset_signals key={get_asset_signals_key(asset_id)} error={str(e)}")
    return None

def get_recommendation_key(recommendation_id: str) -> str:
    return f"recommendation:detail:{recommendation_id}"

def get_org_recommendations_key(org_id: str) -> str:
    return f"recommendation:org:{org_id}"

def cache_recommendation(recommendation_id: str, rec_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.set(get_recommendation_key(recommendation_id), json.dumps(rec_data, default=str), ex=900)
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_recommendation key={get_recommendation_key(recommendation_id)} error={str(e)}")

def get_cached_recommendation(recommendation_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_recommendation_key(recommendation_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_recommendation key={get_recommendation_key(recommendation_id)} error={str(e)}")
    return None

def cache_org_recommendations(org_id: str, recs: list[dict[str, Any]]) -> None:
    try:
        client = get_redis_client()
        client.set(get_org_recommendations_key(org_id), json.dumps(recs, default=str), ex=900)
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_org_recommendations key={get_org_recommendations_key(org_id)} error={str(e)}")

def get_cached_org_recommendations(org_id: str) -> list[dict[str, Any]] | None:
    try:
        client = get_redis_client()
        data = client.get(get_org_recommendations_key(org_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, list):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_org_recommendations key={get_org_recommendations_key(org_id)} error={str(e)}")
    return None

def invalidate_org_recommendations(org_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_org_recommendations_key(org_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_org_recommendations key={get_org_recommendations_key(org_id)} error={str(e)}")


# --- Phase 10B Financial Intelligence Caching ---

def get_intelligence_dashboard_key(org_id: str) -> str:
    return f"intelligence:dashboard:{org_id}"

def get_intelligence_portfolio_key(portfolio_id: str) -> str:
    return f"intelligence:portfolio:{portfolio_id}"

def get_intelligence_health_key(portfolio_id: str) -> str:
    return f"intelligence:health:{portfolio_id}"

def get_intelligence_recommendations_key(portfolio_id: str) -> str:
    return f"intelligence:recommendations:{portfolio_id}"

def get_intelligence_outcomes_key(portfolio_id: str) -> str:
    return f"intelligence:outcomes:{portfolio_id}"

def cache_intelligence_dashboard(org_id: str, data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_intelligence_dashboard_key(org_id), 900, json.dumps(data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_intelligence_dashboard key={get_intelligence_dashboard_key(org_id)} error={str(e)}")

def get_cached_intelligence_dashboard(org_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_intelligence_dashboard_key(org_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_intelligence_dashboard key={get_intelligence_dashboard_key(org_id)} error={str(e)}")
    return None

def invalidate_intelligence_dashboard(org_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_intelligence_dashboard_key(org_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_intelligence_dashboard key={get_intelligence_dashboard_key(org_id)} error={str(e)}")

def cache_intelligence_portfolio(portfolio_id: str, data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_intelligence_portfolio_key(portfolio_id), 900, json.dumps(data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_intelligence_portfolio key={get_intelligence_portfolio_key(portfolio_id)} error={str(e)}")

def get_cached_intelligence_portfolio(portfolio_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_intelligence_portfolio_key(portfolio_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_intelligence_portfolio key={get_intelligence_portfolio_key(portfolio_id)} error={str(e)}")
    return None

def invalidate_intelligence_portfolio(portfolio_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_intelligence_portfolio_key(portfolio_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_intelligence_portfolio key={get_intelligence_portfolio_key(portfolio_id)} error={str(e)}")

def cache_intelligence_health(portfolio_id: str, data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_intelligence_health_key(portfolio_id), 900, json.dumps(data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_intelligence_health key={get_intelligence_health_key(portfolio_id)} error={str(e)}")

def get_cached_intelligence_health(portfolio_id: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_intelligence_health_key(portfolio_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_intelligence_health key={get_intelligence_health_key(portfolio_id)} error={str(e)}")
    return None

def invalidate_intelligence_health(portfolio_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_intelligence_health_key(portfolio_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_intelligence_health key={get_intelligence_health_key(portfolio_id)} error={str(e)}")

def cache_intelligence_recommendations(portfolio_id: str, data: list[dict[str, Any]]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_intelligence_recommendations_key(portfolio_id), 900, json.dumps(data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_intelligence_recommendations key={get_intelligence_recommendations_key(portfolio_id)} error={str(e)}")

def get_cached_intelligence_recommendations(portfolio_id: str) -> list[dict[str, Any]] | None:
    try:
        client = get_redis_client()
        data = client.get(get_intelligence_recommendations_key(portfolio_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, list):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_intelligence_recommendations key={get_intelligence_recommendations_key(portfolio_id)} error={str(e)}")
    return None

def invalidate_intelligence_recommendations(portfolio_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_intelligence_recommendations_key(portfolio_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_intelligence_recommendations key={get_intelligence_recommendations_key(portfolio_id)} error={str(e)}")

def cache_intelligence_outcomes(portfolio_id: str, data: list[dict[str, Any]]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_intelligence_outcomes_key(portfolio_id), 900, json.dumps(data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_intelligence_outcomes key={get_intelligence_outcomes_key(portfolio_id)} error={str(e)}")

def get_cached_intelligence_outcomes(portfolio_id: str) -> list[dict[str, Any]] | None:
    try:
        client = get_redis_client()
        data = client.get(get_intelligence_outcomes_key(portfolio_id))
        if data:
            result = json.loads(str(data))
            if isinstance(result, list):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_intelligence_outcomes key={get_intelligence_outcomes_key(portfolio_id)} error={str(e)}")
    return None

def invalidate_intelligence_outcomes(portfolio_id: str) -> None:
    try:
        client = get_redis_client()
        client.delete(get_intelligence_outcomes_key(portfolio_id))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=invalidate_intelligence_outcomes key={get_intelligence_outcomes_key(portfolio_id)} error={str(e)}")



