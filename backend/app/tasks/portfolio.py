"""Portfolio Celery tasks: sync, refresh prices, enrich technicals, seed OHLCV history."""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.cache import cache
from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.modules.portfolio.services import PortfolioService
from app.shared.utils import cache_key, report_task_status

logger = logging.getLogger("celery.portfolio")


@celery_app.task(bind=True, name="portfolio.sync")

def sync_portfolio_task(self, broker: str, force_refresh: bool = True, dry_run: bool = False, user_id: Optional[int] = None):
    """Sync portfolio holdings from broker via real provider factory.

    Returns a structured result with stage, counts, and any errors so that
    AsyncResult polling surfaces meaningful progress.
    """
    task_id = getattr(self.request, "id", None)
    logger.info(
        "[sync:%s] task started task_id=%s force_refresh=%s dry_run=%s.",
        broker, task_id, force_refresh, dry_run,
    )

    errors = []
    holdings_count = 0
    updated_assets = 0
    cred_session = None

    # ── Stage 1: resolve provider ────────────────────────────────────────────
    try:
        from app.modules.portfolio.providers.factory import get_broker_provider
        cred_session = SessionLocal()
        provider = get_broker_provider(broker, session=cred_session)
        logger.info("[sync:%s] provider resolved -> %s", broker, provider.provider_name)
    except Exception as exc:
        logger.error("[sync:%s] failed to resolve provider: %s", broker, exc)
        if cred_session:
            cred_session.close()
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        return {"status": "error", "broker": broker, "stage": "resolve", "errors": [str(exc)]}

    # ── Stage 2: credential validation ──────────────────────────────────────
    try:
        provider.validate_credentials()
        logger.info("[sync:%s] credentials validated", broker)
    except Exception as exc:
        logger.error("[sync:%s] credential validation failed: %s", broker, exc)
        if cred_session:
            cred_session.close()
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        return {"status": "error", "broker": broker, "stage": "validation", "errors": [str(exc)]}

    # ── Guard: user_id is required to write positions ───────────────────────
    if user_id is None:
        logger.error("[sync:%s] user_id is required but was not provided", broker)
        if cred_session:
            cred_session.close()
        return {"status": "error", "broker": broker, "stage": "auth", "errors": ["user_id is required to sync portfolio"]}

    # ── dry_run: credential check only, skip fetch + persist ────────────────
    if dry_run:
        logger.info("[sync:%s] dry_run=true -> stopping after credential validation.", broker)
        if cred_session:
            cred_session.close()
        return {"status": "ok", "broker": broker, "stage": "validated", "dry_run": True, "errors": []}

    # ── Stage 3: delegate sync to service ────────────────────────────────────
    service_session = None
    try:
        service_session = SessionLocal()
        service = PortfolioService(service_session)
        result = service.sync_portfolio(provider, force_refresh=force_refresh, dry_run=dry_run, user_id=user_id)
        holdings_count = result.get("holdings_count", 0)
        updated_assets = result.get("updated_assets", 0)
        errors = result.get("errors", [])
        logger.info("[sync:%s] service sync result=%s", broker, result.get("status"))
        if result.get("status") == "dry_run":
            return {
                "status": "ok",
                "broker": broker,
                "stage": "validated",
                "dry_run": True,
                "holdings_count": holdings_count,
                "updated_assets": updated_assets,
                "errors": errors,
            }
    except Exception as exc:
        logger.exception("[sync:%s] persistence failed: %s", broker, exc)
        errors.append(str(exc))
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        raise self.retry(exc=exc, countdown=60, max_retries=3)
    finally:
        if service_session is not None:
            service_session.close()
        if cred_session is not None:
            cred_session.close()

    # ── Stage 4: cache invalidation ──────────────────────────────────────────
    cache.clear_pattern("portfolio:*")
    cache.set(
        "portfolio:sync_status",
        {"status": "success", "broker": broker, "timestamp": datetime.now(timezone.utc).isoformat()},
        ttl=3600,
    )

    if task_id:
        report_task_status(task_id, "SUCCESS")

    logger.info(
        "[sync:%s] completed holdings=%d upserted=%d errors=%d",
        broker,
        holdings_count,
        updated_assets,
        len(errors),
    )
    return {
        "status": "success",
        "broker": broker,
        "stage": "persisted",
        "holdings_count": holdings_count,
        "updated_assets": updated_assets,
        "errors": errors,
    }


