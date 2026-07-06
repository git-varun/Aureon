from celery import shared_task

from app.core.database import SessionLocal
from app.core.logging import logger
from app.core.redis import cache_quote

# Provider names ingest_quote accepts — resolution itself always goes through
# ProviderFactory -> ProviderRegistry -> ProviderProtocol (see ingest_quote below);
# this set only preserves the original "unknown provider" validation surface.
_MARKET_DATA_PROVIDERS = {"finnhub", "polygon", "yahoo", "binance_price"}

@shared_task(name="app.workers.ingestion.tasks.ingest_quote")  # type: ignore
def ingest_quote(provider_name: str, symbol: str) -> bool:
    if provider_name not in _MARKET_DATA_PROVIDERS:
        raise ValueError(f"Unknown provider {provider_name}")

    from app.core.providers.factory import ProviderFactory
    from app.domain.services.config import ConfigService
    from app.domain.services.ingestion import QuoteIngestionService
    from app.infrastructure.repositories.config import ConfigRepository
    from app.infrastructure.repositories.ingestion import IngestionRepository

    db = SessionLocal()
    try:
        ingestion_svc = QuoteIngestionService(IngestionRepository(db))
        try:
            adapter = ProviderFactory(ConfigService(ConfigRepository(db))).get(provider_name)
            quote = adapter.get_quote(symbol)

            asset_id = ingestion_svc.save_quote(provider_name, quote)
            cache_quote(quote.symbol, quote.model_dump())

            # Trigger downstream: snapshot → features → signals → scores → health
            from app.workers.snapshots.asset_snapshot import process_asset_snapshot
            process_asset_snapshot.delay(str(asset_id))

            return True

        except Exception as e:
            db.rollback()
            ingestion_svc.record_failure(provider_name, symbol, str(e))
            return False
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.ingest_all_quotes")
def ingest_all_quotes() -> None:
    from app.infrastructure.repositories.ingestion import IngestionRepository

    db = SessionLocal()
    try:
        assets = IngestionRepository(db).list_symbols_for_quote_ingestion()
    finally:
        db.close()

    if not assets:
        logger.warning("ingest_all_quotes: market.assets is empty — run seed_market_universe_task first")
        return
    for symbol, asset_class in assets:
        provider_name = "binance_price" if asset_class == "crypto_futures" else "yahoo"
        ingest_quote.delay(provider_name, symbol)


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

        try:
            fn(*args, **kwargs)
            cfg_svc.log_job_end(log_id, JobStatus.SUCCESS)
        except Exception as e:
            cfg_svc.log_job_end(log_id, JobStatus.FAILED, error=str(e))
            logger.error(f"Job {job_name} failed (log_id={log_id}): {e}", exc_info=True)
            raise e
    finally:
        db.close()


def _list_portfolio_entries() -> list:
    """Loads portfolio ids in a short-lived read session so a later rollback
    elsewhere cannot expire these values."""
    from app.infrastructure.repositories.portfolios import PortfoliosRepository

    db = SessionLocal()
    try:
        return [pf.id for pf in PortfoliosRepository(db).list_all()]
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.sync_portfolio_task")
def sync_portfolio_task(log_id: int | None = None, **kwargs) -> None:
    def _run_sync():
        ingest_all_quotes()

        from app.domain.services.portfolio import PortfolioService
        from app.infrastructure.repositories import (
            PortfolioSnapshotRepository,
            PortfoliosRepository,
            PositionsRepository,
            TransactionsRepository,
        )

        for portfolio_id in _list_portfolio_entries():
            db = SessionLocal()
            try:
                svc = PortfolioService(
                    PortfoliosRepository(db),
                    TransactionsRepository(db),
                    PositionsRepository(db),
                    PortfolioSnapshotRepository(db),
                )
                svc.generate_portfolio_snapshot(portfolio_id)
                logger.info(f"sync_portfolio: snapshot updated for portfolio {portfolio_id}")
            except Exception as e:
                db.rollback()
                logger.warning(f"sync_portfolio: snapshot failed for portfolio {portfolio_id}: {e}")
            finally:
                db.close()

    _wrap_job_execution("sync_portfolio", log_id, _run_sync)


