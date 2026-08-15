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
        "app.workers.monitoring.watchlist_alerts",
    ]
)

celery_app.conf.task_routes = {
    "app.workers.ingestion.tasks.*": {"queue": "q_ingestion"},
    "app.workers.snapshots.asset_snapshot.*": {"queue": "q_ingestion"},
    "app.workers.evaluation.*": {"queue": "q_ingestion"},
    "app.workers.monitoring.asset_health.*": {"queue": "q_ingestion"},
    "app.workers.monitoring.watchlist_alerts.*": {"queue": "q_ingestion"},
}
celery_app.conf.task_default_queue = "q_ingestion"

celery_app.conf.timezone = "UTC"

celery_app.conf.beat_schedule = {
    "news-refresh": {
        "task": "app.workers.ingestion.tasks.fetch_news_task",
        "schedule": crontab(minute=0, hour="*/4"),
    },
    # sweep-stale-job-logs, refresh-tracked-universe, refresh-mutual-fund-navs,
    # seed-price-history, hourly-price-refresh (all 5 of migration plan
    # Task 3), daily-briefing, weekly-briefing, monthly-briefing (Task 6), and
    # refresh-fundamentals (Task 7) cut over to real BullMQ repeatable
    # schedules in backend-node (see backend-node/scripts/startWorker.ts) —
    # no longer scheduled here to avoid both sides dispatching against the
    # same tables (job_logs / latest_quotes+price_history / ai_briefings /
    # asset_fundamentals) concurrently. All tasks themselves are untouched
    # and still reachable via manual dispatch (ConfigService._TASK_MAPPING).
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

# The five asset-evaluation-chain tasks (ingest_quote -> ... -> compute_asset_health)
# take asset_id as their first positional arg; every other task's first arg is
# something else (or none), so TaskRun.asset_id is only populated for these —
# see WORKERS_OBSERVABILITY_SCOPE.md §2.2.
_CHAIN_TASK_NAMES = {
    "process_asset_snapshot",
    "generate_features",
    "generate_signals",
    "generate_scores",
    "compute_asset_health",
}


@task_prerun.connect
def record_task_run_start(sender=None, task_id=None, task=None, args=None, kwargs=None, **kw):
    from app.core.database import SessionLocal
    from app.core.repositories.task_run import TaskRunRepository

    task_name = (sender or task).name.split(".")[-1]
    asset_id = args[0] if (task_name in _CHAIN_TASK_NAMES and args) else None

    db = SessionLocal()
    try:
        TaskRunRepository(db).create_started(task_name, task_id, asset_id)
    except Exception:
        logger.error(f"record_task_run_start failed for {task_name}", component="Celery", exc_info=True)
    finally:
        db.close()


@task_success.connect
def record_task_run_success(sender=None, result=None, **kwargs):
    from app.core.database import SessionLocal
    from app.core.entities.system import TaskRunStatus
    from app.core.repositories.task_run import TaskRunRepository

    task_id = getattr(sender.request, "id", None) if sender is not None else None
    if not task_id:
        return
    db = SessionLocal()
    try:
        TaskRunRepository(db).mark_terminal(task_id, TaskRunStatus.SUCCESS)
    except Exception:
        logger.error("record_task_run_success failed", component="Celery", exc_info=True)
    finally:
        db.close()


@task_failure.connect
def record_task_run_failure(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwargs):
    from app.core.database import SessionLocal
    from app.core.entities.system import TaskRunStatus
    from app.core.repositories.task_run import TaskRunRepository

    db = SessionLocal()
    try:
        TaskRunRepository(db).mark_terminal(task_id, TaskRunStatus.FAILED, error_message=str(exception))
    except Exception:
        logger.error("record_task_run_failure failed", component="Celery", exc_info=True)
    finally:
        db.close()


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