@celery_app.task(bind=True, name="portfolio.refresh_prices")
def refresh_prices_task(self, symbol: Optional[str] = None):
    """Refresh current prices for all assets.

    Thin Celery wrapper — all business logic lives in AssetsService.refresh_prices().
    """
    session = None
    task_id = getattr(self.request, "id", None)
    try:
        logger.info("refresh_prices_task: symbol=%s", symbol or "all")
        from app.modules.assets.services import AssetsService
        session = SessionLocal()
        result = AssetsService(session).refresh_prices(symbol=symbol)
        logger.info("refresh_prices_task: %s", result)
        compute_state_task.delay()

        if task_id:
            report_task_status(task_id, "SUCCESS")
        
        return result
    except Exception as exc:
        logger.exception("refresh_prices_task failed: %s", exc)
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        raise self.retry(exc=exc, countdown=30, max_retries=2)
    finally:
        if session is not None:
            session.close()


@celery_app.task(bind=True, name="portfolio.enrich_technicals")
def enrich_technicals_task(self, symbol: str):
    """Compute technical indicators for an asset. Delegates to QuantEngine (Phase 3)."""
    from app.modules.analytics.models import TechnicalIndicators
    from app.modules.portfolio.models import PriceHistory
    from app.shared.quant import QuantEngine

    logger.info("enrich_technicals_task: symbol=%s", symbol)
    session = None
    try:
        session = SessionLocal()
        service = PortfolioService(session)

        asset = service.get_asset(symbol)
        if not asset:
            raise ValueError("Asset %s not found" % symbol)

        prices = (
            session.query(PriceHistory)
            .filter_by(asset_id=asset.id)
            .order_by(PriceHistory.date)
            .all()
        )

        if len(prices) < 14:
            logger.warning("enrich_technicals_task: insufficient history for %s: %d candles", symbol, len(prices))
            return {"status": "skip", "reason": "insufficient_history", "symbol": symbol}

        technicals = QuantEngine().compute_all(prices)

        macd_dict = technicals.get("macd") or {}
        bollinger_dict = technicals.get("bollinger") or {}
        record = session.query(TechnicalIndicators).filter_by(symbol=symbol).first()
        if record:
            record.rsi = technicals.get("rsi_14")
            record.macd = macd_dict.get("value")
            record.bollinger_upper = bollinger_dict.get("upper")
            record.bollinger_lower = bollinger_dict.get("lower")
            record.vwap = technicals.get("vwap")
        else:
            session.add(TechnicalIndicators(
                symbol=symbol,
                rsi=technicals.get("rsi_14"),
                macd=macd_dict.get("value"),
                bollinger_upper=bollinger_dict.get("upper"),
                bollinger_lower=bollinger_dict.get("lower"),
                vwap=technicals.get("vwap"),
            ))
        try:
            session.commit()
        except Exception as db_exc:
            logger.warning("enrich_technicals_task: DB write failed for %s: %s", symbol, db_exc)
            session.rollback()

        cache.set(cache_key("technicals", symbol), technicals, ttl=3600)
        logger.info("enrich_technicals_task: done for %s", symbol)
        return {"status": "success", "symbol": symbol, "technicals": technicals}

    except Exception as exc:
        logger.exception("enrich_technicals_task failed for %s: %s", symbol, exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
    finally:
        if session:
            session.close()


# ---------------------------------------------------------------------------
# OHLCV history seeding
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="portfolio.seed_price_history", max_retries=1)
def seed_price_history_task(self, symbol: Optional[str] = None, days: int = 365, force: bool = False):
    """Seed real OHLCV price history for all assets (or one symbol).

    Sources:
    - Equity: yfinance ticker.history()
    - Crypto (*-USD-*): yfinance using base pair (e.g. BTC-USD-SPOT → BTC-USD)
    - Mutual Fund (*_MF): mfapi.in historical NAV
    """
    session = None
    task_id = getattr(self.request, "id", None)
    try:
        from app.modules.portfolio.models import Asset, PriceHistory
        from app.shared.constants import AssetType
        from sqlalchemy import func

        session = SessionLocal()
        if symbol:
            assets = session.query(Asset).filter(Asset.symbol == symbol).all()
        else:
            assets = session.query(Asset).filter(Asset.is_tradeable.is_(True)).all()

        seeded = 0
        skipped = 0
        seen_yf_symbols: set = set()  # deduplicate crypto base pairs across compound symbols
        for asset in assets:
            try:
                if not force and asset.last_seeded_at:
                    age_days = (datetime.now(timezone.utc) - asset.last_seeded_at.replace(tzinfo=timezone.utc)).days
                    if age_days < 7:
                        skipped += 1
                        continue

                # For crypto, multiple compound symbols share the same yfinance base pair
                # (BTC-USD-SPOT, BTC-USD-EARN-FLEX, BTC-USD-FUTURES-MARGIN → all BTC-USD).
                # Fetch OHLCV once; each asset row still gets its own PriceHistory records.
                if asset.asset_type == AssetType.CRYPTO:
                    parts = asset.symbol.split("-")
                    yf_key = f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else asset.symbol
                    if yf_key in seen_yf_symbols:
                        logger.debug("seed_price_history: dedup crypto %s (yf_key=%s already seeded)",
                                     asset.symbol, yf_key)
                        skipped += 1
                        continue
                    seen_yf_symbols.add(yf_key)

                rows = _fetch_ohlcv(asset, days)
                if not rows:
                    logger.warning("seed_price_history: no data for %s", asset.symbol)
                    continue

                for row in rows:
                    date_val = row["date"]
                    existing = session.query(PriceHistory).filter(
                        PriceHistory.asset_id == asset.id,
                        func.date(PriceHistory.date) == date_val.date() if hasattr(date_val, "date") else date_val,
                    ).first()
                    if existing:
                        existing.open_price = row["open"]
                        existing.high = row["high"]
                        existing.low = row["low"]
                        existing.close = row["close"]
                        existing.volume = row["volume"]
                    else:
                        session.add(PriceHistory(
                            asset_id=asset.id,
                            date=date_val,
                            open_price=row["open"],
                            high=row["high"],
                            low=row["low"],
                            close=row["close"],
                            volume=row["volume"],
                        ))

                asset.last_seeded_at = datetime.now(timezone.utc)
                session.commit()
                seeded += 1
                logger.info("seed_price_history: seeded %d candles for %s", len(rows), asset.symbol)

            except Exception as exc:
                session.rollback()
                logger.warning("seed_price_history: failed for %s: %s", asset.symbol, exc)

        if task_id:
            report_task_status(task_id, "SUCCESS")

        return {"status": "success", "seeded": seeded, "skipped": skipped}

    except Exception as exc:
        logger.exception("seed_price_history_task failed: %s", exc)
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        raise self.retry(exc=exc, countdown=120)
    finally:
        if session:
            session.close()


