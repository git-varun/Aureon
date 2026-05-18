"""Celery app setup."""

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Inject the project venv's site-packages so all dependencies (e.g. growwapi)
# are available regardless of which Python binary launches celery.
_venv_site = Path(__file__).resolve().parents[2] / ".venv" / "lib" / "python3.13" / "site-packages"
if _venv_site.exists() and str(_venv_site) not in sys.path:
    sys.path.insert(0, str(_venv_site))

from celery import Celery
from celery.schedules import crontab
from celery.signals import task_prerun, task_postrun

from app.core.config import settings

logger = logging.getLogger("celery.config")

# Maps Celery task name → job_name in job_configs.
# Fan-out tasks (enrich_technicals, generate_for_symbol) are intentionally excluded
# to avoid a DB write per symbol.
_TASK_JOB_MAP = {
    "portfolio.sync": "sync_portfolio",
    "portfolio.refresh_prices": "refresh_prices",
    "signals.daily_batch": "run_signals",
    "signals.generate_all": "run_signals",
    "ai.global_briefing": "daily_briefing",
    "portfolio.seed_price_history": "seed_price_history",
    "news.fetch": "fetch_news",
    "news.aggregate_sentiment": "aggregate_sentiment",
    "portfolio.seed_fundamentals": "seed_fundamentals",
    "portfolio.fetch_fx_rate": "fetch_fx_rate",
    "portfolio.compute_state": "compute_state",
    "portfolio.accrue_epf": "accrue_epf",
    "portfolio.bond_mtm": "bond_mtm",
    "portfolio.insurance_premium": "insurance_premium",
    "market.refresh_cache": "refresh_market",
}


@task_prerun.connect
def on_task_prerun(task_id=None, task=None, **kwargs):
    """For tracked tasks: create a JobLog if none exists (beat-triggered), else mark RUNNING."""
    task_name = getattr(task, "name", None)
    job_name = _TASK_JOB_MAP.get(task_name)
    if not job_name:
        return
    try:
        from app.core.db import SessionLocal
        from app.modules.config.models import JobLog, JobStatus
        with SessionLocal() as db:
            existing = db.query(JobLog).filter_by(task_id=task_id).first()
            if existing:
                existing.status = JobStatus.RUNNING
            else:
                db.add(JobLog(job_name=job_name, status=JobStatus.RUNNING, task_id=task_id))
            db.commit()
    except Exception as exc:
        logger.warning("task_prerun signal failed for %s (%s): %s", task_id, task_name, exc)


@task_postrun.connect
def on_task_postrun(task_id=None, task=None, state=None, retval=None, **kwargs):
    """Close the JobLog and update last_run_at on the JobConfig."""
    task_name = getattr(task, "name", None)
    job_name = _TASK_JOB_MAP.get(task_name)
    if not job_name:
        return
    try:
        from app.core.db import SessionLocal
        from app.modules.config.models import JobConfig, JobLog, JobStatus
        final_status = JobStatus.SUCCESS if state == "SUCCESS" else JobStatus.FAILED
        error_msg = None
        if state != "SUCCESS" and retval is not None:
            try:
                error_msg = str(retval)[:500]
            except Exception:
                pass
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            log = db.query(JobLog).filter_by(task_id=task_id).first()
            if log:
                log.status = final_status
                if error_msg:
                    log.error_message = error_msg
                log.ended_at = now
                if log.started_at:
                    log.duration_ms = int((now - log.started_at).total_seconds() * 1000)
            job = db.query(JobConfig).filter_by(job_name=job_name).first()
            if job:
                job.last_run_at = now
            db.commit()
    except Exception as exc:
        logger.warning("task_postrun signal failed for %s (%s): %s", task_id, task_name, exc)


def _register_models() -> None:
    """Import all ORM models so SQLAlchemy metadata resolves FK references in task context."""
    from app.modules.analytics import models as _  # noqa: F401
    from app.modules.config import models as _  # noqa: F401
    from app.modules.news import models as _  # noqa: F401
    from app.modules.notification import models as _  # noqa: F401
    from app.modules.portfolio import models as _  # noqa: F401
    from app.modules.signals import models as _  # noqa: F401
    from app.modules.users import models as _  # noqa: F401
    from app.modules.watchlist import models as _  # noqa: F401


_register_models()

