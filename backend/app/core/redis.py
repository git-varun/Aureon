import json
from typing import Any

import redis

from app.core.config import settings
from app.core.logging import logger

import time

# Global Connection Pool
redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)


class LoggingRedisWrapper:
    """Wraps redis.Redis so every operation (GET/SET/DELETE/TTL/pipeline/...) logs
    just OK/FAIL + duration — one place, no per-method duplication."""

    def __init__(self, client: redis.Redis):
        self._client = client

    def __getattr__(self, name: str):
        attr = getattr(self._client, name)
        if not callable(attr):
            return attr

        def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = attr(*args, **kwargs)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                logger.error(f"Redis {name.upper()} - {exc}", component="Redis", status="FAIL", duration_ms=duration_ms)
                raise
            duration_ms = int((time.perf_counter() - start) * 1000)
            if name == "pipeline":
                result = LoggingPipelineWrapper(result)
            else:
                logger.debug(f"Redis {name.upper()}", component="Redis", status="OK", duration_ms=duration_ms)
            return result

        return wrapper


class LoggingPipelineWrapper:
    """Logs a Redis pipeline's execute() as one batch."""

    def __init__(self, pipeline: Any):
        self._pipeline = pipeline
        self._queued_count = 0

    def __getattr__(self, name: str):
        attr = getattr(self._pipeline, name)
        if name == "execute":
            def execute(*args: Any, **kwargs: Any) -> Any:
                start = time.perf_counter()
                try:
                    result = attr(*args, **kwargs)
                except Exception as exc:
                    duration_ms = int((time.perf_counter() - start) * 1000)
                    logger.error(
                        f"Redis PIPELINE ({self._queued_count} commands) - {exc}",
                        component="Redis", status="FAIL", duration_ms=duration_ms,
                    )
                    raise
                duration_ms = int((time.perf_counter() - start) * 1000)
                logger.debug(
                    f"Redis PIPELINE ({self._queued_count} commands)",
                    component="Redis", status="OK", duration_ms=duration_ms,
                )
                return result
            return execute
        if not callable(attr):
            return attr

        def wrapper(*args: Any, **kwargs: Any) -> Any:
            self._queued_count += 1
            result = attr(*args, **kwargs)
            return self if result is self._pipeline else result

        return wrapper


def get_redis_client() -> redis.Redis:
    raw_client = redis.Redis(connection_pool=redis_pool)
    return LoggingRedisWrapper(raw_client)  # type: ignore

def check_redis_health() -> bool:
    try:
        client = get_redis_client()
        return client.ping()
    except redis.RedisError as e:
        logger.warning(f"redis_health_check_failed: {str(e)}", exc_info=True)
        return False

def get_quote_cache_key(symbol: str) -> str:
    return f"market:quote:{symbol.upper().strip()}"

def cache_quote(symbol: str, quote_data: dict[str, Any]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_quote_cache_key(symbol), 60, json.dumps(quote_data, default=str))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_quote key={get_quote_cache_key(symbol)} error={str(e)}")

def get_cached_quote(symbol: str) -> dict[str, Any] | None:
    try:
        client = get_redis_client()
        data = client.get(get_quote_cache_key(symbol))
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_quote key={get_quote_cache_key(symbol)} error={str(e)}")
    return None

def get_fx_rates_key() -> str:
    return "fx:rates"

def cache_fx_rates(rates: dict[str, float]) -> None:
    try:
        client = get_redis_client()
        client.setex(get_fx_rates_key(), 3600, json.dumps(rates))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=cache_fx_rates key={get_fx_rates_key()} error={str(e)}")

def get_cached_fx_rates() -> dict[str, float] | None:
    try:
        client = get_redis_client()
        data = client.get(get_fx_rates_key())
        if data:
            result = json.loads(str(data))
            if isinstance(result, dict):
                return result
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=get_cached_fx_rates key={get_fx_rates_key()} error={str(e)}")
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
        # Defense-in-depth only: every known write path invalidates this key
        # explicitly (see PortfolioService._invalidate_portfolio_caches). The
        # TTL bounds worst-case staleness for a write path that misses that
        # call, matching the other derived-aggregate caches (intelligence:*,
        # evaluation:scores) rather than the raw quote tier (60s).
        client.setex(get_portfolio_snapshot_key(portfolio_id), 900, json.dumps(snapshot_data, default=str))
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


