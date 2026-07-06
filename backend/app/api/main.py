import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1 import (
    ai,
    assets,
    auth,
    config,
    evaluation,
    intelligence,
    invitations,
    market,
    memberships,
    monitoring,
    news,
    notification,
    organizations,
    portfolio,
    recommendation,
    watchlist,
)
from app.api.v1.system import health
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.logging import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Startup initiated. Initializing Aureon API...", component="Startup")

    # Run environment startup validation (fail-fast)
    from app.core.validation import validate_environment
    validate_environment()

    # Run database migrations (auto-migrate)
    try:
        import os

        from alembic.config import Config
        from sqlalchemy import text

        from alembic import command
        from app.core.database import engine
        
        logger.info("Applying pending database migrations...")
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        ini_path = os.path.join(base_dir, "alembic.ini")
        alembic_cfg = Config(ini_path)
        
        if engine.dialect.name == "postgresql":
            with engine.connect() as conn:
                logger.info("Acquiring Postgres migration advisory lock...")
                conn.execute(text("SELECT pg_advisory_lock(74239847)"))
                try:
                    command.upgrade(alembic_cfg, "head")
                finally:
                    try:
                        conn.execute(text("SELECT pg_advisory_unlock(74239847)"))
                    except Exception as unlock_err:
                        logger.warning(f"Failed to release Postgres migration lock: {unlock_err}")
                logger.info("Database migrations applied successfully under lock.")
        else:
            command.upgrade(alembic_cfg, "head")
            logger.info("Database migrations applied successfully.")
    except Exception as e:
        logger.error(f"Failed to apply database migrations: {e}")
        raise RuntimeError(f"Startup check failed: Database migration failed. Error: {e}")
    
    # Seeding database defaults
    try:
        from app.core.database import SessionLocal
        from app.domain.services.config import ConfigService
        with SessionLocal() as db:
            ConfigService.seed_defaults(db)
        logger.info("Database seed completed successfully.")
    except Exception as e:
        logger.error(f"Failed to seed defaults: {e}")
        raise RuntimeError(f"Startup check failed: Database seeding failed. Error: {e}")

    # Bootstrap market universe if empty
    try:
        from app.core.database import SessionLocal
        from app.domain.entities.market import Asset
        with SessionLocal() as db:
            asset_count = db.query(Asset).count()
        if asset_count == 0:
            logger.info("market.assets is empty — triggering seed_market_universe_task via Celery")
            from app.workers.ingestion.tasks import seed_market_universe_task, seed_price_history_task
            seed_market_universe_task.delay()
            seed_price_history_task.delay()
        else:
            logger.info(f"market.assets has {asset_count} assets — skipping bootstrap seed")
    except Exception as e:
        logger.warning(f"Market bootstrap check failed (non-fatal): {e}")

    logger.info("Aureon API startup completed. Application ready.")
    yield
    
    logger.info("Shutdown initiated. Cleaning up active database connections...")
    engine.dispose()
    logger.info("Shutdown completed. Connections successfully closed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    debug=settings.DEBUG
)

# CORS Middleware
origins = list(settings.CORS_ALLOWED_ORIGINS)
if settings.DEBUG:
    localhost_origins = [
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]
    for lo in localhost_origins:
        if lo not in origins:
            origins.append(lo)

if origins:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )


from app.core.logging.middleware import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)


# These four handlers are the ONLY places that log a full traceback for a given
# exception (instrument()/http_client/redis wrapper log FAIL summaries only, to
# avoid dumping the same trace multiple times as it propagates up the call chain).

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    from app.core.observability.health import fingerprinter
    fingerprint = fingerprinter.register_error(exc)

    status_code = getattr(exc, "http_status", 400)
    category = getattr(exc, "category", "SYSTEM")
    severity = getattr(exc, "severity", "ERROR")
    retryable = getattr(exc, "retryable", False)

    logger.exception(
        f"{request.method} {request.url.path} - {exc.__class__.__name__}: {exc.message} (fingerprint={fingerprint})",
        component="HTTP", status="FAIL",
    )

    return JSONResponse(
        status_code=status_code,
        content={
            "detail": exc.message,
            "category": category,
            "severity": severity,
            "retryable": retryable,
            "fingerprint": fingerprint
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    from fastapi.exception_handlers import request_validation_exception_handler
    from app.core.observability.health import fingerprinter
    fingerprint = fingerprinter.register_error(exc)

    logger.exception(
        f"{request.method} {request.url.path} - validation error (fingerprint={fingerprint})",
        component="HTTP", status="FAIL",
    )
    resp = await request_validation_exception_handler(request, exc)
    # Inject fingerprint into the default JSON validation response
    try:
        import json
        body = json.loads(resp.body.decode("utf-8"))
        if isinstance(body, dict):
            body["fingerprint"] = fingerprint
            return JSONResponse(status_code=resp.status_code, content=body)
    except Exception:
        pass
    return resp


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    from fastapi.exception_handlers import http_exception_handler as default_http_exception_handler
    from app.core.observability.health import fingerprinter
    fingerprint = fingerprinter.register_error(exc)

    logger.exception(
        f"{request.method} {request.url.path} - HTTPException {exc.status_code}: {exc.detail} (fingerprint={fingerprint})",
        component="HTTP", status="FAIL",
    )
    resp = await default_http_exception_handler(request, exc)
    try:
        import json
        body = json.loads(resp.body.decode("utf-8"))
        if isinstance(body, dict):
            body["fingerprint"] = fingerprint
            return JSONResponse(status_code=resp.status_code, content=body)
    except Exception:
        pass
    return resp


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from app.core.observability.health import fingerprinter
    fingerprint = fingerprinter.register_error(exc)

    logger.exception(
        f"{request.method} {request.url.path} - unhandled exception: {exc} (fingerprint={fingerprint})",
        component="HTTP", status="FAIL",
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "fingerprint": fingerprint
        }
    )


app.include_router(health.router, prefix="/api/v1", tags=["system"])
app.include_router(market.router, prefix="/api/v1/market", tags=["market"])
app.include_router(assets.router, prefix="/api/v1", tags=["assets"])
app.include_router(portfolio.router, prefix="/api/v1/portfolio", tags=["portfolio"])
app.include_router(evaluation.router, prefix="/api/v1/evaluation", tags=["evaluation"])
app.include_router(monitoring.router, prefix="/api/v1/monitoring", tags=["monitoring"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(auth.users_router, prefix="/api/v1", tags=["auth"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["organizations"])
app.include_router(memberships.router, prefix="/api/v1/memberships", tags=["memberships"])
app.include_router(invitations.router, prefix="/api/v1/invitations", tags=["invitations"])
app.include_router(recommendation.router, prefix="/api/v1/recommendation", tags=["recommendation"])
app.include_router(recommendation.bare_router, prefix="/api/v1", tags=["recommendation"])
app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["intelligence"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(notification.router, prefix="/api/v1", tags=["notifications"])
app.include_router(news.router, prefix="/api/v1", tags=["news"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
