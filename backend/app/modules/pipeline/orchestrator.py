"""Pipeline orchestrator: dispatches Celery tasks for the investment OS pipeline."""

import logging
import sys
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.config.models import JobStatus
from app.modules.config.services import ConfigService

logger = logging.getLogger("pipeline.orchestrator")


class PipelineOrchestrator:
    """Dispatch fire-and-forget Celery tasks for each pipeline stage."""

    def _log_start(self, db: Session, job_name: str, task_id: Optional[str] = None):
        """Log job start to JobLog. Returns log entry id or None on failure."""
        try:
            svc = ConfigService(db)
            log = svc.log_job_start(job_name, task_id=task_id)
            return log.id
        except Exception as exc:
            logger.error("Failed to log job start for %s: %s", job_name, exc)
            return None

    def _log_end(self, db: Session, log_id: Optional[int], status: JobStatus, error: Optional[str] = None):
        """Log job end to JobLog. Silently skips if log_id is None."""
        if log_id is None:
            return
        try:
            ConfigService(db).log_job_end(log_id, status, error=error)
        except Exception as exc:
            logger.error("Failed to log job end for log_id=%s: %s", log_id, exc)

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

        try:
            # Step 1: Refresh prices
            result = refresh_prices_task.delay()
            log_id = self._log_start(db, "refresh_prices", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "refresh_prices", "task_id": result.id})
            logger.info("Dispatched refresh_prices_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch refresh_prices_task: %s", exc)
            log_id = self._log_start(db, "refresh_prices")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 2: Enrich technicals per asset
        try:
            assets = db.query(Asset).all()
            symbols = [a.symbol for a in assets]
        except Exception as exc:
            logger.exception("Failed to query assets for technicals enrichment: %s", exc)
            symbols = []

        for symbol in symbols:
            try:
                result = enrich_technicals_task.delay(symbol)
                log_id = self._log_start(db, "enrich_technicals", task_id=result.id)
                self._log_end(db, log_id, JobStatus.RUNNING)
                steps.append({"step_name": "enrich_technicals", "task_id": result.id})
                logger.info("Dispatched enrich_technicals_task(%s): %s", symbol, result.id)
            except Exception as exc:
                logger.exception("Failed to dispatch enrich_technicals_task(%s): %s", symbol, exc)
                log_id = self._log_start(db, "enrich_technicals")
                self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 3: Generate signals
        try:
            result = generate_signals_task.delay()
            log_id = self._log_start(db, "generate_signals", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "generate_signals", "task_id": result.id})
            logger.info("Dispatched generate_signals_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch generate_signals_task: %s", exc)
            log_id = self._log_start(db, "generate_signals")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 4: Fetch news
        try:
            result = fetch_news_task.delay()
            log_id = self._log_start(db, "fetch_news", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "fetch_news", "task_id": result.id})
            logger.info("Dispatched fetch_news_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch fetch_news_task: %s", exc)
            log_id = self._log_start(db, "fetch_news")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 5: News sentiment
        try:
            result = news_sentiment_task.delay()
            log_id = self._log_start(db, "news_sentiment", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "news_sentiment", "task_id": result.id})
            logger.info("Dispatched news_sentiment_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch news_sentiment_task: %s", exc)
            log_id = self._log_start(db, "news_sentiment")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 6: Global briefing
        try:
            result = global_briefing_task.delay()
            log_id = self._log_start(db, "daily_briefing", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "daily_briefing", "task_id": result.id})
            logger.info("Dispatched global_briefing_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch global_briefing_task: %s", exc)
            log_id = self._log_start(db, "daily_briefing")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        return {
            "status": "dispatched",
            "steps": steps,
            "asset_count": len(symbols),
        }

    def run_price_refresh(self, db: Session) -> dict:
        """
        Dispatch only the price refresh task.

        Returns:
            {"status": "dispatched", "task_id": str}
        """
        from app.tasks.portfolio import refresh_prices_task

        try:
            result = refresh_prices_task.delay()
            log_id = self._log_start(db, "refresh_prices", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            logger.info("Dispatched refresh_prices_task: %s", result.id)
            return {"status": "dispatched", "task_id": result.id}
        except Exception as exc:
            logger.exception("Failed to dispatch refresh_prices_task: %s", exc)
            log_id = self._log_start(db, "refresh_prices")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))
            return {"status": "error", "error": str(exc)}

    def run_signals_pipeline(self, db: Session) -> dict:
        """
        Dispatch steps 1-3 of the pipeline: prices → technicals → signals.

        Returns:
            {"status": "dispatched", "steps": [...]}
        """
        from app.tasks.portfolio import refresh_prices_task, enrich_technicals_task
        from app.tasks.signals import generate_signals_task
        from app.modules.portfolio.models import Asset

        steps = []

        # Step 1: Refresh prices
        try:
            result = refresh_prices_task.delay()
            log_id = self._log_start(db, "refresh_prices", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "refresh_prices", "task_id": result.id})
            logger.info("Dispatched refresh_prices_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch refresh_prices_task: %s", exc)
            log_id = self._log_start(db, "refresh_prices")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 2: Enrich technicals per asset
        try:
            assets = db.query(Asset).all()
            symbols = [a.symbol for a in assets]
        except Exception as exc:
            logger.exception("Failed to query assets for technicals enrichment: %s", exc)
            symbols = []

        for symbol in symbols:
            try:
                result = enrich_technicals_task.delay(symbol)
                log_id = self._log_start(db, "enrich_technicals", task_id=result.id)
                self._log_end(db, log_id, JobStatus.RUNNING)
                steps.append({"step_name": "enrich_technicals", "task_id": result.id})
                logger.info("Dispatched enrich_technicals_task(%s): %s", symbol, result.id)
            except Exception as exc:
                logger.exception("Failed to dispatch enrich_technicals_task(%s): %s", symbol, exc)
                log_id = self._log_start(db, "enrich_technicals")
                self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        # Step 3: Generate signals
        try:
            result = generate_signals_task.delay()
            log_id = self._log_start(db, "generate_signals", task_id=result.id)
            self._log_end(db, log_id, JobStatus.RUNNING)
            steps.append({"step_name": "generate_signals", "task_id": result.id})
            logger.info("Dispatched generate_signals_task: %s", result.id)
        except Exception as exc:
            logger.exception("Failed to dispatch generate_signals_task: %s", exc)
            log_id = self._log_start(db, "generate_signals")
            self._log_end(db, log_id, JobStatus.FAILED, error=str(exc))

        return {"status": "dispatched", "steps": steps}
