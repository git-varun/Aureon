import inspect
import time
import functools
from typing import Any, Dict, Optional, Callable
from app.core.observability.logging import logger
from app.core.observability.otel import get_tracer, StatusCode
from app.core.observability.metrics import (
    service_execution_duration_seconds,
    repository_execution_duration_seconds,
    provider_request_duration_seconds,
    telemetry_errors_total
)
from app.core.observability.request_context import ContextManager

def log_state_transition(step: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Emits log indicating execution state machine transition."""
    extra = {"execution_step": step}
    if details:
        extra.update(details)
    with ContextManager(extra_fields=extra):
        logger.info(f"State transition: {step}", extra=extra)

def instrument_service(service_name: str):
    """Decorator to instrument domain service methods with tracing, latency metrics, and state logging."""
    def decorator(func: Callable):
        func_name = func.__name__
        tracer = get_tracer("service")

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            span_name = f"Service.{service_name}.{func_name}"
            
            with ContextManager(extra_fields={"service": service_name, "function": func_name, "execution_step": "START"}):
                logger.info(f"Service Call START: {service_name}.{func_name}", extra={"event": "service.started"})
                
                with tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("service", service_name)
                    span.set_attribute("function", func_name)
                    try:
                        result = func(*args, **kwargs)
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.OK)
                        
                        service_execution_duration_seconds.observe(
                            duration_ms / 1000.0, service=service_name, function=func_name
                        )
                        
                        with ContextManager(extra_fields={"execution_step": "FINISH", "duration_ms": int(duration_ms)}):
                            logger.info(
                                f"Service Call FINISH: {service_name}.{func_name} - Success - Duration: {duration_ms:.2f}ms",
                                extra={"event": "service.completed", "duration_ms": int(duration_ms)}
                            )
                        return result
                    except Exception as exc:
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.ERROR, str(exc))
                        span.record_exception(exc)
                        
                        telemetry_errors_total.inc(category="SERVICE", error_type=type(exc).__name__)
                        
                        with ContextManager(extra_fields={"execution_step": "FAIL", "duration_ms": int(duration_ms)}):
                            logger.error(
                                f"Service Call FAIL: {service_name}.{func_name} - Failed - Duration: {duration_ms:.2f}ms - Error: {exc}",
                                exc_info=True,
                                extra={"event": "service.failed", "duration_ms": int(duration_ms)}
                            )
                        raise exc

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            span_name = f"Service.{service_name}.{func_name}"
            
            with ContextManager(extra_fields={"service": service_name, "function": func_name, "execution_step": "START"}):
                logger.info(f"Service Call START: {service_name}.{func_name}", extra={"event": "service.started"})
                
                with tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("service", service_name)
                    span.set_attribute("function", func_name)
                    try:
                        result = await func(*args, **kwargs)
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.OK)
                        
                        service_execution_duration_seconds.observe(
                            duration_ms / 1000.0, service=service_name, function=func_name
                        )
                        
                        with ContextManager(extra_fields={"execution_step": "FINISH", "duration_ms": int(duration_ms)}):
                            logger.info(
                                f"Service Call FINISH: {service_name}.{func_name} - Success - Duration: {duration_ms:.2f}ms",
                                extra={"event": "service.completed", "duration_ms": int(duration_ms)}
                            )
                        return result
                    except Exception as exc:
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.ERROR, str(exc))
                        span.record_exception(exc)
                        
                        telemetry_errors_total.inc(category="SERVICE", error_type=type(exc).__name__)
                        
                        with ContextManager(extra_fields={"execution_step": "FAIL", "duration_ms": int(duration_ms)}):
                            logger.error(
                                f"Service Call FAIL: {service_name}.{func_name} - Failed - Duration: {duration_ms:.2f}ms - Error: {exc}",
                                exc_info=True,
                                extra={"event": "service.failed", "duration_ms": int(duration_ms)}
                            )
                        raise exc

        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator


def instrument_repository(repo_name: str):
    """Decorator to instrument repository query/persistence operations."""
    def decorator(func: Callable):
        func_name = func.__name__
        tracer = get_tracer("repository")

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            span_name = f"Repository.{repo_name}.{func_name}"
            
            with ContextManager(extra_fields={"repository": repo_name, "function": func_name, "execution_step": "START"}):
                with tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("repository", repo_name)
                    span.set_attribute("function", func_name)
                    try:
                        result = func(*args, **kwargs)
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.OK)
                        
                        repository_execution_duration_seconds.observe(
                            duration_ms / 1000.0, repository=repo_name, function=func_name
                        )
                        return result
                    except Exception as exc:
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.ERROR, str(exc))
                        span.record_exception(exc)
                        
                        telemetry_errors_total.inc(category="REPOSITORY", error_type=type(exc).__name__)
                        raise exc

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            span_name = f"Repository.{repo_name}.{func_name}"
            
            with ContextManager(extra_fields={"repository": repo_name, "function": func_name, "execution_step": "START"}):
                with tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("repository", repo_name)
                    span.set_attribute("function", func_name)
                    try:
                        result = await func(*args, **kwargs)
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.OK)
                        
                        repository_execution_duration_seconds.observe(
                            duration_ms / 1000.0, repository=repo_name, function=func_name
                        )
                        return result
                    except Exception as exc:
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.ERROR, str(exc))
                        span.record_exception(exc)
                        
                        telemetry_errors_total.inc(category="REPOSITORY", error_type=type(exc).__name__)
                        raise exc

        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator


def instrument_provider(provider_name: str, endpoint: str):
    """Decorator to instrument external provider requests."""
    def decorator(func: Callable):
        tracer = get_tracer("provider")

        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            symbol = args[0] if args else kwargs.get("symbol", "-")
            start_time = time.perf_counter()
            span_name = f"Provider.{provider_name}.{endpoint}"

            with ContextManager(extra_fields={"provider": provider_name, "symbol": symbol, "execution_step": "START"}):
                logger.info(
                    f"Provider Call START: provider={provider_name} endpoint={endpoint} symbol={symbol}",
                    extra={"event": "provider.request.started"}
                )
                
                with tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("provider", provider_name)
                    span.set_attribute("endpoint", endpoint)
                    span.set_attribute("symbol", symbol)
                    try:
                        result = func(self, *args, **kwargs)
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.OK)
                        
                        provider_request_duration_seconds.observe(
                            duration_ms / 1000.0, provider=provider_name, endpoint=endpoint, symbol=symbol
                        )
                        try:
                            from app.core.observability.metrics import slo_provider_sla_status
                            slo_provider_sla_status.set(1.0 if duration_ms <= 1000.0 else 0.0, provider=provider_name, endpoint=endpoint)
                        except Exception:
                            pass

                        if duration_ms > 1000.0:
                            from app.core.observability.slow_operations import check_slow_operation
                            check_slow_operation("Provider", duration_ms, details={"provider": provider_name, "endpoint": endpoint, "symbol": symbol})
                        
                        with ContextManager(extra_fields={"execution_step": "FINISH", "duration_ms": int(duration_ms)}):
                            logger.info(
                                f"Provider Call FINISH: provider={provider_name} endpoint={endpoint} symbol={symbol} - Success - Duration: {duration_ms:.2f}ms",
                                extra={"event": "provider.request.completed", "duration_ms": int(duration_ms)}
                            )
                        return result
                    except Exception as exc:
                        duration_ms = (time.perf_counter() - start_time) * 1000
                        span.set_status(StatusCode.ERROR, str(exc))
                        span.record_exception(exc)
                        
                        telemetry_errors_total.inc(category="PROVIDER", error_type=type(exc).__name__)
                        
                        if duration_ms > 1000.0:
                            from app.core.observability.slow_operations import check_slow_operation
                            check_slow_operation("Provider", duration_ms, details={"provider": provider_name, "endpoint": endpoint, "symbol": symbol, "error": str(exc)})
                        
                        with ContextManager(extra_fields={"execution_step": "FAIL", "duration_ms": int(duration_ms)}):
                            logger.error(
                                f"Provider Call FAIL: provider={provider_name} endpoint={endpoint} symbol={symbol} - Failed - Duration: {duration_ms:.2f}ms - Error: {exc}",
                                exc_info=True,
                                extra={"event": "provider.request.failed", "duration_ms": int(duration_ms)}
                            )
                        raise exc
        return wrapper
    return decorator