broker_url = settings.celery_broker_url
backend_url = settings.celery_result_backend

celery_app = Celery("aureon")

if broker_url and backend_url:
    celery_app.conf.broker_url = broker_url
    celery_app.conf.result_backend = backend_url
    logger.info("Celery configured in an async mode (broker+backend enabled)")
else:
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    logger.warning("Celery configured in an eager mode (CELERY_BROKER_URL / CELERY_RESULT_BACKEND missing)")

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.timezone,
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    task_routes={
        "portfolio.refresh_prices": {"queue": "price-queue"},
        "portfolio.seed_price_history": {"queue": "price-queue"},
        "portfolio.fetch_fx_rate": {"queue": "price-queue"},
        "portfolio.compute_state": {"queue": "price-queue"},
        "portfolio.enrich_technicals": {"queue": "price-queue"},
        "ai.global_briefing": {"queue": "ai-queue"},
        "ai.single_briefing": {"queue": "ai-queue"},
        "ai.news_sentiment": {"queue": "ai-queue"},
        "news.fetch": {"queue": "ai-queue"},
        "news.aggregate_sentiment": {"queue": "ai-queue"},
        "portfolio.seed_fundamentals": {"queue": "ai-queue"},
        "pipeline.daily": {"queue": "pipeline-queue"},
        "signals.daily_batch": {"queue": "pipeline-queue"},
        "signals.generate_all": {"queue": "pipeline-queue"},
        "signals.generate_for_symbol": {"queue": "pipeline-queue"},
        "portfolio.sync": {"queue": "pipeline-queue"},
        "portfolio.accrue_epf": {"queue": "price-queue"},
        "portfolio.bond_mtm": {"queue": "price-queue"},
        "portfolio.insurance_premium": {"queue": "price-queue"},
        "market.refresh_cache": {"queue": "price-queue"},
    },
    imports=[
        "app.tasks.portfolio",
        "app.tasks.signals",
        "app.tasks.news",
        "app.tasks.ai",
        "app.tasks.pipeline",
        "app.tasks.fixed_return",
        "app.tasks.market",
    ],
    beat_schedule={
        "daily-pipeline": {
            "task": "pipeline.daily",
            "schedule": crontab(hour=9, minute=0, day_of_week="mon-fri"),
        },
        "price-refresh": {
            "task": "portfolio.refresh_prices",
            "schedule": crontab(minute="*/15", hour="9-15", day_of_week="mon-fri"),
        },
        "daily-signals": {
            "task": "signals.daily_batch",
            "schedule": crontab(hour=10, minute=0, day_of_week="mon-fri"),
        },
        "morning-briefing": {
            "task": "ai.global_briefing",
            "schedule": crontab(hour=7, minute=0),
        },
        "seed-price-history": {
            "task": "portfolio.seed_price_history",
            "schedule": crontab(hour=2, minute=0, day_of_week="sun"),
        },
        "fetch-news": {
            "task": "news.fetch",
            "schedule": crontab(hour=8, minute=0),
        },
        "aggregate-sentiment": {
            "task": "news.aggregate_sentiment",
            "schedule": crontab(hour=22, minute=0),
        },
        "refresh-fundamentals": {
            "task": "portfolio.seed_fundamentals",
            "schedule": crontab(hour=3, minute=0, day_of_week="sun"),
        },
        "fetch-fx-rate": {
            "task": "portfolio.fetch_fx_rate",
            "schedule": crontab(minute=0, hour="*/4"),
        },
        "compute-state": {
            "task": "portfolio.compute_state",
            "schedule": crontab(minute="*/15", hour="9-15", day_of_week="mon-fri"),
        },
        "accrue-epf": {
            "task": "portfolio.accrue_epf",
            "schedule": crontab(hour=6, minute=0, day_of_month=1),
        },
        "bond-mtm": {
            "task": "portfolio.bond_mtm",
            "schedule": crontab(hour=9, minute=30, day_of_week="mon-fri"),
        },
        "insurance-premium": {
            "task": "portfolio.insurance_premium",
            "schedule": crontab(hour=8, minute=0, day_of_week="mon"),
        },
        "market-refresh": {
            "task": "market.refresh_cache",
            "schedule": crontab(minute="*/15", hour="9-16", day_of_week="mon-fri"),
        },
    },
)
