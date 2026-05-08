"""Pipeline Celery task — top-level entry point for the daily scheduler."""
import logging

from app.core.celery_app import celery_app
from app.core.db import SessionLocal

logger = logging.getLogger("celery.pipeline")


@celery_app.task(bind=True, name="pipeline.daily", max_retries=1)
def run_daily_pipeline_task(self):
    """Orchestrate the full daily pipeline (dispatches all downstream tasks)."""
    session = SessionLocal()
    try:
        from app.modules.pipeline.orchestrator import PipelineOrchestrator
        result = PipelineOrchestrator().run_daily_pipeline(session)
        logger.info("Daily pipeline dispatched: %s steps", len(result.get("steps", [])))
        return result
    except Exception as exc:
        logger.exception("Daily pipeline task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        session.close()
