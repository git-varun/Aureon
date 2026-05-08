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
from app.modules.aureon.routes import router as aureon_router
from app.modules.auth.routes import router as auth_router
from app.modules.config.routes import router as config_router
from app.modules.news.routes import router as news_router
from app.modules.notification.routes import router as notification_router
from app.modules.pipeline.routes import router as pipeline_router
from app.modules.portfolio.routes import router as portfolio_router
from app.modules.recommendations.routes import router as recommendations_router
from app.modules.signals.routes import router as signals_router
from app.modules.users.routes import router as users_router
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
    # auth/models imports User from users — no separate import needed


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup → shutdown."""
    logger.info("Application starting...")
    register_models()
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    from app.core.db_patcher import run_patches
    run_patches(engine)
    logger.info("Schema patches applied")

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

    # ── Health ────────────────────────────────────────────────────────────
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "version": settings.api_version}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
