import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.api import compatibility
from app.api.v1 import (
    ai,
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
from app.core.logger import ctx_request_id, logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Startup initiated. Initializing Aureon API...")
    
    # Run environment startup validation (fail-fast)
    from app.core.validation import validate_environment
    validate_environment()
    
    # Instrument repositories, services, and providers dynamically (AOP pattern)
    from app.core.logger import patch_all_repositories, patch_all_services, patch_all_providers
    patch_all_repositories()
    patch_all_services()
    patch_all_providers()
    logger.info("Startup validation & dependency dynamic instrumentation completed successfully.")
    
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


from app.core.observability.middleware import TelemetryMiddleware
app.add_middleware(TelemetryMiddleware)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    from app.core.observability.health import fingerprinter
    fingerprint = fingerprinter.register_error(exc)
    
    status_code = getattr(exc, "http_status", 400)
    category = getattr(exc, "category", "SYSTEM")
    severity = getattr(exc, "severity", "ERROR")
    retryable = getattr(exc, "retryable", False)
    
    extra = {
        "category": category,
        "event": "api.request.exception",
        "severity": severity,
        "retryable": retryable,
        "exception_type": exc.__class__.__name__,
        "error_fingerprint": fingerprint
    }
    
    log_msg = (
        f"AppException occurred: {exc.__class__.__name__} - {exc.message} "
        f"on {request.method} {request.url.path} "
        f"[Category: {category}, Severity: {severity}, Retryable: {retryable}] "
        f"Fingerprint: {fingerprint}"
    )
    
    if severity == "CRITICAL":
        logger.critical(log_msg, extra=extra)
    elif severity == "ERROR":
        logger.error(log_msg, extra=extra)
    elif severity == "WARNING":
        logger.warning(log_msg, extra=extra)
    else:
        logger.info(log_msg, extra=extra)
        
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
    
    logger.warning(
        f"Validation error on {request.method} {request.url.path}: {exc.errors()} "
        f"Fingerprint: {fingerprint}"
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
    
    logger.warning(
        f"HTTPException {exc.status_code}: {exc.detail} on {request.method} {request.url.path} "
        f"Fingerprint: {fingerprint}"
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
        f"Unhandled exception occurred during request {request.method} {request.url.path}: {exc} "
        f"Fingerprint: {fingerprint}"
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
app.include_router(portfolio.router, prefix="/api/v1/portfolio", tags=["portfolio"])
app.include_router(evaluation.router, prefix="/api/v1/evaluation", tags=["evaluation"])
app.include_router(monitoring.router, prefix="/api/v1/monitoring", tags=["monitoring"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["organizations"])
app.include_router(memberships.router, prefix="/api/v1/memberships", tags=["memberships"])
app.include_router(invitations.router, prefix="/api/v1/invitations", tags=["invitations"])
app.include_router(recommendation.router, prefix="/api/v1/recommendation", tags=["recommendation"])
app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["intelligence"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(config.router, prefix="/api/v1", tags=["config"])
app.include_router(notification.router, prefix="/api/v1", tags=["notifications"])
app.include_router(news.router, prefix="/api/v1", tags=["news"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(compatibility.router)


v1_compat_router = APIRouter()
for route in compatibility.router.routes:
    if isinstance(route, APIRoute) and route.path.startswith("/api/"):
        new_path = route.path.replace("/api/", "/api/v1/")
        # Avoid duplicate registration if route already exists in other v1 routers
        v1_compat_router.add_api_route(
            new_path,
            route.endpoint,
            methods=route.methods,
            response_model=route.response_model,
            dependencies=route.dependencies,
            summary=route.summary,
            description=route.description,
            response_description=route.response_description,
            responses=route.responses,
            deprecated=route.deprecated,
            operation_id=route.operation_id + "_v1" if route.operation_id else None,
            response_model_include=route.response_model_include,
            response_model_exclude=route.response_model_exclude,
            response_model_by_alias=route.response_model_by_alias,
            response_model_exclude_unset=route.response_model_exclude_unset,
            response_model_exclude_defaults=route.response_model_exclude_defaults,
            response_model_exclude_none=route.response_model_exclude_none,
            include_in_schema=route.include_in_schema,
            response_class=route.response_class,
            name=route.name,
        )
app.include_router(v1_compat_router)
