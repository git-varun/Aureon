import functools
import re

from celery import shared_task

from app.core.database import SessionLocal
from app.core.logging import logger
from app.core.providers.retry import with_retry
from app.core.redis import cache_quote

# Provider names ingest_quote accepts — resolution itself always goes through
# ProviderFactory -> ProviderRegistry -> ProviderProtocol (see ingest_quote below);
# this set only preserves the original "unknown provider" validation surface.
_MARKET_DATA_PROVIDERS = {"finnhub", "polygon", "yahoo", "binance_price", "nse_direct", "twelvedata", "alphavantage", "coingecko"}

# Asset classes with no ISIN/ticker coverage on Yahoo — routing them through the
# generic ingest_all_quotes fan-out just generates an hourly ProviderError per
# symbol. mutual_fund gets its NAV from refresh_mutual_fund_navs_task (AMFI);
# nps/epf get theirs from statement-import wiring (import_nps_statement,
# NAV_INGESTION_SCOPE.md §4/§6) or don't have a source at all (epf, §7).
_NO_YAHOO_COVERAGE_ASSET_CLASSES = {"mutual_fund", "nps", "epf"}
# MANUAL- prefixed symbols (manually-valued assets, portfolio/api/portfolio.py's
# create_manual_asset) use a free-text asset_class, so they're excluded by
# symbol prefix below rather than added to the class set above.


def _skip_quote_ingestion(symbol: str, asset_class: str | None) -> bool:
    """Single source of truth for "should this (symbol, asset_class) be
    skipped before ever reaching resolve_quote_provider" — shared by every
    quote-ingestion dispatch loop (ingest_all_quotes, refresh_tracked_universe_task)
    so a class/prefix excluded from one is excluded from all of them. Routing
    a mutual_fund/nps/epf/MANUAL- symbol into resolve_quote_provider's `else`
    branch would guaranteed-fail against finnhub every cycle — see
    _NO_YAHOO_COVERAGE_ASSET_CLASSES above for why these have no real-time
    quote source at all (NAV/statement-import paths handle them instead)."""
    return asset_class in _NO_YAHOO_COVERAGE_ASSET_CLASSES or symbol.startswith("MANUAL-")

# Ordered fallback candidates per primary provider, tried on a ProviderError
# from the one before it (see get_fallback_chain usage in ingest_quote below).
# Yahoo covers global equity/crypto-spot symbols; Finnhub/Polygon are US-quote
# APIs, so they're only meaningful fallbacks for the subset of Yahoo's symbols
# that also resolve on a US ticker (e.g. AAPL, not RELIANCE.NS) — still a
# strict improvement over "no fallback at all" for those. binance_price has no
# listed fallback: crypto-futures symbols (e.g. BTCUSDT-USDM) don't resolve on
# any other registered provider, so there's nothing sensible to fall through to.
# nse_direct falls back to yahoo (still needed for fundamentals/sector either
# way, and covers .NS symbols too) rather than finnhub/polygon, which have no
# Indian-equity coverage at all.
# finnhub is primary for global (non-.NS/.BO) equities as of Phase B, with
# twelvedata/alphavantage/yahoo as fallbacks in that order — live-tested free-
# tier budgets (finnhub 60/min, twelvedata 8/min, alphavantage 25/day) drove
# the ordering, not alphabetical/arbitrary placement. yahoo stays last (not
# removed) as the unlimited, always-available final fallback.
# coingecko falls back to yahoo (yfinance genuinely serves BTC-USD-style
# tickers) rather than finnhub/twelvedata/alphavantage, which are equity-only
# and were confirmed live to return a zero/garbage price for crypto symbols.
_QUOTE_FALLBACK_CANDIDATES: dict[str, list[str]] = {
    "yahoo": ["finnhub", "polygon"],
    "nse_direct": ["yahoo"],
    "finnhub": ["twelvedata", "alphavantage", "yahoo"],
    "coingecko": ["yahoo"],
}

