import contextvars
from typing import Any, Dict

# Every execution (HTTP request or Celery task) gets exactly one Request ID, formatted
# as "REQ-XXXXXXXX", that every related log line carries — this is the single
# correlation mechanism (no separate trace/span/correlation ids to reconcile).
ctx_request_id = contextvars.ContextVar("request_id", default=None)
ctx_task_id = contextvars.ContextVar("task_id", default=None)
ctx_user_id = contextvars.ContextVar("user_id", default=None)
ctx_worker_id = contextvars.ContextVar("worker_id", default=None)
ctx_extra_fields: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar("extra_fields", default={})


def get_context_dict() -> Dict[str, Any]:
    """Everything the formatter needs to stamp onto a log record."""
    context = {
        "request_id": ctx_request_id.get(),
        "task_id": ctx_task_id.get(),
        "user_id": ctx_user_id.get(),
        "worker_id": ctx_worker_id.get(),
    }
    extra = ctx_extra_fields.get()
    if extra:
        context.update(extra)
    return context


class ContextManager:
    """Sets/resets request/task/user context cleanly across any execution flow."""

    _VARS = {
        "request_id": ctx_request_id,
        "task_id": ctx_task_id,
        "user_id": ctx_user_id,
        "worker_id": ctx_worker_id,
    }

    def __init__(self, **kwargs: Any):
        self.values = kwargs
        self.tokens: Dict[str, contextvars.Token] = {}

    def __enter__(self) -> "ContextManager":
        for key, val in self.values.items():
            if val is None:
                continue
            if key in self._VARS:
                self.tokens[key] = self._VARS[key].set(str(val) if key == "user_id" else val)
            elif key == "extra_fields":
                current = ctx_extra_fields.get().copy()
                current.update(val)
                self.tokens[key] = ctx_extra_fields.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        for key, token in reversed(list(self.tokens.items())):
            if key in self._VARS:
                self._VARS[key].reset(token)
            elif key == "extra_fields":
                ctx_extra_fields.reset(token)
