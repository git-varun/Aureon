import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1 import monitoring
from app.core.api import config, notification, reset, users
from app.core.api.system import health
from app.modules.ai.api import ai, evaluation, intelligence, recommendation
from app.modules.market.api import assets, market, watchlist
from app.modules.news.api import news
from app.modules.portfolio.api import portfolio
from app.core.config import settings
from app.core.exceptions import (
    AppException,
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

    from app.core.database import engine

    # Schema migrations are Prisma's responsibility now (backend-node/prisma) —
    # `prisma migrate deploy` is run out-of-band, not from this Python startup path.

    # Seeding database defaults
    try:
        from app.core.database import SessionLocal
        from app.core.services.config import ConfigService
        with SessionLocal() as db:
            ConfigService.seed_defaults(db)
        logger.info("Database seed completed successfully.")
    except Exception as e:
        logger.error(f"Failed to seed defaults: {e}")
        raise RuntimeError(f"Startup check failed: Database seeding failed. Error: {e}")

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
app.include_router(recommendation.router, prefix="/api/v1/recommendation", tags=["recommendation"])
app.include_router(recommendation.bare_router, prefix="/api/v1", tags=["recommendation"])
app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["intelligence"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(reset.router, prefix="/api/v1", tags=["reset"])
app.include_router(notification.router, prefix="/api/v1", tags=["notifications"])
app.include_router(news.router, prefix="/api/v1", tags=["news"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