# Japan/Hong Kong/Europe exchange suffixes — live-tested (Phase D investigation,
# 207/207 correctly-formatted symbols resolved across these exact suffixes) to
# have real, reliable yahoo coverage, while finnhub/twelvedata/alphavantage are
# all confirmed free-tier-US-only (see twelvedata/provider.py's _reject_india-
# adjacent comment for the same finding on that adapter). Routing these straight
# to yahoo avoids burning three guaranteed ProviderErrors (plus twelvedata's
# 8/min budget) per symbol before reaching the provider that actually works —
# the same class of waste the crypto/finnhub fix above addressed.
_JP_HK_EUROPE_SUFFIXES = (
    ".T", ".HK", ".DE", ".PA", ".AS", ".MI", ".MC", ".ST", ".CO", ".HE",
    ".BR", ".LS", ".VI", ".OL", ".SW", ".L",
)


# Cheap local gate before spending a live provider call on a search query —
# deliberately permissive (real tickers/suffixes are short, alnum, at most one
# hyphen segment and one dot-suffix) rather than trying to enumerate every
# valid exchange suffix; a query that fails this never reaches a provider,
# one that passes still has to resolve for real (see resolve_and_track_symbol)
# before anything is created/tracked.
_PLAUSIBLE_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,12}(-[A-Z0-9]{1,10})?(\.[A-Z]{1,4})?$")


def looks_like_symbol(query: str) -> bool:
    return bool(_PLAUSIBLE_SYMBOL_RE.match(query))


def resolve_quote_provider(symbol: str, asset_class: str | None) -> str:
    """Single source of truth for "which provider should ingest this symbol's
    quote" — used by both ingest_all_quotes (the hourly held/watchlisted
    refresh) and the tracked-universe seed/refresh tasks, so the two can never
    drift the way a duplicated if/elif chain eventually would (see Phase C's
    crypto/finnhub fix, which was exactly this class of bug)."""
    if asset_class == "crypto_futures":
        return "binance_price"
    if asset_class in ("crypto", "stablecoin"):
        # Spot crypto/stablecoin ({ASSET}-USD, Binance spot/earn sync) —
        # previously fell into the equity `else` bucket below and got
        # routed to finnhub, which returns a zero price for crypto
        # symbols (confirmed live) and wastefully cascaded through the
        # whole equity fallback chain before landing on yahoo.
        return "coingecko"
    if symbol.endswith(".NS"):
        return "nse_direct"
    if symbol.endswith(".BO"):
        # BSE-only listings: no coverage on nse_direct (NSE-only) or on
        # finnhub/twelvedata/alphavantage (all live-tested as US-listed-
        # only on their free tiers) — yahoo remains the only real source.
        return "yahoo"
    if symbol.endswith(_JP_HK_EUROPE_SUFFIXES):
        return "yahoo"
    return "finnhub"


def _yahoo_can_serve_crypto_symbol(symbol: str) -> bool:
    """True only for curated-ticker crypto symbols (e.g. BTC-USD) that Yahoo
    Finance actually recognizes. Non-curated tracked-universe coins are
    stored under their raw CoinGecko id (e.g. leo-token-USD, hash-2-USD, see
    coingecko/provider.py's _coin_id) — Yahoo has no notion of these ids and
    404s on them deterministically, so they're never a valid yahoo fallback
    target."""
    from app.modules.market.providers.market_data.coingecko.provider import SYMBOL_TO_COINGECKO_ID
    raw = symbol.removesuffix("-USD")
    return raw.upper() in SYMBOL_TO_COINGECKO_ID


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
        last_attempted_provider = provider_name
        try:
            candidate_names = [provider_name] + _QUOTE_FALLBACK_CANDIDATES.get(provider_name, [])
            if provider_name == "coingecko" and not _yahoo_can_serve_crypto_symbol(symbol):
                # Aureon stores non-curated crypto assets under their raw
                # CoinGecko id (e.g. "leo-token-USD", "hash-2-USD") — Yahoo has
                # no notion of these ids and 404s on them deterministically, so
                # falling back to it here isn't a real fallback, just a doomed
                # retry that masks a genuine coingecko-only outage as "handled".
                candidate_names = [c for c in candidate_names if c != "yahoo"]
            chain = ProviderFactory(ConfigService(ConfigRepository(db))).get_fallback_chain(candidate_names)
            if not chain:
                raise ProviderError(f"No available provider for '{provider_name}' or its fallbacks")

            quote = None
            used_provider = provider_name
            last_error: Exception | None = None
            for adapter in chain:
                last_attempted_provider = adapter.provider_name
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

            # Trigger downstream: snapshot → features → signals → scores → health.
            # Gated to symbols actually held — a watchlisted-but-not-held symbol
            # still gets its quote (for price display/alerts) but never enters
            # feature/signal/recommendation scoring.
            if IngestionRepository(db).is_symbol_held(symbol):
                from app.workers.snapshots.asset_snapshot import process_asset_snapshot
                process_asset_snapshot.delay(str(asset_id))

            from app.workers.monitoring.watchlist_alerts import evaluate_watchlist_alerts
            evaluate_watchlist_alerts.delay(symbol)

            return True

        except Exception as e:
            db.rollback()
            # Record whichever adapter actually produced the failure (the last
            # one attempted), not the originally-requested provider_name — a
            # coingecko request that fails over to yahoo and fails there too
            # must not be logged as a coingecko failure carrying yahoo's error
            # text, which would mislead any future debugging off this table.
            ingestion_svc.record_failure(last_attempted_provider, symbol, str(e))
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
        logger.info("ingest_all_quotes: nothing held or watchlisted yet, skipping")
        return
    for symbol, asset_class in assets:
        if _skip_quote_ingestion(symbol, asset_class):
            continue
        provider_name = resolve_quote_provider(symbol, asset_class)
        ingest_quote.delay(provider_name, symbol)


