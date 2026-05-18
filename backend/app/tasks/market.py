"""Celery task: refresh market cache."""

import logging

from app.core.celery_app import celery_app

logger = logging.getLogger("tasks.market")


@celery_app.task(name="market.refresh_cache", bind=True)
def market_refresh_task(self):
    from app.core.db import SessionLocal
    from app.modules.market.engine import MarketEngine

    with SessionLocal() as session:
        engine = MarketEngine(session)
        result = engine.refresh_cache()

    logger.info("market.refresh_cache completed: %s", result)
    return result
