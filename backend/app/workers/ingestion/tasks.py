import functools

from celery import shared_task

from app.core.database import SessionLocal
from app.core.logging import logger
from app.core.providers.retry import with_retry
from app.core.redis import cache_quote

# Provider names ingest_quote accepts — resolution itself always goes through
# ProviderFactory -> ProviderRegistry -> ProviderProtocol (see ingest_quote below);
# this set only preserves the original "unknown provider" validation surface.
_MARKET_DATA_PROVIDERS = {"finnhub", "polygon", "yahoo", "binance_price"}

# Asset classes with no ISIN/ticker coverage on Yahoo — routing them through the
# generic ingest_all_quotes fan-out just generates an hourly ProviderError per
# symbol. mutual_fund gets its NAV from refresh_mutual_fund_navs_task (AMFI);
# nps/epf get theirs from statement-import wiring (import_nps_statement,
# NAV_INGESTION_SCOPE.md §4/§6) or don't have a source at all (epf, §7).
_NO_YAHOO_COVERAGE_ASSET_CLASSES = {"mutual_fund", "nps", "epf"}
# MANUAL- prefixed symbols (manually-valued assets, portfolio/api/portfolio.py's
# create_manual_asset) use a free-text asset_class, so they're excluded by
# symbol prefix below rather than added to the class set above.

# Ordered fallback candidates per primary provider, tried on a ProviderError
# from the one before it (see get_fallback_chain usage in ingest_quote below).
# Yahoo covers global equity/crypto-spot symbols; Finnhub/Polygon are US-quote
# APIs, so they're only meaningful fallbacks for the subset of Yahoo's symbols
# that also resolve on a US ticker (e.g. AAPL, not RELIANCE.NS) — still a
# strict improvement over "no fallback at all" for those. binance_price has no
# listed fallback: crypto-futures symbols (e.g. BTCUSDT-USDM) don't resolve on
# any other registered provider, so there's nothing sensible to fall through to.
_QUOTE_FALLBACK_CANDIDATES: dict[str, list[str]] = {
    "yahoo": ["finnhub", "polygon"],
}


@with_retry()
def _get_quote_with_retry(adapter, symbol: str):
    return adapter.get_quote(symbol)


