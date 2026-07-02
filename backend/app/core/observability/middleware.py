import uuid
import time
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, PlainTextResponse
from app.core.observability.request_context import ContextManager
from app.core.observability.metrics import (
    registry,
    http_requests_total,
    http_request_duration_seconds
)
from app.core.observability.logging import logger
from app.core.observability.otel import (
    get_tracer, StatusCode, extract_trace_context, generate_trace_id, generate_span_id
)

class TelemetryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # 1. Intercept /metrics endpoint directly
        if request.url.path == "/metrics":
            return PlainTextResponse(registry.generate_prometheus_metrics())

        start_time = time.perf_counter()
        
        # 2. Extract correlation info from headers (supports W3C traceparent)
        headers = dict(request.headers)
        extracted = extract_trace_context(headers)
        
        req_id = extracted["request_id"] or headers.get("x-request-id") or str(uuid.uuid4())
        corr_id = extracted["correlation_id"] or headers.get("x-correlation-id") or req_id
        user_id = extracted["user_id"] or headers.get("x-user-id") or "-"
        job_id = extracted["job_id"] or headers.get("x-job-id") or "-"
        
        trace_id = extracted["trace_id"] or headers.get("x-trace-id") or generate_trace_id()
        parent_span_id = extracted["parent_span_id"]
        http_span_id = generate_span_id()

        # Extract user_id from Authorization header if present
        if user_id == "-":
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                try:
                    token = auth_header.split(" ", 1)[1]
                    from app.core.security import verify_access_token
                    user_id = verify_access_token(token)
                except Exception:
                    pass

        # 3. Setup OpenTelemetry span
        tracer = get_tracer("api")
        span_name = f"HTTP {request.method} {request.url.path}"
        
        with ContextManager(
            request_id=req_id,
            correlation_id=corr_id,
            user_id=user_id,
            job_id=job_id,
            trace_id=trace_id,
            span_id=http_span_id,
            parent_span_id=parent_span_id,
            extra_fields={"category": "API", "event": "api.request.started"}
        ) as ctx:
            _op = f"{request.method} {request.url.path}"
            logger.info(
                f"--> Request: {_op}",
                extra={"category": "API", "event": "api.request.started", "operation": _op, "method": request.method, "path": request.url.path}
            )
            
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("http.method", request.method)
                span.set_attribute("http.url", str(request.url))
                span.set_attribute("http.client_ip", request.client.host if request.client else "unknown")
                span.set_attribute("request_id", req_id)
                span.set_attribute("correlation_id", corr_id)
                span.set_attribute("trace_id", trace_id)
                span.set_attribute("span_id", http_span_id)
                if parent_span_id:
                    span.set_attribute("parent_span_id", parent_span_id)

                try:
                    response = await call_next(request)
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    
                    span.set_status(StatusCode.OK)
                    span.set_attribute("http.status_code", response.status_code)
                    
                    # Record HTTP request metrics
                    http_requests_total.inc(
                        method=request.method, path=request.url.path, status=str(response.status_code)
                    )
                    http_request_duration_seconds.observe(
                        duration_ms / 1000.0, method=request.method, path=request.url.path
                    )
                    
                    # Check slow API warning
                    from app.core.observability.slow_operations import check_slow_operation
                    check_slow_operation("API", duration_ms, details={"path": request.url.path, "method": request.method})
                    
                    # Inject correlation ids and tracecontext headers into response headers
                    response.headers["X-Request-Id"] = req_id
                    response.headers["X-Correlation-Id"] = corr_id
                    response.headers["X-Trace-ID"] = trace_id
                    response.headers["X-Span-ID"] = http_span_id
                    response.headers["traceparent"] = f"00-{trace_id}-{http_span_id}-01"
                    
                    with ContextManager(extra_fields={"execution_step": "FINISH", "duration_ms": int(duration_ms)}):
                        logger.info(
                            f"<-- Response: {_op} {response.status_code}",
                            extra={
                                "category": "API",
                                "event": "api.request.completed",
                                "operation": _op,
                                "status_code": response.status_code,
                                "duration_ms": int(duration_ms),
                                "method": request.method,
                                "path": request.url.path
                            }
                        )
                    return response

                except Exception as exc:
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    
                    http_requests_total.inc(method=request.method, path=request.url.path, status="500")
                    http_request_duration_seconds.observe(
                        duration_ms / 1000.0, method=request.method, path=request.url.path
                    )
                    
                    # Check slow API warning on failure
                    from app.core.observability.slow_operations import check_slow_operation
                    check_slow_operation("API", duration_ms, details={"path": request.url.path, "method": request.method, "error": str(exc)})
                    
                    with ContextManager(extra_fields={"execution_step": "FAIL", "duration_ms": int(duration_ms)}):
                        logger.error(
                            f"<-- Response: {_op} FAILED - {exc}",
                            exc_info=True,
                            extra={
                                "category": "API",
                                "event": "api.request.failed",
                                "operation": _op,
                                "duration_ms": int(duration_ms),
                                "method": request.method,
                                "path": request.url.path
                            }
                        )
                    raise exc
