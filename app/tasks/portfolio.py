"""Portfolio Celery tasks: sync, refresh prices, enrich technicals, seed OHLCV history."""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.cache import cache
from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.modules.portfolio.services import PortfolioService
from app.shared.utils import cache_key

logger = logging.getLogger("celery.portfolio")


@celery_app.task(bind=True, name="portfolio.sync")
def sync_portfolio_task(self, broker: str, force_refresh: bool = True, dry_run: bool = False):
    """Sync portfolio holdings from broker via real provider factory.

    Returns a structured result with stage, counts, and any errors so that
    AsyncResult polling surfaces meaningful progress.
    """
    logger.info(
        "[sync:%s] task started task_id=%s force_refresh=%s dry_run=%s.",
        broker,
        getattr(self.request, "id", None),
        force_refresh,
        dry_run,
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
    except ValueError as exc:
        logger.error("[sync:%s] unsupported broker: %s", broker, exc)
        if cred_session:
            cred_session.close()
        return {"status": "error", "broker": broker, "stage": "resolve", "errors": [str(exc)]}

    # ── Stage 2: credential validation ──────────────────────────────────────
    try:
        provider.validate_credentials()
        logger.info("[sync:%s] credentials validated", broker)
    except Exception as exc:
        logger.error("[sync:%s] credential validation failed: %s", broker, exc)
        if cred_session:
            cred_session.close()
        return {"status": "error", "broker": broker, "stage": "validation", "errors": [str(exc)]}

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
        result = service.sync_portfolio(provider, force_refresh=force_refresh, dry_run=dry_run)
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
    try:
        logger.info("refresh_prices_task: symbol=%s", symbol or "all")
        from app.modules.assets.services import AssetsService
        session = SessionLocal()
        result = AssetsService(session).refresh_prices(symbol=symbol)
        logger.info("refresh_prices_task: %s", result)
        compute_state_task.delay()
        return result
    except Exception as exc:
        logger.exception("refresh_prices_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
    finally:
        if session is not None:
            session.close()


@celery_app.task(bind=True, name="portfolio.enrich_technicals")
def enrich_technicals_task(self, symbol: str):
    """Compute technical indicators for an asset. Delegates to QuantEngine (Phase 3)."""
    try:
        logger.info(f"Enriching technicals for {symbol}")
        session = SessionLocal()
        service = PortfolioService(session)

        asset = service.get_asset(symbol)
        if not asset:
            session.close()
            raise ValueError(f"Asset {symbol} not found")

        from app.modules.portfolio.models import PriceHistory
        prices = (
            session.query(PriceHistory)
            .filter_by(asset_id=asset.id)
            .order_by(PriceHistory.date)
            .all()
        )
        session.close()

        if len(prices) < 14:
            logger.warning(f"Insufficient history for {symbol}: {len(prices)} candles")
            return {"status": "skip", "reason": "insufficient_history", "symbol": symbol}

        from app.shared.quant import QuantEngine
        technicals = QuantEngine().compute_all(prices)

        # Upsert TechnicalIndicators row for this symbol
        session2 = SessionLocal()
        try:
            from app.modules.analytics.models import TechnicalIndicators
            record = session2.query(TechnicalIndicators).filter_by(symbol=symbol).first()
            macd_dict = technicals.get("macd") or {}
            bollinger_dict = technicals.get("bollinger") or {}
            if record:
                record.rsi             = technicals.get("rsi_14")
                record.macd            = macd_dict.get("value")
                record.bollinger_upper = bollinger_dict.get("upper")
                record.bollinger_lower = bollinger_dict.get("lower")
                record.vwap = technicals.get("vwap")
            else:
                record = TechnicalIndicators(
                    symbol=symbol,
                    rsi=technicals.get("rsi_14"),
                    macd=macd_dict.get("value"),
                    bollinger_upper=bollinger_dict.get("upper"),
                    bollinger_lower=bollinger_dict.get("lower"),
                    vwap=technicals.get("vwap"),
                )
                session2.add(record)
            session2.commit()
        except Exception as db_exc:
            logger.warning(f"TechnicalIndicators DB write failed for {symbol}: {db_exc}")
            session2.rollback()
        finally:
            session2.close()

        cache.set(cache_key("technicals", symbol), technicals, ttl=3600)
        logger.info(f"Technicals enriched and cached for {symbol}")
        return {"status": "success", "symbol": symbol, "technicals": technicals}

    except Exception as exc:
        logger.exception(f"Technical enrichment failed for {symbol}: {exc}")
        raise self.retry(exc=exc, countdown=30, max_retries=2)


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
    try:
        from app.modules.portfolio.models import Asset, PriceHistory
        from app.shared.constants import AssetType
        from sqlalchemy import func

        session = SessionLocal()
        if symbol:
            assets = session.query(Asset).filter(Asset.symbol == symbol).all()
        else:
            assets = session.query(Asset).all()

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

        return {"status": "success", "seeded": seeded, "skipped": skipped}

    except Exception as exc:
        logger.exception("seed_price_history_task failed: %s", exc)
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
    """Fetch and cache fundamental data for portfolio assets from yfinance.

    Stores results in Redis (24h TTL) for fast access by /api/state, and
    upserts pe_ratio / eps into the Fundamentals DB table.
    Skips mutual funds and assets with no yfinance coverage.
    """
    session = None
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

        return {"status": "success", "updated": updated}

    except Exception as exc:
        logger.exception("seed_fundamentals_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()


@celery_app.task(name="portfolio.compute_state")
def compute_state_task():
    """Pre-compute /api/state and write to Redis. Run after every price refresh."""
    import json
    import math
    import statistics as _stats
    from datetime import datetime, timedelta, timezone

    def _sf(v, default=None):
        if v is None:
            return default
        try:
            f = float(v)
            return default if (math.isnan(f) or math.isinf(f)) else f
        except (TypeError, ValueError):
            return default

    session = None
    try:
        from app.modules.portfolio.models import PriceHistory
        from app.modules.portfolio.services import PortfolioService
        from app.modules.news.models import News
        from app.modules.analytics.models import AIBriefing, TechnicalIndicators, Fundamentals

        session = SessionLocal()
        svc = PortfolioService(session)
        positions = svc.list_positions()

        try:
            from app.modules.analytics.macro import FearGreedProvider, DXYProvider
            _alt = {
                "fear_and_greed": FearGreedProvider().fetch(),
                "fii_proxy": DXYProvider().fetch(),
            }
        except Exception:
            _alt = {
                "fear_and_greed": {"value": 50, "classification": "Neutral"},
                "fii_proxy": {"dxy_value": 100.0, "fii_trend": "UNKNOWN"},
            }

        fx_rate = cache.get(cache_key("fx", "usd_inr")) or 83.50

        if not positions:
            result = {
                "status": "empty",
                "total_value_inr": 0,
                "fx_rate": fx_rate,
                "assets": [],
                "health": {"beta": 0.0, "allocation": {}, "correlation_matrix": {}},
                "briefing": None,
                "news": {},
                "alt_metrics": _alt,
            }
            cache.set(cache_key("state", "computed"), result, ttl=1200)
            return result

        briefing = cache.get(cache_key("ai", "briefing"))
        if not briefing:
            db_briefing = (
                session.query(AIBriefing)
                .filter(AIBriefing.briefing_type == "global")
                .order_by(AIBriefing.created_at.desc())
                .first()
            )
            if db_briefing and db_briefing.content:
                try:
                    briefing = json.loads(db_briefing.content)
                except Exception:
                    briefing = None

        news_rows = (
            session.query(News)
            .order_by(News.published_at.desc())
            .limit(60)
            .all()
        )
        news: dict = {}
        for row in news_rows:
            sym_key = (row.symbols or "GENERAL").split(",")[0].strip()
            news.setdefault(sym_key, [])
            sentiment = None
            if row.sentiment_score is not None:
                score = float(row.sentiment_score)
                bias = "POSITIVE" if score > 0.1 else "NEGATIVE" if score < -0.1 else "NEUTRAL"
                sentiment = {
                    "bias": bias,
                    "confidence": round(abs(score) * 100, 1),
                    "impact_summary": row.summary or "No additional context available.",
                }
            news[sym_key].append({
                "id": row.id, "title": row.title, "snippet": row.summary,
                "link": row.url, "provider": row.source or "RSS", "sentiment": sentiment,
            })

        symbols = [pos.asset.symbol for pos in positions if pos.asset]
        asset_ids = [pos.asset_id for pos in positions]

        tech_by_symbol: dict = {}
        if symbols:
            for row in (
                    session.query(TechnicalIndicators)
                            .filter(TechnicalIndicators.symbol.in_(symbols))
                            .order_by(TechnicalIndicators.symbol, TechnicalIndicators.created_at.desc())
                            .all()
            ):
                if row.symbol not in tech_by_symbol:
                    tech_by_symbol[row.symbol] = row

        signals_by_symbol: dict = {}
        try:
            from app.modules.signals.models import Signal
            for row in (
                    session.query(Signal)
                            .filter(Signal.symbol.in_(symbols))
                            .order_by(Signal.symbol, Signal.created_at.desc())
                            .all()
            ):
                if row.symbol not in signals_by_symbol:
                    signals_by_symbol[row.symbol] = row
        except Exception:
            pass

        fund_by_symbol: dict = {}
        if symbols:
            for row in session.query(Fundamentals).filter(Fundamentals.symbol.in_(symbols)).all():
                fund_by_symbol[row.symbol] = row

        cutoff_120 = datetime.now(timezone.utc) - timedelta(days=200)
        prices_by_asset_id: dict = {}
        if asset_ids:
            for p in (
                    session.query(PriceHistory)
                            .filter(PriceHistory.asset_id.in_(asset_ids), PriceHistory.date >= cutoff_120)
                            .order_by(PriceHistory.asset_id, PriceHistory.date)
                            .all()
            ):
                prices_by_asset_id.setdefault(p.asset_id, []).append(p)

        assets_out = []
        total_value = 0.0
        allocation: dict = {}

        for pos in positions:
            a = pos.asset
            if not a:
                continue
            value = _sf(pos.current_value, 0.0)
            total_value += value
            asset_type = a.asset_type.value.lower() if a.asset_type else "equity"
            allocation[asset_type] = round(allocation.get(asset_type, 0.0) + value, 2)

            tech = tech_by_symbol.get(a.symbol)
            ph = prices_by_asset_id.get(a.id, [])
            sig = signals_by_symbol.get(a.symbol)

            price_risk_pct = fib_618 = fib_382 = None
            if ph and len(ph) >= 14:
                closes = [_sf(p.close, 0.0) for p in ph]
                highs = [_sf(p.high or p.close, 0.0) for p in ph]
                lows = [_sf(p.low or p.close, 0.0) for p in ph]
                trs = [
                    max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
                    for i in range(1, len(ph))
                ]
                if trs:
                    atr = sum(trs[-14:]) / min(14, len(trs))
                    cur = closes[-1] or 1
                    price_risk_pct = round((atr / cur) * 100, 2)
                if len(ph) >= 20:
                    h120 = max(highs)
                    l120 = min(lows)
                    rng = h120 - l120
                    if rng > 0:
                        fib_618 = round(h120 - 0.618 * rng, 2)
                        fib_382 = round(h120 - 0.382 * rng, 2)

            quant_result: dict = {}
            _quant_ck = cache_key("quant", a.symbol)
            cached_quant = cache.get(_quant_ck)
            if cached_quant:
                quant_result = cached_quant
            elif ph and len(ph) >= 14:
                from app.shared.quant import QuantEngine
                quant_result = QuantEngine().compute_all(ph)
                cache.set(_quant_ck, quant_result, ttl=3600)

            macd_dict = quant_result.get("macd") or {}
            bb_dict = quant_result.get("bollinger") or {}
            momentum_rsi = quant_result.get("rsi_14")
            trend_strength = macd_dict.get("value")
            bb_upper = bb_dict.get("upper")
            bb_lower = bb_dict.get("lower")
            vwap_val = quant_result.get("vwap")
            sma_100 = quant_result.get("sma_100")
            ema_105 = quant_result.get("ema_105")
            atr_50_val = quant_result.get("atr_50")
            sma_200 = quant_result.get("sma_200")

            if momentum_rsi is None and tech:   momentum_rsi = _sf(tech.rsi)
            if trend_strength is None and tech: trend_strength = _sf(tech.macd)
            if bb_upper is None and tech:       bb_upper = _sf(tech.bollinger_upper)
            if bb_lower is None and tech:       bb_lower = _sf(tech.bollinger_lower)
            if vwap_val is None and tech:       vwap_val = _sf(tech.vwap)

            current_price = _sf(a.current_price, 0)
            bmsb_status = macro_tsl = target_1_2 = z_score = None

            if sma_100 and ema_105 and current_price:
                bmsb_status = (
                    "ABOVE BAND (HOLD)" if current_price > sma_100 and current_price > ema_105
                    else "BELOW BAND (RISK OFF)"
                )
            if atr_50_val and current_price:
                macro_tsl = round(current_price - 3.5 * atr_50_val, 2)
                target_1_2 = round(current_price + 2 * (current_price - macro_tsl), 2)
            if sma_200 and ph and len(ph) >= 200:
                closes_200 = [_sf(p.close, 0.0) for p in ph[-200:]]
                try:
                    std_200 = _stats.stdev(closes_200)
                    if std_200:
                        z_score = round((current_price - sma_200) / std_200, 2)
                except Exception:
                    pass

            score = 50
            if momentum_rsi is not None:
                if momentum_rsi > 70:
                    score -= 10
                elif momentum_rsi < 30:
                    score += 15
                elif momentum_rsi > 55:
                    score += 7
                elif momentum_rsi < 45:
                    score -= 7
            if trend_strength is not None:
                score += 10 if trend_strength > 0 else -10
            if bmsb_status and "ABOVE" in bmsb_status:
                score += 5
            technical_score = max(0, min(100, score))

            fund_cache = cache.get(cache_key("fundamentals", a.symbol)) or {}
            fund_db = fund_by_symbol.get(a.symbol)
            pe_ratio = fund_cache.get("pe_ratio") or (_sf(fund_db.pe_ratio) if fund_db else None)
            graham_number = fund_cache.get("graham_number")

            assets_out.append({
                "symbol": a.symbol, "name": a.name, "type": asset_type,
                "sub_type": a.sub_type, "source": a.exchange,
                "qty": _sf(pos.quantity, 0), "avg_buy_price": _sf(pos.avg_buy_price, 0),
                "live_price": _sf(a.current_price, 0), "value_inr": value,
                "gross_value_inr": value, "pnl": _sf(pos.pnl, 0),
                "pnl_pct": _sf(pos.pnl_percent, 0),
                "tv_signal": sig.signal_type.value if sig and sig.signal_type else None,
                "momentum_rsi": momentum_rsi, "trend_strength": trend_strength,
                "bb_upper": bb_upper, "bb_lower": bb_lower,
                "vwap_volume_profile": vwap_val, "bmsb_status": bmsb_status,
                "macro_tsl": macro_tsl, "target_1_2": target_1_2,
                "z_score": z_score, "price_risk_pct": price_risk_pct,
                "fib_618": fib_618, "fib_382": fib_382,
                "technical_score": technical_score,
                "pe_ratio": pe_ratio, "graham_number": graham_number,
                "altman_z_score": None, "delivery_pct": None,
            })

        result = {
            "status": "success",
            "total_value_inr": total_value,
            "fx_rate": fx_rate,
            "assets": assets_out,
            "health": {"beta": 0.0, "allocation": allocation, "correlation_matrix": {}},
            "briefing": briefing,
            "news": news,
            "alt_metrics": _alt,
        }
        cache.set(cache_key("state", "computed"), result, ttl=1200)
        logger.info("compute_state_task: cached %d assets total_value=%.2f", len(assets_out), total_value)
        return {"status": "success", "assets": len(assets_out)}

    except Exception as exc:
        logger.exception("compute_state_task failed: %s", exc)
        raise
    finally:
        if session:
            session.close()


@celery_app.task(name="portfolio.fetch_fx_rate")
def fetch_fx_rate_task():
    try:
        resp = httpx.get("https://api.frankfurter.app/latest?from=USD&to=INR", timeout=10)
        resp.raise_for_status()
        rate = float(resp.json()["rates"]["INR"])
        cache.set(cache_key("fx", "usd_inr"), rate, ttl=14400)
        logger.info("fetch_fx_rate: USD/INR=%.4f", rate)
        return rate
    except Exception as exc:
        logger.warning("fetch_fx_rate: failed: %s", exc)
        return None