def _run_broker_sync(job_name: str, provider_name: str, sync_method_name: str) -> None:
    """Shared body for sync_<broker>_task: resolve the provider, fetch holdings,
    upsert them into every portfolio via PortfolioService.<sync_method_name>, then
    refresh quotes and snapshots. Used by sync_zerodha_task/sync_binance_task/
    sync_groww_task — they differ only in which provider/service method to call."""
    from app.core.providers.factory import ProviderFactory
    from app.domain.services.config import ConfigService
    from app.infrastructure.repositories.config import ConfigRepository

    db = SessionLocal()
    try:
        provider = ProviderFactory(ConfigService(ConfigRepository(db))).get(provider_name, required=False)
    finally:
        db.close()

    if provider is None:
        logger.warning(f"{job_name}: skipped — {provider_name} provider is not configured/enabled")
        return

    holdings = provider.sync()  # raises <Provider>AuthError("AUTH_REQUIRED: ...") if not connected / expired

    from app.domain.services.portfolio import PortfolioService
    from app.infrastructure.repositories import (
        PortfolioSnapshotRepository,
        PortfoliosRepository,
        PositionsRepository,
        TransactionsRepository,
    )

    for portfolio_id in _list_portfolio_entries():
        db = SessionLocal()
        try:
            svc = PortfolioService(
                PortfoliosRepository(db),
                TransactionsRepository(db),
                PositionsRepository(db),
                PortfolioSnapshotRepository(db),
            )
            getattr(svc, sync_method_name)(portfolio_id, holdings)
            logger.info(f"{job_name}: holdings synced for portfolio {portfolio_id}")
        except Exception as e:
            db.rollback()
            logger.warning(f"{job_name}: sync failed for portfolio {portfolio_id}: {e}")
        finally:
            db.close()

    ingest_all_quotes()

    for portfolio_id in _list_portfolio_entries():
        db = SessionLocal()
        try:
            svc = PortfolioService(
                PortfoliosRepository(db),
                TransactionsRepository(db),
                PositionsRepository(db),
                PortfolioSnapshotRepository(db),
            )
            svc.generate_portfolio_snapshot(portfolio_id)
        except Exception as e:
            db.rollback()
            logger.warning(f"{job_name}: snapshot failed for portfolio {portfolio_id}: {e}")
        finally:
            db.close()


@shared_task(name="app.workers.ingestion.tasks.sync_zerodha_task")
def sync_zerodha_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("sync_zerodha", log_id, _run_broker_sync, "sync_zerodha", "zerodha", "sync_zerodha_holdings")


@shared_task(name="app.workers.ingestion.tasks.sync_binance_task")
def sync_binance_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("sync_binance", log_id, _run_broker_sync, "sync_binance", "binance", "sync_binance_holdings")


@shared_task(name="app.workers.ingestion.tasks.sync_groww_task")
def sync_groww_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("sync_groww", log_id, _run_broker_sync, "sync_groww", "groww", "sync_groww_holdings")


@shared_task(name="app.workers.ingestion.tasks.refresh_prices_task")
def refresh_prices_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("refresh_prices", log_id, ingest_all_quotes)


@shared_task(name="app.workers.ingestion.tasks.fetch_news_task")
def fetch_news_task(log_id: int | None = None, **kwargs) -> None:
    def _run_fetch():
        db = SessionLocal()
        try:
            from app.domain.services.news import NewsService
            from app.infrastructure.repositories.ingestion import IngestionRepository
            from app.infrastructure.repositories.news import NewsRepository

            symbols = IngestionRepository(db).list_quoted_symbols(limit=10)
            if not symbols:
                symbols = ["AAPL", "TSLA", "RELIANCE.NS"]

            news_svc = NewsService(NewsRepository(db))
            for sym in symbols:
                news_svc.fetch_and_store(sym)
        finally:
            db.close()
    _wrap_job_execution("fetch_news", log_id, _run_fetch)