def _wrap_job_execution(job_name: str, log_id: int | None, fn, *args, **kwargs) -> None:
    from app.core.redis import is_reset_in_progress

    if is_reset_in_progress():
        logger.warning(f"Job {job_name} skipped — data reset in progress")
        return

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
        from app.modules.portfolio.repositories.import_runs import ImportRunsRepository
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
                    ImportRunsRepository(db),
                )
                svc.generate_portfolio_snapshot(portfolio_id)
                logger.info(f"sync_portfolio: snapshot updated for portfolio {portfolio_id}")
            except Exception as e:
                db.rollback()
                logger.warning(f"sync_portfolio: snapshot failed for portfolio {portfolio_id}: {e}")
            finally:
                db.close()

    _wrap_job_execution("sync_portfolio", log_id, _run_sync)


def _last_broker_trade_at(provider_name: str):
    """Most recent kind="broker_trade" Transaction.transaction_date already
    captured for this broker, across all portfolios. Used as the "since last
    successful sync" watermark for providers (Binance) whose trade-history
    endpoints default to a narrow recent-only window — the actual trade
    ledger is a more reliable cursor than JobConfig.last_run_at, which is
    stamped at this run's *start* (_wrap_job_execution, before this function
    runs) and would already read as "now", not "last time", if read here.
    Returns None on a first-ever sync (no rows yet).

    transaction_date is TIMESTAMP WITHOUT TIME ZONE — psycopg drops tzinfo to
    the session's TimeZone GUC on write, so the raw naive max() must be
    reversed through that same GUC before use (see
    TransactionsRepository.get_last_real_transaction_dates_by_broker), or the
    tz-aware .timestamp() call downstream in provider.sync() would otherwise
    reinterpret an already-skewed naive value using the *host's* local
    timezone — compounding the error instead of fixing it."""
    from sqlalchemy import func, select
    from app.modules.portfolio.entities.portfolio import Transaction

    db = SessionLocal()
    try:
        max_date = func.max(Transaction.transaction_date)
        return db.execute(
            select(func.timezone(func.current_setting("TimeZone"), max_date)).where(
                Transaction.broker == provider_name,
                Transaction.kind == "broker_trade",
            )
        ).scalar()
    finally:
        db.close()


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

    since = _last_broker_trade_at(provider_name)
    holdings = provider.sync(since=since)  # raises <Provider>AuthError("AUTH_REQUIRED: ...") if not connected / expired

    from app.modules.portfolio.services.portfolio import PortfolioService
    from app.modules.portfolio.repositories.portfolio_snapshot import (
        PortfolioSnapshotRepository,
    )
    from app.modules.portfolio.repositories.import_runs import ImportRunsRepository
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
                ImportRunsRepository(db),
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
                ImportRunsRepository(db),
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


