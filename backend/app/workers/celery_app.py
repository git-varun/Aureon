from celery import Celery
from celery.schedules import crontab
from celery.signals import (
    after_setup_logger,
    after_setup_task_logger,
    beat_init,
    task_postrun,
    task_prerun,
    task_success,
    task_failure,
    worker_init,
    worker_process_init,
    worker_ready,
)
import time

from app.core.config import settings
from app.core.logging import ContextManager, ctx_task_id, ctx_worker_id, logger

celery_app = Celery(
    "aureon_workers",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.ingestion.tasks",
        "app.workers.snapshots.asset_snapshot",
        "app.workers.evaluation.features",
        "app.workers.evaluation.signals",
        "app.workers.evaluation.scoring",
        "app.workers.monitoring.asset_health",
    ]
)

celery_app.conf.task_routes = {
    "app.workers.ingestion.tasks.*": {"queue": "q_ingestion"},
    "app.workers.snapshots.asset_snapshot.*": {"queue": "q_ingestion"},
    "app.workers.evaluation.*": {"queue": "q_ingestion"},
    "app.workers.monitoring.asset_health.*": {"queue": "q_ingestion"},
}
celery_app.conf.task_default_queue = "q_ingestion"

celery_app.conf.timezone = "UTC"

celery_app.conf.beat_schedule = {
    "seed-market-universe": {
        "task": "app.workers.ingestion.tasks.seed_market_universe_task",
        "schedule": crontab(hour=7, minute=0),
    },
    "seed-price-history": {
        "task": "app.workers.ingestion.tasks.seed_price_history_task",
        "schedule": crontab(hour=2, minute=0, day_of_week="sun"),
    },
    "hourly-price-refresh": {
        "task": "app.workers.ingestion.tasks.refresh_prices_task",
        "schedule": crontab(minute=0, hour="*"),
    },
    "news-refresh": {
        "task": "app.workers.ingestion.tasks.fetch_news_task",
        "schedule": crontab(minute=0, hour="*/4"),
    },
    "refresh-fundamentals": {
        "task": "app.workers.ingestion.tasks.refresh_fundamentals_task",
        "schedule": crontab(hour=6, minute=0),
    },
    "refresh-mutual-fund-navs": {
        "task": "app.workers.ingestion.tasks.refresh_mutual_fund_navs_task",
        "schedule": crontab(hour=23, minute=0),
    },
}


@worker_init.connect
def bootstrap_worker(sender=None, conf=None, **kwargs):
    from app.core.validation import validate_environment
    validate_environment()
    logger.info("Worker bootstrap completed.", component="Celery")

@worker_process_init.connect
def reset_sqlalchemy_engine(**kwargs):
    from app.core.database import engine
    engine.dispose(close=False)
    logger.info("SQLAlchemy engine disposed after fork", component="Celery")

@beat_init.connect
def bootstrap_beat(sender=None, **kwargs):
    from app.core.validation import validate_environment
    validate_environment()
    logger.info("Beat bootstrap completed.", component="Celery")


_worker_name = "celery_worker"

@worker_ready.connect
def on_worker_ready(sender=None, **kwargs):
    global _worker_name
    if sender:
        _worker_name = sender.hostname
    ctx_worker_id.set(_worker_name)
    logger.info(f"Celery worker ready: hostname={_worker_name}", component="Celery")

@task_prerun.connect
def on_task_prerun(task_id, task, *args, **kwargs):
    ctx_task_id.set(task_id)
    ctx_worker_id.set(_worker_name)

    # Every task gets one Request ID for correlating its logs — the caller's
    # own correlation_id/user_id if it passed one through kwargs/first arg,
    # else the Celery task_id itself.
    request_id = None
    user_id = None
    if kwargs:
        request_id = kwargs.get("correlation_id")
        user_id = kwargs.get("user_id")
    if not request_id and args and isinstance(args[0], dict):
        request_id = args[0].get("correlation_id")
        user_id = args[0].get("user_id")
    request_id = request_id or task_id

    ctx = ContextManager(request_id=request_id, task_id=task_id, user_id=user_id)
    ctx.__enter__()
    task.request.__aureon_ctx = ctx
    task.request.start_time = time.perf_counter()

@task_success.connect
def on_task_success(sender, result, **kwargs):
    start_time = getattr(sender.request, "start_time", None)
    duration_ms = int((time.perf_counter() - start_time) * 1000) if start_time else None
    logger.info(sender.name.split(".")[-1], component="Celery", status="OK", duration_ms=duration_ms)

@task_failure.connect
def on_task_failure(sender, task_id, exception, traceback, einfo=None, **kwargs):
    start_time = getattr(sender.request, "start_time", None)
    duration_ms = int((time.perf_counter() - start_time) * 1000) if start_time else None

    # Celery's task_failure is the terminal boundary for background jobs (no HTTP
    # exception handler downstream) — log the full traceback exactly once, here.
    exc_info = einfo.exc_info if einfo is not None else (type(exception), exception, traceback)
    logger.error(
        f"{sender.name.split('.')[-1]} - {exception}",
        component="Celery", status="FAIL", duration_ms=duration_ms, exc_info=exc_info,
    )

@task_postrun.connect
def on_task_postrun(task_id, task, *args, **kwargs):
    ctx = getattr(task.request, "__aureon_ctx", None)
    if ctx is not None:
        try:
            ctx.__exit__(None, None, None)
        except Exception:
            pass
    ctx_task_id.set(None)


def _apply_structured_formatting(logger_instance):
    import logging
    from app.core.logging.core import AureonFormatter

    handlers = logger_instance.handlers if logger_instance.handlers else [logging.StreamHandler()]
    for handler in handlers:
        handler.setFormatter(AureonFormatter())
        if not logger_instance.handlers:
            logger_instance.addHandler(handler)

@after_setup_logger.connect
def setup_celery_logger(logger, *args, **kwargs):
    _apply_structured_formatting(logger)

@after_setup_task_logger.connect
def setup_celery_task_logger(logger, *args, **kwargs):
    _apply_structured_formatting(logger)
