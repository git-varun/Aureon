"""FastAPI application factory and startup."""

import asyncio
import logging
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.core.db import engine, Base
from app.core.limiter import limiter
from app.core.logger import correlation_id_var, setup_master_logger
from app.modules.analytics.routes import router as analytics_router
from app.modules.assets.routes import router as assets_router
from app.modules.aureon.routes import router as aureon_router
from app.modules.auth.routes import router as auth_router
from app.modules.config.routes import router as config_router
from app.modules.news.routes import router as news_router
from app.modules.notification.routes import router as notification_router
from app.modules.pipeline.routes import router as pipeline_router
from app.modules.portfolio.routes import router as portfolio_router
from app.modules.recommendations.routes import router as recommendations_router
from app.modules.market.routes import router as market_router
from app.modules.signals.routes import router as signals_router
from app.modules.users.routes import router as users_router
from app.modules.watchlist.routes import router as watchlist_router
from app.modules.health.routes import router as health_router
from app.shared.exceptions import AppException, NotFoundError, ConflictError, ValidationError, DataFetchError

setup_master_logger()
logger = logging.getLogger("app")

def register_models() -> None:
    """Import all models so SQLAlchemy metadata includes every table exactly once."""
    from app.modules.analytics import models as _analytics  # noqa: F401
    from app.modules.config import models as _config  # noqa: F401
    from app.modules.news import models as _news  # noqa: F401
    from app.modules.notification import models as _notification  # noqa: F401
    from app.modules.portfolio import models as _portfolio  # noqa: F401
    from app.modules.recommendations import models as _recommendations  # noqa: F401
    from app.modules.signals import models as _signals  # noqa: F401
    from app.modules.users import models as _users  # noqa: F401
    from app.modules.watchlist import models as _watchlist  # noqa: F401
    from app.modules.market import models as _market  # noqa: F401
    # auth/models imports User from users — no separate import needed


def _run_migrations() -> None:
    """Run all pending Alembic migrations programmatically.

    Falls back to create_all if the alembic/versions/ directory is empty
    (i.e., before the baseline revision is generated).
    """
    from pathlib import Path as _Path
    versions_dir = _Path(__file__).resolve().parent.parent / "alembic" / "versions"
    has_migrations = any(versions_dir.glob("*.py"))

    if has_migrations:
        from alembic import command
        from alembic.config import Config as AlembicConfig
        alembic_cfg = AlembicConfig(str(_Path(__file__).resolve().parent.parent / "alembic.ini"))
        command.upgrade(alembic_cfg, "head")
    else:
        # Bootstrap path: no revisions yet — use create_all so the app can start.
        # Run `alembic revision --autogenerate -m "baseline"` then `alembic stamp head`
        # on an existing install to switch to the migration-managed path.
        logger.warning("No Alembic revisions found — falling back to create_all. "
                       "Generate a baseline revision and stamp existing installs.")
        Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup → shutdown."""
    logger.info("Application starting...")
    register_models()

    # Run Alembic migrations (retry loop handles startup race conditions/DNS lag)
    from sqlalchemy.exc import OperationalError
    max_retries = 5
    for i in range(max_retries):
        try:
            _run_migrations()
            logger.info("Database migrations applied")
            break
        except OperationalError as e:
            if i == max_retries - 1:
                logger.error("Could not connect to database after %d retries. Last error: %s", max_retries, e)
                raise
            logger.warning("Database connection failed (attempt %d/%d), retrying in 2s... Error: %s", i + 1,
                           max_retries, e)
            await asyncio.sleep(2)

    from app.core.db_patcher import run_patches
    run_patches(engine)
    logger.info("Schema patches applied")

    # Seed default config (idempotent)
    from app.core.db import SessionLocal
    from app.modules.config.services import ConfigService
    from app.modules.market.services import seed_themes
    with SessionLocal() as db:
        ConfigService.seed_defaults(db)
        seed_themes(db)

    yield
    logger.info("Application shutting down...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.api_title,
        version=settings.api_version,
        docs_url="/docs" if settings.enable_api_docs else None,
        redoc_url="/redoc" if settings.enable_api_docs else None,
        lifespan=lifespan,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Correlation-ID"],
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
        status_codes = {
            NotFoundError: 404,
            ConflictError: 409,
            ValidationError: 422,
            DataFetchError: 502,
        }
        status_code = status_codes.get(type(exc), 400)
        return JSONResponse(
            status_code=status_code,
            content={"error": exc.code, "message": exc.message},
        )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(portfolio_router)
    app.include_router(signals_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(assets_router)
    app.include_router(analytics_router)
    app.include_router(news_router)
    app.include_router(pipeline_router)
    app.include_router(notification_router)
    app.include_router(config_router)  # DB-backed profile, providers, jobs
    app.include_router(recommendations_router)  # Aureon decision-units
    app.include_router(aureon_router)  # Aureon composite endpoints
    app.include_router(market_router)  # Market data — indices, sectors, movers, themes, universe
    app.include_router(watchlist_router)  # Per-user watchlists
    app.include_router(health_router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