def _run_binance_spot_backfill(portfolio_id: str | None) -> None:
    if not portfolio_id:
        raise ValueError("backfill_binance_spot: portfolio_id is required")

    import uuid as _uuid

    from app.core.providers.factory import ProviderFactory
    from app.core.repositories.config import ConfigRepository
    from app.core.services.config import ConfigService
    from app.modules.portfolio.repositories.portfolio_snapshot import (
        PortfolioSnapshotRepository,
    )
    from app.modules.portfolio.repositories.import_runs import ImportRunsRepository
    from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
    from app.modules.portfolio.repositories.positions import PositionsRepository
    from app.modules.portfolio.repositories.transactions import TransactionsRepository
    from app.modules.portfolio.services.portfolio import PortfolioService

    db = SessionLocal()
    try:
        provider = ProviderFactory(ConfigService(ConfigRepository(db))).get("binance")
    finally:
        db.close()

    db = SessionLocal()
    try:
        svc = PortfolioService(
            PortfoliosRepository(db),
            TransactionsRepository(db),
            PositionsRepository(db),
            PortfolioSnapshotRepository(db),
            ImportRunsRepository(db),
        )
        summary = svc.backfill_binance_spot(_uuid.UUID(portfolio_id), provider)
        logger.info(f"backfill_binance_spot: portfolio={portfolio_id} {summary}")
    finally:
        db.close()


@shared_task(name="app.workers.ingestion.tasks.backfill_binance_spot_task")
def backfill_binance_spot_task(log_id: int | None = None, portfolio_id: str | None = None, **kwargs) -> None:
    _wrap_job_execution("backfill_binance_spot", log_id, _run_binance_spot_backfill, portfolio_id)


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
                logger.info("fetch_news_task: no quoted symbols yet, skipping")
                return

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
        ai_svc.generate_briefing(briefing_type, user_id=DEFAULT_USER_ID)
    finally:
        db.close()

@shared_task(name="app.workers.ingestion.tasks.daily_briefing_task")
@_skip_if_disabled("daily_briefing")
def daily_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("daily_briefing", log_id, lambda: _run_briefing("global"))

@shared_task(name="app.workers.ingestion.tasks.weekly_briefing_task")
@_skip_if_disabled("weekly_briefing")
def weekly_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("weekly_briefing", log_id, lambda: _run_briefing("weekly"))

@shared_task(name="app.workers.ingestion.tasks.monthly_briefing_task")
@_skip_if_disabled("monthly_briefing")
def monthly_briefing_task(log_id: int | None = None, **kwargs) -> None:
    _wrap_job_execution("monthly_briefing", log_id, lambda: _run_briefing("monthly"))



