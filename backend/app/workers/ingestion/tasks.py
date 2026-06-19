import uuid
from datetime import datetime, timedelta, timezone

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import logger
from app.core.redis import cache_quote
from app.domain.entities.market import LatestQuote
from app.domain.entities.system import FailedIngestion, Provider, ProviderUsage
from app.infrastructure.providers.finnhub import FinnhubAdapter
from app.infrastructure.providers.polygon import PolygonAdapter
from app.infrastructure.providers.yahoo import YahooAdapter

adapters = {
    "finnhub": FinnhubAdapter(),
    "polygon": PolygonAdapter(),
    "yahoo": YahooAdapter(),
}

def _track_usage(db: Session, provider_id: uuid.UUID, endpoint: str) -> None:
    usage = ProviderUsage(
        provider_id=provider_id,
        endpoint=endpoint,
        request_count=1,
        recorded_at=datetime.now(timezone.utc)
    )
    db.add(usage)

def _get_or_create_provider(db: Session, provider_name: str) -> Provider:
    provider = db.scalar(select(Provider).filter_by(name=provider_name))
    if not provider:
        provider = Provider(name=provider_name)
        db.add(provider)
        db.commit()
        db.refresh(provider)
    return provider

@shared_task(name="app.workers.ingestion.tasks.ingest_quote")  # type: ignore
def ingest_quote(provider_name: str, symbol: str) -> bool:
    adapter = adapters.get(provider_name)
    if not adapter:
        raise ValueError(f"Unknown provider {provider_name}")

    db = SessionLocal()
    try:
        provider_record = _get_or_create_provider(db, provider_name)
        _track_usage(db, provider_record.id, "get_quote")
        
        try:
            quote = adapter.get_quote(symbol)
            
            # Resolve asset_id via the assets registry table
            from app.domain.entities.market import Asset
            asset = db.scalar(select(Asset).filter_by(symbol=quote.symbol))
            if not asset:
                asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, quote.symbol)
                asset = Asset(
                    id=asset_id,
                    symbol=quote.symbol,
                    name=quote.symbol,
                    asset_class="equity"
                )
                db.add(asset)
                db.flush()
            else:
                asset_id = asset.id
            
            assert db.bind is not None
            if db.bind.dialect.name == 'sqlite':
                existing = db.scalar(select(LatestQuote).filter_by(symbol=quote.symbol))
                if existing:
                    existing.price = float(quote.price)
                    existing.volume = float(quote.volume) if quote.volume else None
                    existing.asset_id = asset_id
                    existing.updated_at = datetime.now(timezone.utc)
                else:
                    db.add(LatestQuote(
                        symbol=quote.symbol,
                        asset_id=asset_id,
                        price=float(quote.price),
                        volume=float(quote.volume) if quote.volume else None
                    ))
            else:
                stmt = insert(LatestQuote).values(
                    symbol=quote.symbol,
                    asset_id=asset_id,
                    price=quote.price,
                    volume=quote.volume,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                update_stmt = stmt.on_conflict_do_update(
                    index_elements=['symbol'],
                    set_={
                        'price': stmt.excluded.price,
                        'volume': stmt.excluded.volume,
                        'updated_at': stmt.excluded.updated_at
                    }
                )
                db.execute(update_stmt)
            
            # Log quote to price history
            from app.domain.entities.market import PriceHistory
            price_hist = PriceHistory(
                id=uuid.uuid4(),
                asset_id=asset_id,
                symbol=quote.symbol,
                price=float(quote.price),
                volume=float(quote.volume) if quote.volume else None,
                timestamp=datetime.now(timezone.utc)
            )
            db.add(price_hist)
                
            provider_record.last_success_at = datetime.now(timezone.utc)
            provider_record.health_status = "healthy"
            db.commit()

            cache_quote(quote.symbol, quote.model_dump())
            
            # Trigger downstream snapshot compilation
            from app.domain.events import quote_saved
            quote_saved(asset_id)
            
            return True

        except Exception as e:
            failure = FailedIngestion(
                provider=provider_name,
                payload={"symbol": symbol},
                error=str(e)
            )
            db.add(failure)
            provider_record.health_status = "degraded"
            db.commit()
            return False
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.ingest_all_quotes")
def ingest_all_quotes() -> None:
    db = SessionLocal()
    try:
        symbols = [r[0] for r in db.query(LatestQuote.symbol).distinct().all()]
        for symbol in symbols:
            ingest_quote.delay("yahoo", symbol)
    finally:
        db.close()


def _wrap_job_execution(job_name: str, log_id: int | None, fn, *args, **kwargs) -> None:
    db = SessionLocal()
    try:
        from app.domain.entities.config import JobStatus
        from app.domain.services.config import ConfigService
        from app.infrastructure.repositories.config import ConfigRepository
        
        cfg_repo = ConfigRepository(db)
        cfg_svc = ConfigService(cfg_repo)
        
        if log_id is None:
            log = cfg_svc.log_job_start(job_name)
            log_id = log.id
            
        logger.info(f"Starting background job: {job_name} (log_id: {log_id})")
        try:
            fn(*args, **kwargs)
            cfg_svc.log_job_end(log_id, JobStatus.SUCCESS)
            logger.info(f"Background job completed successfully: {job_name} (log_id: {log_id})")
        except Exception as e:
            cfg_svc.log_job_end(log_id, JobStatus.FAILED, error=str(e))
            logger.exception(f"Background job failed: {job_name} (log_id: {log_id}) - Error: {e}")
            raise e
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.sync_portfolio_task")
def sync_portfolio_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("sync_portfolio", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.refresh_prices_task")
def refresh_prices_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("refresh_prices", log_id, ingest_all_quotes)


@shared_task(name="app.workers.ingestion.tasks.fetch_news_task")
def fetch_news_task(log_id: int | None = None, **kwargs) -> None:
    def _run_fetch():
        db = SessionLocal()
        try:
            from app.domain.services.news import NewsService
            from app.infrastructure.repositories.news import NewsRepository
            
            symbols_query = db.query(LatestQuote.symbol).limit(10).all()
            symbols = [s[0] for s in symbols_query]
            if not symbols:
                symbols = ["AAPL", "TSLA", "RELIANCE.NS"]
            
            news_repo = NewsRepository(db)
            news_svc = NewsService(news_repo)
            for sym in symbols:
                news_svc.fetch_and_store(sym)
        finally:
            db.close()
    _wrap_job_execution("fetch_news", log_id, _run_fetch)


def _run_briefing(briefing_type: str):
    db = SessionLocal()
    try:
        from app.domain.entities.system import Organization
        from app.domain.services.ai import AIService
        orgs = db.query(Organization).all()
        ai_svc = AIService(db)
        for org in orgs:
            try:
                ai_svc.generate_briefing(org.id, briefing_type)
            except Exception as e:
                import logging
                logging.getLogger("celery.ai").error(f"Failed to generate {briefing_type} briefing for org {org.id}: {e}")
    finally:
        db.close()

@shared_task(name="app.workers.ingestion.tasks.daily_briefing_task")
def daily_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("daily_briefing", log_id, lambda: _run_briefing("global"))

@shared_task(name="app.workers.ingestion.tasks.weekly_briefing_task")
def weekly_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("weekly_briefing", log_id, lambda: _run_briefing("weekly"))

@shared_task(name="app.workers.ingestion.tasks.monthly_briefing_task")
def monthly_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("monthly_briefing", log_id, lambda: _run_briefing("monthly"))



@shared_task(name="app.workers.ingestion.tasks.run_signals_task")
def run_signals_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("run_signals", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.seed_price_history_task")
def seed_price_history_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("seed_price_history", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.aggregate_sentiment_task")
def aggregate_sentiment_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("aggregate_sentiment", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.seed_fundamentals_task")
def seed_fundamentals_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("seed_fundamentals", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.fetch_fx_rate_task")
def fetch_fx_rate_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("fetch_fx_rate", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.compute_state_task")
def compute_state_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("compute_state", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.accrue_epf_task")
def accrue_epf_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("accrue_epf", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.accrue_eps_task")
def accrue_eps_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("accrue_eps", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.bond_mtm_task")
def bond_mtm_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("bond_mtm", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.insurance_premium_task")
def insurance_premium_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("insurance_premium", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.compute_technicals_task")
def compute_technicals_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("compute_technicals", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.notify_daily_summary_task")
def notify_daily_summary_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("notify_daily_summary", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.clean_stale_signals_task")
def clean_stale_signals_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("clean_stale_signals", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.seed_market_universe_task")
def seed_market_universe_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("seed_market_universe", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.refresh_watchlist_prices_task")
def refresh_watchlist_prices_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("refresh_watchlist_prices", log_id, lambda: None)


@shared_task(name="app.workers.ingestion.tasks.recompute_features")
def recompute_features(asset_id: str) -> None:
    from app.workers.evaluation.features import generate_features
    uid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id
    generate_features(uid)


@shared_task(name="app.workers.ingestion.tasks.recompute_signals")
def recompute_signals(asset_id: str) -> None:
    from app.workers.evaluation.signals import generate_signals
    uid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id
    generate_signals(uid)


@shared_task(name="app.workers.ingestion.tasks.recompute_scores")
def recompute_scores(asset_id: str) -> None:
    from app.workers.evaluation.scoring import generate_scores
    uid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id
    generate_scores(uid)


@shared_task(name="app.workers.ingestion.tasks.admin_reprocess_all_assets")
def admin_reprocess_all_assets(log_id: int | None = None, **kwargs) -> None:
    def _run():
        db = SessionLocal()
        try:
            # Find all distinct asset_ids
            asset_ids = [r[0] for r in db.query(LatestQuote.asset_id).distinct().all() if r[0] is not None]
            for aid in asset_ids:
                recompute_features.delay(str(aid))
        finally:
            db.close()
    _wrap_job_execution("admin_reprocess_all", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.admin_backfill_assets")
def admin_backfill_assets(asset_ids: list[str]) -> None:
    for aid in asset_ids:
        recompute_features.delay(aid)


@shared_task(name="app.workers.ingestion.tasks.admin_repair_jobs")
def admin_repair_jobs(log_id: int | None = None, **kwargs) -> None:
    def _run():
        db = SessionLocal()
        try:
            from app.domain.entities.evaluation import AssetScore
            from app.domain.entities.market import AssetFeatures, AssetSnapshot
            snapshots = db.query(AssetSnapshot).all()
            for snap in snapshots:
                feat = db.query(AssetFeatures).filter(AssetFeatures.asset_id == snap.asset_id).first()
                score = db.query(AssetScore).filter(AssetScore.asset_id == snap.asset_id).first()
                if not feat or not score:
                    recompute_features.delay(str(snap.asset_id))
        finally:
            db.close()
    _wrap_job_execution("admin_repair", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.validate_data_quality_task")
def validate_data_quality_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        db = SessionLocal()
        try:
            errors = []
            from app.domain.entities.market import AssetSnapshot, LatestQuote
            from app.domain.entities.recommendation import Recommendation
            
            # 1. Audit orphan assets / snapshots
            quotes = db.query(LatestQuote).all()
            for q in quotes:
                if not q.asset_id:
                    errors.append(f"LatestQuote {q.symbol} has no asset_id associated.")
                else:
                    snap = db.query(AssetSnapshot).filter(AssetSnapshot.asset_id == q.asset_id).first()
                    if not snap:
                        errors.append(f"LatestQuote {q.symbol} has asset_id {q.asset_id} but no AssetSnapshot exists.")
            
            # 2. Check stale quotes (> 3 days old)
            stale_cutoff = datetime.now(timezone.utc) - timedelta(days=3)
            for q in quotes:
                if q.updated_at and q.updated_at.replace(tzinfo=timezone.utc) < stale_cutoff:
                    errors.append(f"LatestQuote {q.symbol} is stale. Last updated: {q.updated_at}")
                    
            # 3. Check recommendations with invalid asset_id
            recs = db.query(Recommendation).all()
            for r in recs:
                snap = db.query(AssetSnapshot).filter(AssetSnapshot.asset_id == r.asset_id).first()
                if not snap:
                    errors.append(f"Recommendation {r.id} references invalid/deleted asset_id {r.asset_id}.")
            
            if errors:
                logger.error(f"Data Quality Audit found {len(errors)} issues: {'; '.join(errors[:10])}")
            else:
                logger.info("Data Quality Validation completed successfully. No issues found.")
        finally:
            db.close()
            
    _wrap_job_execution("validate_data_quality", log_id, _run)


