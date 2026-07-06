import os

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.logging import logger
from app.core.redis import get_redis_client

def validate_environment() -> None:
    """Perform startup validation to ensure all dependencies and configurations are healthy.

    Raises:
        RuntimeError or ValueError on validation failure.
    """
    logger.info("Running startup environment validation...", component="Startup")

    # 1. Port Validation
    for port_var in ["API_PORT", "FRONTEND_PORT"]:
        val = os.getenv(port_var)
        if val:
            try:
                p = int(val)
                if not (1 <= p <= 65535):
                    raise ValueError(f"Environment validation error: {port_var} must be between 1 and 65535, got {val}")
            except ValueError:
                raise ValueError(f"Environment validation error: {port_var} must be a valid integer, got {val}")

    # 2. Broker and Redis URL scheme checks
    if not settings.REDIS_URL.startswith(("redis://", "rediss://")):
        raise ValueError(f"Environment validation error: REDIS_URL must start with 'redis://' or 'rediss://', got {settings.REDIS_URL}")

    # 3. Security Key check (redundancy check on top of Pydantic)
    DEFAULT_DEV_SECRET = "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa"
    if not settings.DEBUG:
        if settings.SECRET_KEY == DEFAULT_DEV_SECRET:
            raise ValueError("Environment validation error: Insecure default SECRET_KEY in production.")
        if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32:
            raise ValueError("Environment validation error: SECRET_KEY is too short or empty for production.")

    # 4. Database Connectivity check
    try:
        logger.info("Validating Database connection...")
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connectivity verified.")
    except Exception as e:
        logger.error(f"Database connectivity check failed: {e}")
        raise RuntimeError(f"Startup check failed: Database is unreachable. Connection error: {e}")

    # 5. Redis / Celery Broker Connectivity check
    try:
        logger.info("Validating Redis connection...")
        client = get_redis_client()
        if not client.ping():
            raise RuntimeError("Redis ping returned False")
        logger.info("Redis connectivity verified.")
    except Exception as e:
        logger.error(f"Redis connectivity check failed: {e}")
        raise RuntimeError(f"Startup check failed: Redis/Celery Broker is unreachable. Connection error: {e}")

    logger.info("Startup environment validation completed successfully.")
