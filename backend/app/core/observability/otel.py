import os
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Generator, Optional, Union

# Try importing real OpenTelemetry
try:
    from opentelemetry import trace
    from opentelemetry.trace import Span, Tracer, StatusCode
    HAS_OTEL = True
except ImportError:
    HAS_OTEL = False
    from enum import Enum
    class StatusCode(Enum):
        UNSET = 0
        OK = 1
        ERROR = 2

def generate_trace_id() -> str:
    """Generates a 32-character hex trace ID (W3C standard)."""
    return uuid.uuid4().hex

def generate_span_id() -> str:
    """Generates a 16-character hex span ID (W3C standard)."""
    return uuid.uuid4().hex[:16]

if HAS_OTEL:
    def get_tracer(name: str) -> Tracer:
        return trace.get_tracer(name)
        
    def get_current_span() -> Span:
        return trace.get_current_span()
else:
    class MockSpan:
        def __init__(self, name: str, parent: Optional["MockSpan"] = None):
            self.name = name
            self.parent = parent
            self.attributes: Dict[str, Any] = {}
            self.status_code = "UNSET"
            self.status_description = ""
            self.exceptions = []

        def set_attribute(self, key: str, value: Any) -> "MockSpan":
            self.attributes[key] = value
            return self

        def set_status(self, code: Any, description: Optional[str] = None) -> "MockSpan":
            if hasattr(code, "name"):
                self.status_code = code.name
            else:
                self.status_code = str(code)
            if description:
                self.status_description = description
            return self

        def record_exception(self, exception: Exception) -> "MockSpan":
            self.exceptions.append(exception)
            return self

        def is_recording(self) -> bool:
            return False

        def __enter__(self) -> "MockSpan":
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_val:
                self.set_status("ERROR", str(exc_val))
                self.record_exception(exc_val)
            else:
                self.status_code = "OK"

    class MockTracer:
        def __init__(self, name: str):
            self.name = name

        @contextmanager
        def start_as_current_span(self, name: str, **kwargs) -> Generator[MockSpan, None, None]:
            from app.core.observability.request_context import (
                ctx_trace_id, ctx_span_id, ctx_parent_span_id, ContextManager
            )
            
            parent_id = ctx_span_id.get()
            trace_id = ctx_trace_id.get()
            if not trace_id or trace_id == "-":
                trace_id = generate_trace_id()
                
            new_span_id = generate_span_id()
            
            span = MockSpan(name)
            span.set_attribute("trace_id", trace_id)
            span.set_attribute("span_id", new_span_id)
            if parent_id:
                span.set_attribute("parent_span_id", parent_id)
                
            with ContextManager(trace_id=trace_id, span_id=new_span_id, parent_span_id=parent_id):
                with span:
                    yield span

    def get_tracer(name: str) -> MockTracer:
        return MockTracer(name)

    def get_current_span() -> MockSpan:
        return MockSpan("mock-current")

def inject_trace_context(carrier: Dict[str, str]) -> None:
    """Injects current correlation ID, W3C traceparent, and span context into carrier dict (e.g. HTTP headers)."""
    from app.core.observability.request_context import get_context_dict, ctx_trace_id, ctx_span_id
    ctx = get_context_dict()
    corr_id = ctx.get("correlation_id")
    req_id = ctx.get("request_id")
    user_id = ctx.get("user_id")
    job_id = ctx.get("job_id")
    
    trace_id = ctx.get("trace_id")
    span_id = ctx.get("span_id")
    
    if not trace_id or trace_id == "-":
        trace_id = generate_trace_id()
        ctx_trace_id.set(trace_id)
        
    if not span_id or span_id == "-":
        span_id = generate_span_id()
        ctx_span_id.set(span_id)
        
    # Standard W3C traceparent format: 00-{trace_id}-{parent_id/span_id}-{trace_flags}
    traceparent = f"00-{trace_id}-{span_id}-01"
    
    # Set headers
    carrier["traceparent"] = traceparent
    carrier["X-Trace-ID"] = trace_id
    carrier["X-Span-ID"] = span_id
    
    if corr_id and corr_id != "-":
        carrier["X-Correlation-Id"] = corr_id
    if req_id and req_id != "-":
        carrier["X-Request-Id"] = req_id
    if user_id and user_id != "-":
        carrier["X-User-Id"] = user_id
    if job_id and job_id != "-":
        carrier["X-Job-Id"] = job_id

def extract_trace_context(carrier: Dict[str, str]) -> Dict[str, Optional[str]]:
    """Extracts correlation context and W3C traceparent headers from a carrier dict."""
    normalized = {k.lower(): v for k, v in carrier.items()}
    
    trace_id = None
    parent_span_id = None
    
    traceparent = normalized.get("traceparent")
    if traceparent:
        parts = traceparent.split("-")
        if len(parts) >= 3:
            trace_id = parts[1]
            parent_span_id = parts[2]
            
    # Fallbacks for non-W3C trace headers
    if not trace_id:
        trace_id = normalized.get("x-trace-id")
    if not parent_span_id:
        parent_span_id = normalized.get("x-span-id") or normalized.get("x-parent-span-id")
        
    return {
        "correlation_id": normalized.get("x-correlation-id"),
        "request_id": normalized.get("x-request-id"),
        "user_id": normalized.get("x-user-id"),
        "job_id": normalized.get("x-job-id"),
        "trace_id": trace_id,
        "parent_span_id": parent_span_id,
    }