def get_job_lock_key(job_name: str) -> str:
    return f"job_lock:{job_name}"


def try_acquire_job_lock(job_name: str, token: str, ttl_seconds: int) -> bool:
    """Atomic claim for dispatch_job's concurrency guard (SET NX EX) — the TTL is
    the sole recovery path for a worker process that dies mid-task, so no
    RedisError swallowing here: an outage should surface, not silently let
    every dispatch through as if unlocked."""
    client = get_redis_client()
    return bool(client.set(get_job_lock_key(job_name), token, nx=True, ex=ttl_seconds))


def release_job_lock(job_name: str, token: str) -> None:
    """Compare-then-delete so a lock this caller no longer owns (already expired
    and re-claimed by a later dispatch) is never deleted out from under it."""
    client = get_redis_client()
    key = get_job_lock_key(job_name)
    if client.get(key) == token:
        client.delete(key)


RESET_LOCK_KEY = "reset:in_progress"


def is_reset_in_progress() -> bool:
    """Checked by _wrap_job_execution (app/workers/ingestion/tasks.py) at the top
    of every ingestion job — the guard against DATA_RESET_SCOPE.md §5.1's beat
    race (a broker-sync/briefing task writing rows mid-reset)."""
    try:
        client = get_redis_client()
        return bool(client.exists(RESET_LOCK_KEY))
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=is_reset_in_progress error={str(e)}")
        return False


def try_acquire_reset_lock(token: str, ttl_seconds: int) -> bool:
    """Same SET NX EX pattern as try_acquire_job_lock — no error swallowing, a
    Redis outage must surface rather than silently let a reset proceed unguarded."""
    client = get_redis_client()
    return bool(client.set(RESET_LOCK_KEY, token, nx=True, ex=ttl_seconds))


def release_reset_lock(token: str) -> None:
    """Compare-then-delete, same reasoning as release_job_lock."""
    client = get_redis_client()
    if client.get(RESET_LOCK_KEY) == token:
        client.delete(RESET_LOCK_KEY)


def get_provider_budget_key(provider_name: str, window_seconds: int) -> str:
    import time
    bucket = int(time.time() // window_seconds)
    return f"provider_budget:{provider_name}:{window_seconds}:{bucket}"


def try_consume_provider_budget(provider_name: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window call counter for rate-limit-constrained market data providers
    (twelvedata's 8 calls/minute, alphavantage's 25 calls/day — see their
    adapters' _check_budget). INCR+EXPIRE is a fixed window, not a sliding one —
    good enough for "stay under X calls per window", not exact-to-the-second.
    No error swallowing: a Redis outage should surface the same way
    try_acquire_job_lock's does, so the adapter treats it like any other
    provider-unavailable failure rather than silently letting every call
    through unmetered."""
    client = get_redis_client()
    key = get_provider_budget_key(provider_name, window_seconds)
    count = client.incr(key)
    if count == 1:
        client.expire(key, window_seconds)
    return count <= limit


def get_backup_receipt_key() -> str:
    return "backup:receipt"


def store_backup_receipt(receipt: str, ttl_seconds: int = 600) -> None:
    """Called by GET /portfolio/backup once the export succeeds. The export today
    covers every reset scope in one file (transactions, watchlists, AI history,
    recommendation history, custom themes — see DATA_RESET_SCOPE.md §5), so a
    single receipt authorizes any/all reset scopes; short TTL so a stale backup
    can't authorize clearing data that has since changed."""
    try:
        client = get_redis_client()
        client.set(get_backup_receipt_key(), receipt, ex=ttl_seconds)
    except redis.RedisError as e:
        logger.warning(f"redis_operation_failed operation=store_backup_receipt error={str(e)}")


def consume_backup_receipt(receipt: str) -> bool:
    """Single-use: GET-compare-then-DELETE so the same receipt can't authorize a
    second reset after data has moved on. Returns False (and does not delete) on
    a mismatch/expiry — caller should reject the reset request."""
    client = get_redis_client()
    key = get_backup_receipt_key()
    if client.get(key) == receipt:
        client.delete(key)
        return True
    return False

