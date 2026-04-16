"""FastAPI application factory and startup."""

import logging
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.core.db import engine, Base
from app.core.logger import correlation_id_var, setup_master_logger
from app.modules.analytics.routes import router as analytics_router
from app.modules.assets.routes import router as assets_router
from app.modules.auth.routes import router as auth_router
from app.modules.backtesting.routes import router as backtesting_router
from app.modules.config.routes import router as config_router
from app.modules.news.routes import router as news_router
from app.modules.notification.routes import router as notification_router
from app.modules.pipeline.routes import router as pipeline_router
from app.modules.portfolio.routes import router as portfolio_router
from app.modules.signals.routes import router as signals_router
from app.modules.transactions.routes import router as transactions_router
from app.modules.users.routes import router as users_router
from app.shared.exceptions import AppException

setup_master_logger()
logger = logging.getLogger("app")


def register_models() -> None:
    """Import all models so SQLAlchemy metadata includes every table exactly once."""
    from app.modules.analytics import models as _analytics  # noqa: F401
    from app.modules.backtesting import models as _backtesting  # noqa: F401
    from app.modules.config import models as _config  # noqa: F401
    from app.modules.news import models as _news  # noqa: F401
    from app.modules.notification import models as _notification  # noqa: F401
    from app.modules.portfolio import models as _portfolio  # noqa: F401
    from app.modules.signals import models as _signals  # noqa: F401
    from app.modules.transactions import models as _transactions  # noqa: F401
    from app.modules.users import models as _users  # noqa: F401
    # auth/models imports User from users — no separate import needed


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup → shutdown."""
    logger.info("Application starting...")
    register_models()
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Seed default config (idempotent)
    from app.core.db import SessionLocal
    from app.modules.config.services import ConfigService
    with SessionLocal() as db:
        ConfigService.seed_defaults(db)

    yield
    logger.info("Application shutting down...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.api_title,
        version=settings.api_version,
        docs_url=settings.api_docs_url,
        redoc_url=settings.api_redoc_url,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    # Correlation ID
    @app.middleware("http")
    async def add_correlation_id(request: Request, call_next):
        request.state.correlation_id = str(uuid.uuid4())[:8]
        token = correlation_id_var.set(request.state.correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = request.state.correlation_id
            return response
        finally:
            correlation_id_var.reset(token)

    # App-level exception handler
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=400,
            content={"error": exc.code, "message": exc.message},
        )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(portfolio_router)
    app.include_router(signals_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(assets_router)
    app.include_router(transactions_router)
    app.include_router(analytics_router)
    app.include_router(news_router)
    app.include_router(backtesting_router)
    app.include_router(pipeline_router)
    app.include_router(notification_router)
    app.include_router(config_router)   # DB-backed profile, providers, jobs

    # ── Health ────────────────────────────────────────────────────────────
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "version": settings.api_version}

    # ── Frontend URL aliases ──────────────────────────────────────────────
    # Short paths the frontend was built against. Canonical routes live in
    # the module routers; only aliases not covered by an existing router
    # are kept here.
    #
    # Removed aliases (use the canonical endpoints instead):
    #   POST /api/price      → POST /api/assets/price
    #   GET  /api/chart/{s}  → GET  /api/assets/{symbol}/chart

    @app.post("/api/sync")
    def sync_alias(broker: str = "binance", force_refresh: bool = True, dry_run: bool = False):
        logger.info(
            "sync_alias called broker=%s force_refresh=%s dry_run=%s (deprecated; prefer /api/portfolio/sync)",
            broker,
            force_refresh,
            dry_run,
        )
        from app.tasks.portfolio import sync_portfolio_task
        task = sync_portfolio_task.delay(broker=broker, force_refresh=force_refresh, dry_run=dry_run)
        return {
            "status": "enqueued",
            "task_id": task.id,
            "broker": broker,
            "force_refresh": force_refresh,
            "dry_run": dry_run,
            "deprecated": True,
            "canonical_endpoint": "/api/portfolio/sync",
        }

    # AI route aliases (frontend uses /api/ai/*, routes live at /api/analytics/ai/*)
    @app.post("/api/ai/global")
    def ai_global_alias():
        from app.core.cache import cache
        from app.shared.utils import cache_key
        cached = cache.get(cache_key("ai", "briefing"))
        if cached:
            return {"status": "cached", "data": cached}
        from app.tasks.ai import global_briefing_task
        task = global_briefing_task.delay()
        return {"status": "processing", "task_id": task.id}

    @app.post("/api/ai/single/{symbol}")
    def ai_single_alias(symbol: str):
        from app.core.cache import cache
        from app.shared.utils import cache_key
        cached = cache.get(cache_key("ai", "single", symbol))
        if cached:
            return {"status": "cached", "data": cached}
        from app.tasks.ai import single_asset_briefing_task
        task = single_asset_briefing_task.delay(symbol=symbol)
        return {"status": "processing", "task_id": task.id}

    @app.post("/api/ai/news/batch")
    def ai_news_batch_alias():
        from app.tasks.ai import news_sentiment_task
        task = news_sentiment_task.delay()
        return {"status": "enqueued", "task_id": task.id}

    @app.post("/api/sync/hard-refresh")
    def hard_refresh_alias():
        from app.tasks.portfolio import refresh_prices_task, sync_portfolio_task
        tasks = [sync_portfolio_task.delay(broker=b) for b in ["zerodha", "groww", "binance"]]
        price_task = refresh_prices_task.delay()
        return {
            "status": "enqueued",
            "sync_task_ids": [t.id for t in tasks],
            "price_task_id": price_task.id,
        }

    # ── /api/state — composite portfolio view ─────────────────────────────
    @app.get("/api/state")
    def get_state():
        import json
        from datetime import datetime, timedelta
        from app.core.cache import cache
        from app.core.db import SessionLocal
        from app.shared.utils import cache_key as ck
        from app.modules.portfolio.models import PriceHistory
        from app.modules.portfolio.services import PortfolioService
        from app.modules.news.models import News
        from app.modules.analytics.models import AIBriefing, TechnicalIndicators

        session = SessionLocal()
        try:
            svc = PortfolioService(session)
            positions = svc.list_positions()

            _empty_health = {"beta": 0.0, "allocation": {}, "correlation_matrix": {}}
            _alt = {
                "fear_and_greed": {"value": 50, "classification": "Neutral"},
                "fii_proxy": {"dxy_value": 100.0, "fii_trend": "UNKNOWN"},
            }

            if not positions:
                return {
                    "status": "empty",
                    "total_value_inr": 0,
                    "fx_rate": 83.50,
                    "assets": [],
                    "health": _empty_health,
                    "briefing": None,
                    "news": {},
                    "alt_metrics": _alt,
                }

            # ── Briefing: Redis cache → DB fallback ──────────────────────
            briefing = cache.get(ck("ai", "briefing"))
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

            # ── News: DB → map field names, build structured sentiment ───
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
                    "id":       row.id,
                    "title":    row.title,
                    "snippet":  row.summary,
                    "link":     row.url,
                    "provider": row.source or "RSS",
                    "sentiment": sentiment,
                })

            # ── Technical indicators: one query for all symbols ──────────
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

            # ── Signals: one query for all symbols ───────────────────────
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

            # ── Price history for ATR% + Fibonacci (one batched query) ───
            cutoff_120 = datetime.utcnow() - timedelta(days=120)
            prices_by_asset_id: dict = {}
            if asset_ids:
                for p in (
                    session.query(PriceHistory)
                    .filter(
                        PriceHistory.asset_id.in_(asset_ids),
                        PriceHistory.date >= cutoff_120,
                    )
                    .order_by(PriceHistory.asset_id, PriceHistory.date)
                    .all()
                ):
                    prices_by_asset_id.setdefault(p.asset_id, []).append(p)

            # ── Build asset list ─────────────────────────────────────────
            assets_out = []
            total_value = 0.0
            allocation: dict = {}

            for pos in positions:
                a = pos.asset
                if not a:
                    continue
                value = pos.current_value or 0.0
                total_value += value
                asset_type = a.asset_type.value.lower() if a.asset_type else "equity"
                allocation[asset_type] = round(allocation.get(asset_type, 0.0) + value, 2)

                tech = tech_by_symbol.get(a.symbol)
                ph   = prices_by_asset_id.get(a.id, [])
                sig  = signals_by_symbol.get(a.symbol)

                # ATR% and Fibonacci from recent price history
                price_risk_pct = fib_618 = fib_382 = None
                if ph and len(ph) >= 14:
                    closes = [float(p.close) for p in ph]
                    highs  = [float(p.high or p.close) for p in ph]
                    lows   = [float(p.low or p.close) for p in ph]
                    trs = [
                        max(highs[i] - lows[i],
                            abs(highs[i] - closes[i - 1]),
                            abs(lows[i]  - closes[i - 1]))
                        for i in range(1, len(ph))
                    ]
                    if trs:
                        atr = sum(trs[-14:]) / min(14, len(trs))
                        cur = closes[-1] or 1
                        price_risk_pct = round((atr / cur) * 100, 2)
                    if len(ph) >= 20:
                        h120 = max(highs)
                        l120 = min(lows)
                        rng  = h120 - l120
                        if rng > 0:
                            fib_618 = round(h120 - 0.618 * rng, 2)
                            fib_382 = round(h120 - 0.382 * rng, 2)

                # Composite technical score
                score = 50
                if tech:
                    if tech.rsi:
                        rsi = float(tech.rsi)
                        if   rsi > 70: score -= 10
                        elif rsi < 30: score += 15
                        elif rsi > 55: score += 7
                        elif rsi < 45: score -= 7
                    if tech.macd:
                        score += 10 if float(tech.macd) > 0 else -10
                technical_score = max(0, min(100, score))

                assets_out.append({
                    "symbol":     a.symbol,
                    "name":       a.name,
                    "type":       asset_type,
                    "qty":        float(pos.quantity or 0),
                    "live_price": float(a.current_price or 0),
                    "value_inr":  float(value),
                    "gross_value_inr": float(value),
                    "pnl":        float(pos.pnl or 0),
                    "pnl_pct":    float(pos.pnl_percent or 0),
                    "tv_signal":  sig.signal_type.value if sig and sig.signal_type else None,
                    # Technical enrichment
                    "momentum_rsi":       float(tech.rsi)              if tech and tech.rsi              else None,
                    "trend_strength":     float(tech.macd)             if tech and tech.macd             else None,
                    "bb_upper":           float(tech.bollinger_upper)  if tech and tech.bollinger_upper  else None,
                    "bb_lower":           float(tech.bollinger_lower)  if tech and tech.bollinger_lower  else None,
                    "vwap_volume_profile":float(tech.vwap)             if tech and tech.vwap             else None,
                    "price_risk_pct":     price_risk_pct,
                    "fib_618":            fib_618,
                    "fib_382":            fib_382,
                    "technical_score":    technical_score,
                })

            return {
                "status": "success",
                "total_value_inr": total_value,
                "fx_rate": 83.50,
                "assets": assets_out,
                "health": {
                    "beta": 0.0,
                    "allocation": allocation,
                    "correlation_matrix": {},
                },
                "briefing":    briefing,
                "news":        news,
                "alt_metrics": _alt,
            }
        finally:
            session.close()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
