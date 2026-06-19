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
    worker_ready,
)
import time
import logging

from app.core.config import settings
from app.core.logger import ctx_task_id, ctx_worker_id, logger

celery_app = Celery(
    "aureon_workers",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.ingestion.tasks"]
)

celery_app.conf.task_routes = {
    "app.workers.ingestion.tasks.*": {"queue": "q_ingestion"}
}
celery_app.conf.task_default_queue = "q_ingestion"

celery_app.conf.timezone = "UTC"

celery_app.conf.beat_schedule = {
    "daily-pipeline": {
        "task": "app.workers.ingestion.tasks.ingest_all_quotes",
        "schedule": crontab(hour=9, minute=0, day_of_week="mon-fri"),
    },
    "hourly-price-refresh": {
        "task": "app.workers.ingestion.tasks.ingest_all_quotes",
        "schedule": crontab(minute=0, hour="*"),
    }
}


@worker_init.connect
def bootstrap_worker(sender=None, conf=None, **kwargs):
    from app.core.validation import validate_environment
    validate_environment()
    
    # Dynamically patch repositories, services, and providers for background workers
    from app.core.logger import patch_all_repositories, patch_all_services, patch_all_providers
    patch_all_repositories()
    patch_all_services()
    patch_all_providers()
    logger.info("Worker bootstrap completed. Dynamic instrumentation loaded.")

@beat_init.connect
def bootstrap_beat(sender=None, **kwargs):
    from app.core.validation import validate_environment
    validate_environment()
    
    from app.core.logger import patch_all_repositories, patch_all_services, patch_all_providers
    patch_all_repositories()
    patch_all_services()
    patch_all_providers()
    logger.info("Beat bootstrap completed. Dynamic instrumentation loaded.")


_worker_name = "celery_worker"

@worker_ready.connect
def on_worker_ready(sender=None, **kwargs):
    global _worker_name
    if sender:
        _worker_name = sender.hostname
    ctx_worker_id.set(_worker_name)
    logger.info(f"Celery worker ready: hostname={_worker_name}")

@task_prerun.connect
def on_task_prerun(task_id, task, *args, **kwargs):
    ctx_task_id.set(task_id)
    ctx_worker_id.set(_worker_name)
    
    # Try to extract correlation ID and User ID from kwargs
    correlation_id = None
    user_id = None
    
    if kwargs:
        correlation_id = kwargs.get("correlation_id") or kwargs.get("headers", {}).get("correlation_id")
        user_id = kwargs.get("user_id") or kwargs.get("headers", {}).get("user_id")
        
    if not correlation_id and args and isinstance(args[0], dict):
        correlation_id = args[0].get("correlation_id")
        user_id = args[0].get("user_id")
        
    # Fallback to Task ID as Correlation ID
    if not correlation_id:
        correlation_id = task_id
        
    # Bind variables to context variables for logs tracing
    from app.core.request_context import ctx_request_id, ctx_correlation_id, ctx_user_id, ctx_job_id
    ctx_request_id.set(correlation_id)
    ctx_correlation_id.set(correlation_id)
    ctx_job_id.set(task_id)
    if user_id:
        ctx_user_id.set(str(user_id))
        
    queue_name = task.request.delivery_info.get("routing_key", "q_ingestion") if task.request.delivery_info else "-"
    
    # 1. Track start time for latency
    task.request.start_time = time.perf_counter()

    # 2. Open OpenTelemetry Trace span
    from app.core.observability.otel import get_tracer
    tracer = get_tracer("worker")
    span = tracer.start_as_current_span(f"Celery {task.name}")
    span.__enter__()
    span.set_attribute("messaging.system", "celery")
    span.set_attribute("messaging.destination", queue_name)
    span.set_attribute("messaging.message_id", task_id)
    span.set_attribute("correlation_id", correlation_id)
    task.request.otel_span = span

    logger.info(
        f"Worker Job RECEIVED: task={task.name} task_id={task_id} "
        f"correlation_id={correlation_id} queue={queue_name} user_id={user_id or '-'}",
        extra={
            "category": "WORKER",
            "event": "worker.task.started",
            "execution_step": "START",
            "queue_name": queue_name,
            "worker_name": _worker_name
        }
    )