@shared_task(name="app.workers.ingestion.tasks.seed_price_history_task")
@_skip_if_disabled("seed_price_history")
def seed_price_history_task(log_id: int | None = None, **kwargs) -> None:
    def _run():
        from app.modules.ai.services.data_maintenance import MarketSeedService
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.modules.market.repositories.market import MarketRepository

        db = SessionLocal()
        try:
            MarketSeedService(IngestionRepository(db), MarketRepository(db)).seed_price_history()
        finally:
            db.close()
    _wrap_job_execution("seed_price_history", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.seed_tracked_universes_task")
@_skip_if_disabled("seed_tracked_universes")
def seed_tracked_universes_task(log_id: int | None = None, **kwargs) -> None:
    """Rare/manual "Run Now" job (see _DEFAULT_JOBS — enabled=False by default,
    not on celery_app.py's beat_schedule) that seeds the 6 curated index-based
    tracked universes (Phase D) — deliberately not automatic, since it's a
    one-time (or occasional) bulk operation, unlike every other JobConfig
    entry here."""
    def _run():
        from app.modules.ai.services.data_maintenance import IndexUniverseSeedService
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.modules.market.repositories.market import MarketRepository

        db = SessionLocal()
        try:
            IndexUniverseSeedService(IngestionRepository(db), MarketRepository(db)).seed_tracked_universes()
        finally:
            db.close()
    _wrap_job_execution("seed_tracked_universes", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.refresh_tracked_universe_task")
@_skip_if_disabled("refresh_tracked_universe")
def refresh_tracked_universe_task(log_id: int | None = None, **kwargs) -> None:
    """Daily refresh for is_tracked assets NOT already covered by the hourly
    held/watchlisted refresh (ingest_all_quotes) — kept on its own, much
    slower cadence specifically so a ~500-asset tracked universe never adds
    hourly load to that hot path (see list_tracked_symbols_for_refresh)."""
    def _run():
        from app.modules.market.repositories.ingestion import IngestionRepository

        db = SessionLocal()
        try:
            assets = IngestionRepository(db).list_tracked_symbols_for_refresh()
        finally:
            db.close()

        if not assets:
            logger.info("refresh_tracked_universe: nothing tracked yet, skipping")
            return
        for symbol, asset_class in assets:
            if _skip_quote_ingestion(symbol, asset_class):
                continue
            provider_name = resolve_quote_provider(symbol, asset_class)
            ingest_quote.delay(provider_name, symbol)
    _wrap_job_execution("refresh_tracked_universe", log_id, _run)


@shared_task(name="app.workers.ingestion.tasks.resolve_and_track_symbol")
def resolve_and_track_symbol(query: str) -> None:
    """Phase D lazy on-demand tracking: dispatched fire-and-forget by
    MarketService.search() when a search query has no DB match and passes
    looks_like_symbol's plausibility gate. Runs async specifically so a live
    provider call (measured 0.3-8s for yahoo alone) never blocks the search
    response the user is already looking at — the symbol becomes trackable on
    a later search, not this one.

    Only creates/tracks the Asset on a real successful quote (via the same
    ingest_quote/resolve_quote_provider path everything else uses) — a query
    that doesn't resolve on any provider is never tracked, no-fake-data:
    a failed lookup surfaces as "no results", not a placeholder asset."""
    symbol = query.upper().strip()
    if not looks_like_symbol(symbol):
        return

    provider_name = "coingecko" if symbol.endswith("-USD") else resolve_quote_provider(symbol, None)

    try:
        ingest_quote(provider_name, symbol)
    except Exception as e:
        logger.info(f"resolve_and_track_symbol: {symbol} did not resolve via {provider_name}, not tracked: {e}")
        return

    db = SessionLocal()
    try:
        from app.modules.market.entities.market import Asset
        from app.modules.market.repositories.ingestion import IngestionRepository
        from app.modules.market.repositories.market import MarketRepository
        from app.modules.ai.services.data_maintenance import IndexUniverseSeedService

        asset = db.query(Asset).filter_by(symbol=symbol).first()
        if not asset:
            logger.warning(f"resolve_and_track_symbol: {symbol} quoted OK but no Asset row found")
            return
        asset.is_tracked = True
        db.commit()

        seed_svc = IndexUniverseSeedService(IngestionRepository(db), MarketRepository(db))
        rows = seed_svc.backfill_history(asset, symbol, provider_name)
        logger.info(f"resolve_and_track_symbol: tracked {symbol} via {provider_name}, {rows} history rows backfilled")
    finally:
        db.close()


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
                # sector/industry ride along on the same ticker.info call this task
                # already makes — persisted into Asset.metadata so get_sector_detail
                # (market.py) has something real to query instead of its old
                # hardcoded, never-matching fallback map.
                IngestionRepository(db).update_asset_sector(
                    asset_id, fundamentals.get("sector"), fundamentals.get("industry")
                )
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
                nav_timestamp = datetime.now(timezone.utc)
                repo.upsert_quote(
                    NormalizedQuote(
                        symbol=symbol,
                        provider="mfapi",
                        timestamp=nav_timestamp,
                        price=nav,
                    ),
                    asset_id,
                )
                # Forward-only: latest_quotes always held today's real NAV, but
                # price_history was never appended, so day-over-day change/charts/
                # theme NAV compositing were permanently empty for every mutual
                # fund. No historical backfill is possible — AMFI's daily NAV feed
                # was never captured before this line existed, so there's nothing
                # to reconstruct; price_history for MFs starts accumulating from
                # whenever this fix first runs.
                repo.record_price_history(asset_id, symbol, nav, nav_timestamp)
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


