import contextvars
from typing import Dict, Any, Optional

# Core context variables
ctx_request_id = contextvars.ContextVar("request_id", default=None)
ctx_correlation_id = contextvars.ContextVar("correlation_id", default=None)
ctx_user_id = contextvars.ContextVar("user_id", default=None)
ctx_job_id = contextvars.ContextVar("job_id", default=None)
ctx_task_id = contextvars.ContextVar("task_id", default=None)
ctx_worker_id = contextvars.ContextVar("worker_id", default=None)

# Distributed W3C Trace context variables
ctx_trace_id = contextvars.ContextVar("trace_id", default=None)
ctx_span_id = contextvars.ContextVar("span_id", default=None)
ctx_parent_span_id = contextvars.ContextVar("parent_span_id", default=None)

# Extra logging fields (portfolio_id, asset_id, evaluation_id, etc.)
ctx_extra_fields = contextvars.ContextVar("extra_fields", default={})

def get_context_dict() -> Dict[str, Any]:
    """Retrieves all active context variables as a dictionary."""
    req_id = ctx_request_id.get()
    corr_id = ctx_correlation_id.get()
    
    # Auto-fallback
    if not corr_id and req_id:
        corr_id = req_id
        
    context = {
        "request_id": req_id or "-",
        "correlation_id": corr_id or "-",
        "user_id": ctx_user_id.get() or "-",
        "job_id": ctx_job_id.get() or "-",
        "task_id": ctx_task_id.get() or "-",
        "worker_id": ctx_worker_id.get() or "-",
        "trace_id": ctx_trace_id.get() or "-",
        "span_id": ctx_span_id.get() or "-",
        "parent_span_id": ctx_parent_span_id.get() or "-",
    }
    
    # Merge extra fields
    extra = ctx_extra_fields.get()
    if extra:
        context.update(extra)
        
    return context

class ContextManager:
    """Context manager to cleanly set and reset request/job/trace contexts in any execution flow."""
    def __init__(self, **kwargs):
        self.tokens = {}
        self.values = kwargs
        
    def __enter__(self):
        for key, val in self.values.items():
            if val is None:
                continue
            if key == "request_id":
                self.tokens[key] = ctx_request_id.set(val)
            elif key == "correlation_id":
                self.tokens[key] = ctx_correlation_id.set(val)
            elif key == "user_id":
                self.tokens[key] = ctx_user_id.set(str(val))
            elif key == "job_id":
                self.tokens[key] = ctx_job_id.set(val)
            elif key == "task_id":
                self.tokens[key] = ctx_task_id.set(val)
            elif key == "worker_id":
                self.tokens[key] = ctx_worker_id.set(val)
            elif key == "trace_id":
                self.tokens[key] = ctx_trace_id.set(val)
            elif key == "span_id":
                self.tokens[key] = ctx_span_id.set(val)
            elif key == "parent_span_id":
                self.tokens[key] = ctx_parent_span_id.set(val)
            elif key == "extra_fields":
                current_extra = ctx_extra_fields.get().copy()
                current_extra.update(val)
                self.tokens[key] = ctx_extra_fields.set(current_extra)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        for key, token in reversed(list(self.tokens.items())):
            if key == "request_id":
                ctx_request_id.reset(token)
            elif key == "correlation_id":
                ctx_correlation_id.reset(token)
            elif key == "user_id":
                ctx_user_id.reset(token)
            elif key == "job_id":
                ctx_job_id.reset(token)
            elif key == "task_id":
                ctx_task_id.reset(token)
            elif key == "worker_id":
                ctx_worker_id.reset(token)
            elif key == "trace_id":
                ctx_trace_id.reset(token)
            elif key == "span_id":
                ctx_span_id.reset(token)
            elif key == "parent_span_id":
                ctx_parent_span_id.reset(token)
            elif key == "extra_fields":
                ctx_extra_fields.reset(token)