@task_success.connect
def on_task_success(sender, result, **kwargs):
    task_id = sender.request.id
    start_time = getattr(sender.request, "start_time", None)
    duration_ms = 0
    if start_time:
        duration_s = time.perf_counter() - start_time
        duration_ms = int(duration_s * 1000)
        from app.core.observability.metrics import celery_task_duration_seconds
        celery_task_duration_seconds.observe(duration_s, task_name=sender.name, status="success")
        
        if duration_ms > 2000:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Worker", duration_ms, details={"task_name": sender.name, "task_id": task_id, "worker_name": _worker_name})

    from app.core.observability.otel import StatusCode
    otel_span = getattr(sender.request, "otel_span", None)
    if otel_span:
        otel_span.set_status(StatusCode.OK)

    logger.info(
        f"Worker Job SUCCESS: task={sender.name} task_id={task_id} - Duration: {duration_ms}ms",
        extra={
            "category": "WORKER",
            "event": "worker.task.completed",
            "execution_step": "FINISH",
            "duration_ms": duration_ms,
            "worker_name": _worker_name
        }
    )

@task_failure.connect
def on_task_failure(sender, task_id, exception, traceback, **kwargs):
    start_time = getattr(sender.request, "start_time", None)
    duration_ms = 0
    if start_time:
        duration_s = time.perf_counter() - start_time
        duration_ms = int(duration_s * 1000)
        from app.core.observability.metrics import celery_task_duration_seconds
        celery_task_duration_seconds.observe(duration_s, task_name=sender.name, status="failed")

        if duration_ms > 2000:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Worker", duration_ms, details={"task_name": sender.name, "task_id": task_id, "worker_name": _worker_name, "error": str(exception)})

    from app.core.observability.metrics import telemetry_errors_total
    telemetry_errors_total.inc(category="WORKER", error_type=type(exception).__name__)

    from app.core.observability.otel import StatusCode
    otel_span = getattr(sender.request, "otel_span", None)
    if otel_span:
        otel_span.set_status(StatusCode.ERROR, str(exception))
        otel_span.record_exception(exception)

    logger.error(
        f"Worker Job FAILURE: task={sender.name} task_id={task_id} - Failed - Duration: {duration_ms}ms - Error: {exception}", 
        exc_info=True,
        extra={
            "category": "WORKER",
            "event": "worker.task.failed",
            "execution_step": "FAIL",
            "duration_ms": duration_ms,
            "worker_name": _worker_name
        }
    )

@task_postrun.connect
def on_task_postrun(task_id, task, *args, **kwargs):
    otel_span = getattr(task.request, "otel_span", None)
    if otel_span:
        try:
            otel_span.__exit__(None, None, None)
        except Exception:
            pass
    ctx_task_id.set(None)


def _apply_structured_formatting(logger_instance):
    from app.core.observability.logging import (
        TelemetryLoggingFilter,
        JsonTelemetryFormatter,
        PrettyConsoleTelemetryFormatter
    )
    import logging
    
    # Configure handlers
    handlers = logger_instance.handlers if logger_instance.handlers else [logging.StreamHandler()]
    for handler in handlers:
        if not any(isinstance(f, TelemetryLoggingFilter) for f in handler.filters):
            handler.addFilter(TelemetryLoggingFilter())
        
        try:
            from app.core.config import settings
            is_debug = settings.DEBUG
        except Exception:
            is_debug = True
            
        if is_debug:
            formatter = PrettyConsoleTelemetryFormatter()
        else:
            formatter = JsonTelemetryFormatter()
        handler.setFormatter(formatter)
        if not logger_instance.handlers:
            logger_instance.addHandler(handler)

@after_setup_logger.connect
def setup_celery_logger(logger, *args, **kwargs):
    _apply_structured_formatting(logger)

@after_setup_task_logger.connect
def setup_celery_task_logger(logger, *args, **kwargs):
    _apply_structured_formatting(logger)