def _fetch_ohlcv(asset, days: int) -> list:
    """Fetch OHLCV rows for one asset from the appropriate source."""
    from app.shared.constants import AssetType

    sym = asset.symbol
    atype = asset.asset_type

    # Mutual fund: mfapi historical NAV (daily)
    if atype == AssetType.MUTUAL_FUND or (asset.sub_type and "mutual" in asset.sub_type):
        from app.modules.assets.providers.mfapi import MFAPIPriceProvider
        provider = MFAPIPriceProvider(None)
        raw = provider.get_historical_nav(sym, limit=days)
        rows = []
        for entry in raw:
            try:
                import datetime as dt
                d = dt.datetime.strptime(entry["date"], "%d-%m-%Y").replace(tzinfo=timezone.utc)
                nav = float(entry["nav"])
                rows.append({"date": d, "open": nav, "high": nav, "low": nav, "close": nav, "volume": 0})
            except Exception:
                pass
        return rows

    # Crypto: derive yfinance pair, fall back to CoinGecko when yfinance returns nothing.
    # CoinGecko resolves any ticker via search so new/rebranded coins work automatically.
    if atype == AssetType.CRYPTO:
        parts = sym.split("-")
        base = parts[0]
        yf_sym = f"{base}-{parts[1]}" if len(parts) >= 2 else sym
        rows = _yfinance_ohlcv(yf_sym, days)
        if not rows:
            logger.debug("_fetch_ohlcv: yfinance empty for %s, trying CoinGecko", yf_sym)
            rows = _coingecko_ohlcv(base, days)
        return rows

    # Equity: use yfinance directly
    return _yfinance_ohlcv(sym, days)