def _run_briefing(briefing_type: str):
    from app.core.constants import DEFAULT_USER_ID

    db = SessionLocal()
    try:
        from app.domain.services.ai import AIService
        ai_svc = AIService(db)
        try:
            ai_svc.generate_briefing(briefing_type, user_id=DEFAULT_USER_ID)
        except Exception as e:
            logger.error(f"Failed to generate {briefing_type} briefing: {e}")
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



@shared_task(name="app.workers.ingestion.tasks.seed_price_history_task")
def seed_price_history_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.domain.services.data_maintenance import MarketSeedService
        from app.infrastructure.repositories.ingestion import IngestionRepository
        from app.infrastructure.repositories.market import MarketRepository
        from app.infrastructure.repositories.news import NewsRepository

        db = SessionLocal()
        try:
            MarketSeedService(IngestionRepository(db), MarketRepository(db), NewsRepository(db)).seed_price_history()
        finally:
            db.close()
    _wrap_job_execution("seed_price_history", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.seed_market_universe_task")
def seed_market_universe_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.domain.services.data_maintenance import MarketSeedService
        from app.infrastructure.repositories.ingestion import IngestionRepository
        from app.infrastructure.repositories.market import MarketRepository
        from app.infrastructure.repositories.news import NewsRepository

        db = SessionLocal()
        try:
            MarketSeedService(IngestionRepository(db), MarketRepository(db), NewsRepository(db)).seed_market_universe()
        finally:
            db.close()
        ingest_all_quotes.delay()
    _wrap_job_execution("seed_market_universe", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.recompute_features")
def recompute_features(asset_id: str) -> None:
    from app.workers.evaluation.features import generate_features
    generate_features.delay(asset_id)


@shared_task(name="app.workers.ingestion.tasks.recompute_signals")
def recompute_signals(asset_id: str) -> None:
    from app.workers.evaluation.signals import generate_signals
    generate_signals.delay(asset_id)


@shared_task(name="app.workers.ingestion.tasks.recompute_scores")
def recompute_scores(asset_id: str) -> None:
    from app.workers.evaluation.scoring import generate_scores
    generate_scores.delay(asset_id)


@shared_task(name="app.workers.ingestion.tasks.admin_reprocess_all_assets")
def admin_reprocess_all_assets(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.infrastructure.repositories.ingestion import IngestionRepository

        db = SessionLocal()
        try:
            asset_ids = IngestionRepository(db).list_asset_ids_with_quotes()
        finally:
            db.close()
        for aid in asset_ids:
            recompute_features.delay(str(aid))
    _wrap_job_execution("admin_reprocess_all", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.admin_backfill_assets")
def admin_backfill_assets(asset_ids: list[str]) -> None:
    for aid in asset_ids:
        recompute_features.delay(aid)


@shared_task(name="app.workers.ingestion.tasks.admin_repair_jobs")
def admin_repair_jobs(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.domain.services.data_maintenance import ReprocessService
        from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
        from app.infrastructure.repositories.asset_scores import AssetScoresRepository
        from app.infrastructure.repositories.recommendation import RecommendationRepository

        db = SessionLocal()
        try:
            missing = ReprocessService(
                RecommendationRepository(db),
                AssetFeaturesRepository(db),
                AssetScoresRepository(db),
            ).find_assets_missing_features_or_scores()
        finally:
            db.close()
        for asset_id in missing:
            recompute_features.delay(str(asset_id))
    _wrap_job_execution("admin_repair", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.validate_data_quality_task")
def validate_data_quality_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.domain.services.data_maintenance import DataQualityService
        from app.infrastructure.repositories.market import MarketRepository
        from app.infrastructure.repositories.monitoring import MonitoringRepository

        db = SessionLocal()
        try:
            errors = DataQualityService(MonitoringRepository(db), MarketRepository(db)).validate()
        finally:
            db.close()

        if errors:
            logger.error(f"Data Quality Audit found {len(errors)} issues: {'; '.join(errors[:10])}")
        else:
            logger.info("Data Quality Validation completed successfully. No issues found.")
    _wrap_job_execution("validate_data_quality", log_id, _run)


