import uuid
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.redis import cache_asset_health, get_cached_asset_signals
from app.domain.entities.market import AssetHealth, AssetSnapshot, LatestQuote
from app.infrastructure.repositories.asset_health import AssetHealthRepository
from app.workers.monitoring.slas import evaluate_asset_health


def compute_asset_health(asset_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        quote = session.query(LatestQuote).filter(LatestQuote.asset_id == asset_id).first()
        now = datetime.now(timezone.utc)
        
        quote_age = None
        last_success = None
        if quote:
            updated_at = quote.updated_at
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            quote_age = int((now - updated_at).total_seconds())
            last_success = updated_at

        # Resolve signal age and news age
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

        # Fallback to database snapshot
        if signal_age is None or news_age is None:
            snapshot = session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()
            if snapshot:
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

        status = evaluate_asset_health(quote_age=quote_age, news_age=news_age, signal_age=signal_age)

        health = AssetHealth(
            asset_id=asset_id,
            provider_name="default",
            last_successful_ingestion=last_success,
            quote_age_seconds=quote_age,
            fundamentals_age_seconds=None,
            signal_age_seconds=signal_age,
            news_age_seconds=news_age,
            status=status,
            updated_at=now
        )
        
        repo = AssetHealthRepository(session)
        updated_health = repo.upsert(health)
        session.commit()

        cache_data = {
            "asset_id": str(updated_health.asset_id),
            "provider_name": updated_health.provider_name,
            "status": updated_health.status,
            "quote_age_seconds": updated_health.quote_age_seconds,
            "signal_age_seconds": updated_health.signal_age_seconds,
            "news_age_seconds": updated_health.news_age_seconds,
            "updated_at": updated_health.updated_at.isoformat() if updated_health.updated_at else None
        }
        cache_asset_health(str(asset_id), cache_data)