def _coingecko_ohlcv(base: str, days: int) -> list:
    """CoinGecko OHLCV fallback for crypto. Resolves any ticker via search — no static map needed."""
    import time
    from app.modules.portfolio.providers.price.coingecko import CoinGeckoProvider
    time.sleep(1)  # avoid 429 when called after multiple back-to-back yfinance attempts
    provider = CoinGeckoProvider()
    return provider.get_ohlcv(base, days)


def _yfinance_ohlcv(yf_symbol: str, days: int) -> list:
    """Fetch OHLCV from yfinance for given symbol."""
    try:
        import yfinance as yf
        period = "1y" if days <= 365 else "2y"
        ticker = yf.Ticker(yf_symbol)
        hist = ticker.history(period=period, auto_adjust=True)
        if hist.empty:
            return []
        rows = []
        for ts, row in hist.iterrows():
            d = ts.to_pydatetime().replace(tzinfo=timezone.utc)
            rows.append({
                "date": d,
                "open": float(row.get("Open", row["Close"])),
                "high": float(row.get("High", row["Close"])),
                "low": float(row.get("Low", row["Close"])),
                "close": float(row["Close"]),
                "volume": float(row.get("Volume", 0)),
            })
        return rows
    except Exception as exc:
        logger.debug("yfinance ohlcv failed for %s: %s", yf_symbol, exc)
        return []


# ---------------------------------------------------------------------------
# Fundamentals seeding
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="portfolio.seed_fundamentals", max_retries=1)
def seed_fundamentals_task(self, symbol: Optional[str] = None):
    """Fetch and cache fundamental data for portfolio assets from yfinance."""
    session = None
    task_id = getattr(self.request, "id", None)
    try:
        import math
        import yfinance as yf
        from app.modules.portfolio.models import Asset
        from app.modules.analytics.models import Fundamentals
        from app.shared.constants import AssetType
        from app.core.cache import cache
        from app.shared.utils import cache_key

        session = SessionLocal()
        if symbol:
            assets = session.query(Asset).filter(Asset.symbol == symbol).all()
        else:
            assets = session.query(Asset).all()

        updated = 0
        for asset in assets:
            if asset.asset_type == AssetType.MUTUAL_FUND:
                continue
            try:
                # Determine yfinance symbol
                if asset.asset_type == AssetType.CRYPTO:
                    parts = asset.symbol.split("-")
                    yf_sym = f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else asset.symbol
                else:
                    yf_sym = asset.symbol

                info = yf.Ticker(yf_sym).info or {}

                def _g(key):
                    val = info.get(key)
                    try:
                        return float(val) if val is not None else None
                    except (TypeError, ValueError):
                        return None

                pe_ratio = _g("trailingPE")
                eps = _g("trailingEps")
                book_val = _g("bookValue")
                market_cap = _g("marketCap")
                high_52w = _g("fiftyTwoWeekHigh")
                low_52w = _g("fiftyTwoWeekLow")

                graham_number = None
                if eps and book_val and eps > 0 and book_val > 0:
                    try:
                        graham_number = round(math.sqrt(22.5 * eps * book_val), 2)
                    except Exception:
                        pass

                # Cache full fundamentals dict in Redis (24h TTL)
                fund_data = {
                    "pe_ratio": pe_ratio,
                    "eps": eps,
                    "graham_number": graham_number,
                    "market_cap": market_cap,
                    "high_52w": high_52w,
                    "low_52w": low_52w,
                }
                cache.set(cache_key("fundamentals", asset.symbol), fund_data, ttl=86400)

                # Upsert basic fields to Fundamentals DB table
                record = session.query(Fundamentals).filter_by(symbol=asset.symbol).first()
                if record:
                    record.pe_ratio = pe_ratio
                    record.eps = eps
                    record.market_cap = market_cap
                    record.high_52w = high_52w
                    record.low_52w = low_52w
                else:
                    session.add(Fundamentals(
                        symbol=asset.symbol,
                        pe_ratio=pe_ratio,
                        eps=eps,
                        market_cap=market_cap,
                        high_52w=high_52w,
                        low_52w=low_52w,
                    ))
                session.commit()
                updated += 1
                logger.info("seed_fundamentals: updated %s pe=%.2f graham=%s",
                            asset.symbol, pe_ratio or 0, graham_number)

            except Exception as exc:
                session.rollback()
                logger.warning("seed_fundamentals: failed for %s: %s", asset.symbol, exc)

        if task_id:
            report_task_status(task_id, "SUCCESS")

        return {"status": "success", "updated": updated}

    except Exception as exc:
        logger.exception("seed_fundamentals_task failed: %s", exc)
        if task_id:
            report_task_status(task_id, "FAILED", error=str(exc))
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()