def _skip_if_disabled(job_name: str):
    """Decorator for beat-scheduled tasks: skip execution if JobConfig.enabled
    is False for this job, logging clearly rather than silently no-op'ing.

    Only apply this to tasks that actually have a beat_schedule entry
    (celery_app.py) — for jobs with no beat entry, `enabled` implying
    "scheduled" is a separate, already-flagged gap (CORE_CONFIG_MODULE_AUDIT.md,
    workers audit 2.1) that this decorator does not address.
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            from app.core.entities.config import JobStatus
            from app.core.repositories.config import ConfigRepository
            from app.core.services.config import ConfigService

            db = SessionLocal()
            try:
                cfg_svc = ConfigService(ConfigRepository(db))
                job = cfg_svc.get_job(job_name)
                if job is not None and not job.enabled:
                    logger.info(f"{job_name}: skipped — JobConfig.enabled is False")
                    # A manual "Run Now" (unlike beat) pre-creates a RUNNING
                    # JobLog row before dispatch — close it out here so it
                    # doesn't sit at RUNNING forever.
                    log_id = kwargs.get("log_id")
                    if log_id is not None:
                        cfg_svc.log_job_end(log_id, JobStatus.SUCCESS, error="skipped — JobConfig.enabled is False")
                    return None
            finally:
                db.close()
            return fn(*args, **kwargs)
        return wrapper
    return decorator

@shared_task(name="app.workers.ingestion.tasks.ingest_quote")  # type: ignore
def ingest_quote(provider_name: str, symbol: str) -> bool:
    if provider_name not in _MARKET_DATA_PROVIDERS:
        raise ValueError(f"Unknown provider {provider_name}")

    from app.core.exceptions import ProviderError
    from app.core.providers.factory import ProviderFactory
    from app.core.services.config import ConfigService
    from app.modules.market.services.ingestion import QuoteIngestionService
    from app.core.repositories.config import ConfigRepository
    from app.modules.market.repositories.ingestion import IngestionRepository

    db = SessionLocal()
    try:
        ingestion_svc = QuoteIngestionService(IngestionRepository(db))
        try:
            candidate_names = [provider_name] + _QUOTE_FALLBACK_CANDIDATES.get(provider_name, [])
            chain = ProviderFactory(ConfigService(ConfigRepository(db))).get_fallback_chain(candidate_names)
            if not chain:
                raise ProviderError(f"No available provider for '{provider_name}' or its fallbacks")

            quote = None
            used_provider = provider_name
            last_error: Exception | None = None
            for adapter in chain:
                try:
                    quote = _get_quote_with_retry(adapter, symbol)
                    used_provider = adapter.provider_name
                    break
                except ProviderError as e:
                    last_error = e
                    logger.warning(
                        f"ingest_quote: {adapter.provider_name} failed for {symbol}, "
                        f"trying next provider in fallback chain: {e}"
                    )
            if quote is None:
                raise last_error or ProviderError(f"All providers failed for {symbol}")

            asset_id = ingestion_svc.save_quote(used_provider, quote)
            cache_quote(symbol, quote.model_dump())

            # Trigger downstream: snapshot → features → signals → scores → health
            from app.workers.snapshots.asset_snapshot import process_asset_snapshot
            process_asset_snapshot.delay(str(asset_id))

            from app.workers.monitoring.watchlist_alerts import evaluate_watchlist_alerts
            evaluate_watchlist_alerts.delay(symbol)

            return True

        except Exception as e:
            db.rollback()
            ingestion_svc.record_failure(provider_name, symbol, str(e))
            raise
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.ingest_all_quotes")
def ingest_all_quotes() -> None:
    from app.modules.market.repositories.ingestion import IngestionRepository

    db = SessionLocal()
    try:
        assets = IngestionRepository(db).list_symbols_for_quote_ingestion()
    finally:
        db.close()

    if not assets:
        logger.warning("ingest_all_quotes: market.assets is empty — run seed_market_universe_task first")
        return
    for symbol, asset_class in assets:
        if asset_class in _NO_YAHOO_COVERAGE_ASSET_CLASSES or symbol.startswith("MANUAL-"):
            continue
        provider_name = "binance_price" if asset_class == "crypto_futures" else "yahoo"
        ingest_quote.delay(provider_name, symbol)


def _wrap_job_execution(job_name: str, log_id: int | None, fn, *args, **kwargs) -> None:
    db = SessionLocal()
    try:
        from app.core.entities.config import JobStatus
        from app.core.services.config import ConfigService
        from app.core.repositories.config import ConfigRepository

        cfg_repo = ConfigRepository(db)
        cfg_svc = ConfigService(cfg_repo)

        if log_id is None:
            log = cfg_svc.log_job_start(job_name)
            log_id = log.id

        # Single source of truth for last_run_at: every execution path (beat-fired
        # or manually dispatched) goes through here, so this is the one place that
        # needs to record it — see JOBCONFIG_SCHEDULING_SCOPE.md §0 for why the
        # old manual-only mark_job_ran() call left beat-scheduled jobs' last_run_at
        # stale despite last_status already being correct.
        cfg_svc.mark_job_ran(job_name)

        try:
            fn(*args, **kwargs)
            cfg_svc.log_job_end(log_id, JobStatus.SUCCESS)
        except Exception as e:
            cfg_svc.log_job_end(log_id, JobStatus.FAILED, error=str(e))
            logger.error(f"Job {job_name} failed (log_id={log_id}): {e}", exc_info=True)
            raise e
        finally:
            # Releases dispatch_job's concurrency-guard lock (config.py's
            # _JOB_LOCK_TTL_SECONDS) for the three broker-sync jobs it's taken
            # for — a harmless no-op (compare-then-delete against a key that was
            # never set) for every other job. Token is this task's own Celery
            # task_id, set into context by celery_app.py's task_prerun handler.
            from app.core.logging import ctx_task_id
            from app.core.redis import release_job_lock
            token = ctx_task_id.get()
            if token:
                release_job_lock(job_name, token)
    finally:
        db.close()


def _list_portfolio_entries() -> list:
    """Loads portfolio ids in a short-lived read session so a later rollback
    elsewhere cannot expire these values."""
    from app.modules.portfolio.repositories.portfolios import PortfoliosRepository

    db = SessionLocal()
    try:
        return [pf.id for pf in PortfoliosRepository(db).list_all()]
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.sync_portfolio_task")
def sync_portfolio_task(log_id: int | None = None, **kwargs) -> None:
    def _run_sync():
        ingest_all_quotes()

        from app.modules.portfolio.services.portfolio import PortfolioService
        from app.modules.portfolio.repositories.portfolio_snapshot import (
            PortfolioSnapshotRepository,
        )
        from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
        from app.modules.portfolio.repositories.positions import PositionsRepository
        from app.modules.portfolio.repositories.transactions import TransactionsRepository

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
    from app.core.services.config import ConfigService
    from app.core.repositories.config import ConfigRepository

    db = SessionLocal()
    try:
        provider = ProviderFactory(ConfigService(ConfigRepository(db))).get(provider_name, required=False)
    finally:
        db.close()

    if provider is None:
        logger.warning(f"{job_name}: skipped — {provider_name} provider is not configured/enabled")
        return

    holdings = provider.sync()  # raises <Provider>AuthError("AUTH_REQUIRED: ...") if not connected / expired

    from app.modules.portfolio.services.portfolio import PortfolioService
    from app.modules.portfolio.repositories.portfolio_snapshot import (
        PortfolioSnapshotRepository,
    )
    from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
    from app.modules.portfolio.repositories.positions import PositionsRepository
    from app.modules.portfolio.repositories.transactions import TransactionsRepository

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
@_skip_if_disabled("refresh_prices")
def refresh_prices_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("refresh_prices", log_id, ingest_all_quotes)


@shared_task(name="app.workers.ingestion.tasks.fetch_news_task")
@_skip_if_disabled("fetch_news")
def fetch_news_task(log_id: int | None = None, **kwargs) -> None:
    def _run_fetch():
        from app.core.exceptions import ProviderError

        db = SessionLocal()
        try:
            from app.modules.news.services.news import NewsService
            from app.modules.market.repositories.ingestion import IngestionRepository
            from app.modules.news.repositories.news import NewsRepository

            ingestion_repo = IngestionRepository(db)
            symbols = ingestion_repo.list_quoted_symbols(limit=10)
            if not symbols:
                symbols = ["AAPL", "TSLA", "RELIANCE.NS"]

            news_svc = NewsService(NewsRepository(db))
            failed_symbols = []
            for sym in symbols:
                try:
                    news_svc.fetch_and_store(sym)
                except ProviderError as e:
                    # An isolated per-symbol failure (e.g. one delisted ticker
                    # both providers reject) shouldn't abort the whole run —
                    # only escalate if every symbol this cycle hit total
                    # provider failure, which is the real "pipeline is down" signal.
                    logger.error(f"fetch_news_task: all providers failed for symbol={sym}: {e}")
                    failed_symbols.append(sym)
                finally:
                    # Stamped regardless of outcome (including zero articles found)
                    # so list_quoted_symbols' staleness ordering treats "we tried and
                    # found nothing" as attempted, not as permanently "never fetched" —
                    # see CRYPTO_SENTIMENT_GAP §1.
                    ingestion_repo.mark_news_fetch_attempted(sym)

            if symbols and len(failed_symbols) == len(symbols):
                raise ProviderError(
                    f"fetch_news_task: all {len(symbols)} symbol(s) had total provider failure "
                    f"this cycle: {', '.join(failed_symbols)}"
                )
        finally:
            db.close()
    _wrap_job_execution("fetch_news", log_id, _run_fetch)


def _run_briefing(briefing_type: str):
    from app.core.constants import DEFAULT_USER_ID

    db = SessionLocal()
    try:
        from app.modules.ai.services.ai import AIService
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
@_skip_if_disabled("seed_price_history")
def seed_price_history_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.ai.services.data_maintenance import MarketSeedService
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.modules.market.repositories.market import MarketRepository
        from app.modules.news.repositories.news import NewsRepository

        db = SessionLocal()
        try:
            MarketSeedService(IngestionRepository(db), MarketRepository(db), NewsRepository(db)).seed_price_history()
        finally:
            db.close()
    _wrap_job_execution("seed_price_history", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.seed_market_universe_task")
@_skip_if_disabled("seed_market_universe")
def seed_market_universe_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.ai.services.data_maintenance import MarketSeedService
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.modules.market.repositories.market import MarketRepository
        from app.modules.news.repositories.news import NewsRepository

        db = SessionLocal()
        try:
            MarketSeedService(IngestionRepository(db), MarketRepository(db), NewsRepository(db)).seed_market_universe()
        finally:
            db.close()
        ingest_all_quotes.delay()
    _wrap_job_execution("seed_market_universe", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.admin_reprocess_all_assets")
def admin_reprocess_all_assets(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.workers.evaluation.features import generate_features

        db = SessionLocal()
        try:
            asset_ids = IngestionRepository(db).list_asset_ids_with_quotes()
        finally:
            db.close()
        for aid in asset_ids:
            generate_features.delay(str(aid))
    _wrap_job_execution("admin_reprocess_all", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.admin_backfill_assets")
def admin_backfill_assets(asset_ids: list[str]) -> None:
    from app.workers.evaluation.features import generate_features

    for aid in asset_ids:
        generate_features.delay(aid)


@shared_task(name="app.workers.ingestion.tasks.admin_repair_jobs")
def admin_repair_jobs(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.ai.services.data_maintenance import ReprocessService
        from app.modules.market.repositories.asset_features import AssetFeaturesRepository
        from app.modules.market.repositories.asset_scores import AssetScoresRepository
        from app.modules.ai.repositories.recommendation import RecommendationRepository
        from app.workers.evaluation.features import generate_features

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
            generate_features.delay(str(asset_id))
    _wrap_job_execution("admin_repair", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.refresh_fundamentals_task")
@_skip_if_disabled("refresh_fundamentals")
def refresh_fundamentals_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.core.exceptions import ProviderError
        from app.core.providers.factory import ProviderFactory
        from app.core.repositories.config import ConfigRepository
        from app.core.services.config import ConfigService
        from app.modules.market.repositories.asset_fundamentals import AssetFundamentalsRepository
        from app.modules.market.repositories.ingestion import IngestionRepository

        db = SessionLocal()
        try:
            assets = IngestionRepository(db).list_equity_assets_with_quotes()
        finally:
            db.close()

        if not assets:
            logger.warning("refresh_fundamentals_task: no quoted equities found")
            return

        failed = []
        for asset_id, symbol in assets:
            db = SessionLocal()
            try:
                adapter = ProviderFactory(ConfigService(ConfigRepository(db))).get("yahoo")
                fundamentals = adapter.get_fundamentals(symbol)
                AssetFundamentalsRepository(db).upsert(asset_id, fundamentals)
                db.commit()
            except ProviderError as e:
                # Isolated per-symbol failure (e.g. yfinance has no fundamentals
                # coverage for this ticker) shouldn't abort the whole daily run —
                # only escalate if every symbol this cycle failed outright.
                db.rollback()
                logger.warning(f"refresh_fundamentals_task: failed for symbol={symbol}: {e}")
                failed.append(symbol)
            finally:
                db.close()

        if len(failed) == len(assets):
            raise ProviderError(
                f"refresh_fundamentals_task: all {len(assets)} symbol(s) had total provider failure this cycle"
            )
    _wrap_job_execution("refresh_fundamentals", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.refresh_mutual_fund_navs_task")
@_skip_if_disabled("refresh_mutual_fund_navs")
def refresh_mutual_fund_navs_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from datetime import datetime, timezone
        from app.core.exceptions import ProviderError
        from app.core.providers.factory import ProviderFactory
        from app.core.providers.models import NormalizedQuote
        from app.core.repositories.config import ConfigRepository
        from app.core.services.config import ConfigService
        from app.modules.market.repositories.ingestion import IngestionRepository

        db = SessionLocal()
        try:
            assets = IngestionRepository(db).list_mutual_fund_assets_with_quotes()
        finally:
            db.close()

        if not assets:
            logger.info("refresh_mutual_fund_navs_task: no mutual fund holdings found")
            return

        db = SessionLocal()
        try:
            adapter = ProviderFactory(ConfigService(ConfigRepository(db))).get("mfapi")
            isin_to_nav = adapter.get_all_navs()
        finally:
            db.close()

        matched = 0
        unmatched = []
        db = SessionLocal()
        try:
            repo = IngestionRepository(db)
            for asset_id, symbol in assets:
                isin = symbol.removesuffix("_MF")
                nav = isin_to_nav.get(isin)
                if nav is None:
                    unmatched.append(symbol)
                    continue
                repo.upsert_quote(
                    NormalizedQuote(
                        symbol=symbol,
                        provider="mfapi",
                        timestamp=datetime.now(timezone.utc),
                        price=nav,
                    ),
                    asset_id,
                )
                matched += 1
            db.commit()
        finally:
            db.close()

        if unmatched:
            logger.warning(
                f"refresh_mutual_fund_navs_task: no AMFI NAV match for {len(unmatched)} symbol(s): {', '.join(unmatched)}"
            )
        logger.info(f"refresh_mutual_fund_navs_task: updated {matched}/{len(assets)} mutual fund NAV(s)")

        if matched == 0:
            raise ProviderError("refresh_mutual_fund_navs_task: no AMFI NAV matched any held mutual fund symbol")
    _wrap_job_execution("refresh_mutual_fund_navs", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.validate_data_quality_task")
def validate_data_quality_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.ai.services.data_maintenance import DataQualityService
        from app.modules.market.repositories.market import MarketRepository
        from app.core.repositories.monitoring import MonitoringRepository
        from app.modules.ai.repositories.recommendation import RecommendationRepository

        db = SessionLocal()
        try:
            errors = DataQualityService(MonitoringRepository(db), MarketRepository(db), RecommendationRepository(db)).validate()
        finally:
            db.close()

        if errors:
            logger.error(f"Data Quality Audit found {len(errors)} issues: {'; '.join(errors[:10])}")
        else:
            logger.info("Data Quality Validation completed successfully. No issues found.")
    _wrap_job_execution("validate_data_quality", log_id, _run)


