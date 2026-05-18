"""Pipeline orchestrator: dispatches Celery tasks for the investment OS pipeline."""

import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.config.models import JobStatus
from app.modules.config.services import ConfigService

logger = logging.getLogger("pipeline.orchestrator")


class PipelineOrchestrator:
    """Dispatch fire-and-forget Celery tasks for each pipeline stage."""

    def _dispatch(self, db: Session, job_name: str, task_fn, *args, **kwargs) -> Optional[str]:
        """Pre-assign a task ID, log job start, then dispatch. Returns task_id or None on error."""
        task_id = str(uuid.uuid4())
        try:
            svc = ConfigService(db)
            svc.log_job_start(job_name, task_id=task_id)
        except Exception as exc:
            logger.error("Failed to log job start for %s: %s", job_name, exc)

        try:
            task_fn.apply_async(args=args, kwargs=kwargs, task_id=task_id)
            logger.info("Dispatched %s task_id=%s", job_name, task_id)
            return task_id
        except Exception as exc:
            logger.exception("Failed to dispatch %s: %s", job_name, exc)
            try:
                ConfigService(db).update_job_log_status_by_task_id(
                    task_id, JobStatus.FAILED, error=str(exc)
                )
            except Exception:
                pass
            return None

    def run_daily_pipeline(self, db: Session) -> dict:
        """
        Dispatch the 6-step daily pipeline as fire-and-forget Celery tasks.

        Steps:
            1. refresh_prices_task
            2. enrich_technicals_task (per-asset fan-out)
            3. generate_signals_task
            4. fetch_news_task
            5. news_sentiment_task
            6. global_briefing_task

        Returns:
            {"status": "dispatched", "steps": [...], "asset_count": N}
        """
        from app.tasks.portfolio import refresh_prices_task, enrich_technicals_task
        from app.tasks.signals import generate_signals_task
        from app.tasks.news import fetch_news_task
        from app.tasks.ai import news_sentiment_task, global_briefing_task
        from app.modules.portfolio.models import Asset

        steps = []

        tid = self._dispatch(db, "refresh_prices", refresh_prices_task)
        if tid:
            steps.append({"step_name": "refresh_prices", "task_id": tid})

        try:
            symbols = [a.symbol for a in db.query(Asset).all()]
        except Exception as exc:
            logger.exception("Failed to query assets for technicals enrichment: %s", exc)
            symbols = []

        for symbol in symbols:
            tid = self._dispatch(db, "enrich_technicals", enrich_technicals_task, symbol)
            if tid:
                steps.append({"step_name": "enrich_technicals", "task_id": tid})

        tid = self._dispatch(db, "generate_signals", generate_signals_task)
        if tid:
            steps.append({"step_name": "generate_signals", "task_id": tid})

        tid = self._dispatch(db, "fetch_news", fetch_news_task)
        if tid:
            steps.append({"step_name": "fetch_news", "task_id": tid})

        tid = self._dispatch(db, "news_sentiment", news_sentiment_task)
        if tid:
            steps.append({"step_name": "news_sentiment", "task_id": tid})

        tid = self._dispatch(db, "daily_briefing", global_briefing_task)
        if tid:
            steps.append({"step_name": "daily_briefing", "task_id": tid})

        from app.tasks.market import market_refresh_task
        tid = self._dispatch(db, "refresh_market", market_refresh_task)
        if tid:
            steps.append({"step_name": "refresh_market", "task_id": tid})

        return {"status": "dispatched", "steps": steps, "asset_count": len(symbols)}

    def run_price_refresh(self, db: Session) -> dict:
        """Dispatch only the price refresh task."""
        from app.tasks.portfolio import refresh_prices_task

        tid = self._dispatch(db, "refresh_prices", refresh_prices_task)
        if tid:
            return {"status": "dispatched", "task_id": tid}
        return {"status": "error", "error": "dispatch failed"}

    def run_signals_pipeline(self, db: Session) -> dict:
        """Dispatch steps 1-3 of the pipeline: prices → technicals → signals."""
        from app.tasks.portfolio import refresh_prices_task, enrich_technicals_task
        from app.tasks.signals import generate_signals_task
        from app.modules.portfolio.models import Asset

        steps = []

        tid = self._dispatch(db, "refresh_prices", refresh_prices_task)
        if tid:
            steps.append({"step_name": "refresh_prices", "task_id": tid})

        try:
            symbols = [a.symbol for a in db.query(Asset).all()]
        except Exception as exc:
            logger.exception("Failed to query assets for technicals enrichment: %s", exc)
            symbols = []

        for symbol in symbols:
            tid = self._dispatch(db, "enrich_technicals", enrich_technicals_task, symbol)
            if tid:
                steps.append({"step_name": "enrich_technicals", "task_id": tid})

        tid = self._dispatch(db, "generate_signals", generate_signals_task)
        if tid:
            steps.append({"step_name": "generate_signals", "task_id": tid})

        return {"status": "dispatched", "steps": steps}