@celery_app.task(name="portfolio.compute_state")
def compute_state_task():
    """Pre-compute /api/aureon/state per user and write to Redis.

    Iterates all users with at least one position and caches their state
    under cache_key("aureon", "state", str(user_id)). The /api/aureon/state
    endpoint reads this key on cache-hit, falling back to live computation.
    """
    from app.modules.aureon.services import build_aureon_state
    from app.modules.portfolio.models import Position
    from app.shared.utils import cache_key as _ck

    session = None
    try:
        session = SessionLocal()
        # Fetch distinct user_ids that have at least one position.
        user_ids = [
            uid for (uid,) in
            session.query(Position.user_id).filter(Position.user_id.isnot(None)).distinct().all()
        ]
        if not user_ids:
            logger.info("compute_state_task: no users with positions, skipping")
            return {"status": "success", "users": 0}

        total_assets = 0
        for uid in user_ids:
            try:
                result = build_aureon_state(session, user_id=uid)
                cache.set(_ck("aureon", "state", str(uid)), result, ttl=1200)
                total_assets += len(result.get("holdings", []))
                logger.info("compute_state_task: cached state for user_id=%d", uid)
            except Exception as exc:
                logger.exception("compute_state_task: failed for user_id=%d: %s", uid, exc)
                session.rollback()

        return {"status": "success", "users": len(user_ids), "assets": total_assets}
    except Exception as exc:
        logger.exception("compute_state_task failed: %s", exc)
        raise
    finally:
        if session:
            session.close()


@celery_app.task(name="portfolio.refresh_watchlist", bind=True)
def refresh_watchlist_prices_task(self):
    """Verify all watchlisted symbols have a current price in the Asset table.

    Asset.current_price is kept fresh by refresh_prices_task. This task checks
    that every watchlisted symbol is priced and logs any that are missing,
    so operators can detect stale symbols before users notice.
    """
    from app.modules.portfolio.models import Asset
    from app.modules.watchlist.models import WatchlistSymbol

    session = None
    try:
        session = SessionLocal()
        symbols = {
            row.symbol for row in session.query(WatchlistSymbol.symbol).distinct().all()
        }
        if not symbols:
            logger.info("refresh_watchlist_prices: no watchlist symbols found")
            return {"status": "success", "symbols": 0}

        assets = (
            session.query(Asset)
            .filter(Asset.symbol.in_(symbols), Asset.current_price.isnot(None))
            .all()
        )
        priced = {a.symbol for a in assets}
        missing = symbols - priced
        if missing:
            logger.warning("refresh_watchlist_prices: %d symbols have no price: %s", len(missing), sorted(missing))

        logger.info("refresh_watchlist_prices: %d/%d symbols priced", len(priced), len(symbols))
        return {"status": "success", "symbols": len(priced), "missing": sorted(missing)}
    except Exception as exc:
        logger.exception("refresh_watchlist_prices failed: %s", exc)
        raise
    finally:
        if session:
            session.close()


@celery_app.task(name="portfolio.fetch_fx_rate")
def fetch_fx_rate_task():
    try:
        resp = httpx.get("https://api.frankfurter.dev/v1/latest?from=USD&to=INR", timeout=10, follow_redirects=True)
        resp.raise_for_status()
        rate = float(resp.json()["rates"]["INR"])
        cache.set(cache_key("fx", "usd_inr"), rate, ttl=14400)
        logger.info("fetch_fx_rate: USD/INR=%.4f", rate)
        return rate
    except Exception as exc:
        logger.warning("fetch_fx_rate: failed: %s", exc)
        return None
