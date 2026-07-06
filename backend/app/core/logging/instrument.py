import functools
import inspect
import time
from typing import Any, Callable

from .core import logger


def instrument(component: str, name: str) -> Callable:
    """Wraps one public method with OK/FAIL + duration logging. This is the ONE
    instrumentation mechanism used by BaseService, BaseRepository, and
    ProviderProtocol's __init_subclass__ hooks."""

    def decorator(func: Callable) -> Callable:
        label = f"{name}.{func.__name__}()"

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                # No traceback here — the boundary that ultimately catches this
                # (HTTP exception handler / Celery task_failure) logs it once.
                logger.error(f"{label} - {exc}", component=component, status="FAIL", duration_ms=duration_ms)
                raise
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(label, component=component, status="OK", duration_ms=duration_ms)
            return result

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                logger.error(f"{label} - {exc}", component=component, status="FAIL", duration_ms=duration_ms)
                raise
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(label, component=component, status="OK", duration_ms=duration_ms)
            return result

        return async_wrapper if inspect.iscoroutinefunction(func) else sync_wrapper

    return decorator
