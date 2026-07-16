import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.redis import get_cached_asset_signals
from app.modules.market.entities.market import AssetHealth
from app.core.services.base import BaseService
from app.modules.market.repositories.asset_fundamentals import AssetFundamentalsRepository
from app.modules.market.repositories.asset_health import AssetHealthRepository
from app.modules.market.repositories.market import MarketRepository


def _evaluate_quote_sla(quote_age_seconds: int | None) -> bool:
    return quote_age_seconds is not None and quote_age_seconds <= settings.SLA_QUOTE_MAX_AGE_SEC


def _evaluate_fundamentals_sla(fundamentals_age_seconds: int | None) -> bool:
    return fundamentals_age_seconds is not None and fundamentals_age_seconds <= settings.SLA_FUNDAMENTALS_MAX_AGE_SEC


def _evaluate_news_sla(news_age_seconds: int | None) -> bool:
    return news_age_seconds is not None and news_age_seconds <= settings.SLA_NEWS_MAX_AGE_SEC


def _evaluate_signal_sla(signal_age_seconds: int | None) -> bool:
    return signal_age_seconds is not None and signal_age_seconds <= settings.SLA_SIGNAL_MAX_AGE_SEC


def _dimension_status(age_seconds: int | None, healthy: bool) -> str:
    """Tri-state label for a single health dimension — 'unknown' (no data to
    evaluate) is distinct from 'healthy'/'unhealthy' (data was evaluated)."""
    if age_seconds is None:
        return "unknown"
    return "healthy" if healthy else "unhealthy"


def evaluate_health_status(quote_age: int | None, news_age: int | None, signal_age: int | None) -> str:
    # Allowed values: HEALTHY, STALE, DEGRADED, UNKNOWN
    if quote_age is None and news_age is None and signal_age is None:
        return "UNKNOWN"

    quote_healthy = _evaluate_quote_sla(quote_age)
    # Missing news/signal data doesn't count against overall health — it's
    # structurally absent for many assets (e.g. crypto has no news signal at
    # all) rather than evidence of a real problem, so it must not drag the
    # overall status down to STALE/DEGRADED. See _dimension_status for the
    # honest per-dimension label (exposed separately, not folded in here).
    news_healthy = _evaluate_news_sla(news_age) if news_age is not None else None
    signal_healthy = _evaluate_signal_sla(signal_age) if signal_age is not None else None

    if quote_healthy and news_healthy is not False and signal_healthy is not False:
        return "HEALTHY"

    if not quote_healthy:
        return "STALE" if (quote_age and quote_age <= settings.SLA_QUOTE_MAX_AGE_SEC * 3) else "DEGRADED"

    return "STALE"


class AssetHealthService(BaseService):
    def __init__(self, health_repo: AssetHealthRepository, market_repo: MarketRepository, fundamentals_repo: AssetFundamentalsRepository):
        self.health_repo = health_repo
        self.market_repo = market_repo
        self.fundamentals_repo = fundamentals_repo

    def compute(self, asset_id: uuid.UUID) -> dict[str, Any]:
        quote = self.market_repo.get_quote_by_asset_id(asset_id)
        now = datetime.now(timezone.utc)

        fundamentals_age = None
        fundamentals = self.fundamentals_repo.get(asset_id)
        if fundamentals and fundamentals.updated_at:
            fnd_updated_at = fundamentals.updated_at
            if fnd_updated_at.tzinfo is None:
                fnd_updated_at = fnd_updated_at.replace(tzinfo=timezone.utc)
            fundamentals_age = int((now - fnd_updated_at).total_seconds())

        quote_age = None
        last_success = None
        if quote:
            updated_at = quote.updated_at
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            quote_age = int((now - updated_at).total_seconds())
            last_success = updated_at

        signals = get_cached_asset_signals(str(asset_id))
        signal_age = None
        news_age = None

        if signals:
            sig_updated_at_str = signals.get("updated_at")
            if sig_updated_at_str:
                try:
                    sig_updated_at = datetime.fromisoformat(sig_updated_at_str)
                    if sig_updated_at.tzinfo is None:
                        sig_updated_at = sig_updated_at.replace(tzinfo=timezone.utc)
                    signal_age = int((now - sig_updated_at).total_seconds())
                except Exception:
                    pass

            news_ts = signals.get("news_timestamp")
            if news_ts:
                try:
                    news_time = datetime.fromtimestamp(news_ts, tz=timezone.utc)
                    news_age = int((now - news_time).total_seconds())
                except Exception:
                    pass

        if signal_age is None or news_age is None:
            snapshot = self.market_repo.get_snapshot(asset_id)
            if snapshot:
                # On a signals-cache miss, signal_age falls back to
                # AssetSnapshot.updated_at — a proxy, not a direct read of
                # when signals were actually (re)computed. It's a close
                # proxy in practice (process_asset_snapshot and
                # generate_signals run back-to-back in the same chain
                # execution, and as of the get_technical_indicators dedup
                # fix now share the same fetched indicators), but the field
                # name doesn't guarantee it's measuring signal freshness
                # specifically. See EVALUATION_MODULE_AUDIT.md 3.4.
                if signal_age is None and snapshot.updated_at:
                    snap_updated_at = snapshot.updated_at
                    if snap_updated_at.tzinfo is None:
                        snap_updated_at = snap_updated_at.replace(tzinfo=timezone.utc)
                    signal_age = int((now - snap_updated_at).total_seconds())

                if news_age is None and snapshot.payload:
                    news_ts = snapshot.payload.get("news_timestamp")
                    if news_ts:
                        try:
                            news_time = datetime.fromtimestamp(news_ts, tz=timezone.utc)
                            news_age = int((now - news_time).total_seconds())
                        except Exception:
                            pass

        status = evaluate_health_status(quote_age=quote_age, news_age=news_age, signal_age=signal_age)
        news_status = _dimension_status(news_age, _evaluate_news_sla(news_age) if news_age is not None else False)

        health = AssetHealth(
            asset_id=asset_id,
            provider_name="default",
            last_successful_ingestion=last_success,
            quote_age_seconds=quote_age,
            fundamentals_age_seconds=fundamentals_age,
            signal_age_seconds=signal_age,
            news_age_seconds=news_age,
            status=status,
            updated_at=now
        )
        updated_health = self.health_repo.upsert(health)
        self.health_repo.session.commit()

        return {
            "asset_id": str(updated_health.asset_id),
            "provider_name": updated_health.provider_name,
            "status": updated_health.status,
            "quote_age_seconds": updated_health.quote_age_seconds,
            "fundamentals_age_seconds": updated_health.fundamentals_age_seconds,
            "signal_age_seconds": updated_health.signal_age_seconds,
            "news_age_seconds": updated_health.news_age_seconds,
            "news_status": news_status,
            "updated_at": updated_health.updated_at.isoformat() if updated_health.updated_at else None
        }
