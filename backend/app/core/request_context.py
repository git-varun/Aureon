# Backward compatibility layer for Phase 1 context imports.
# All context vars are now centralized under app.core.observability.request_context.

from app.core.observability.request_context import (
    ctx_request_id,
    ctx_correlation_id,
    ctx_user_id,
    ctx_job_id,
    ctx_extra_fields,
    get_context_dict,
    ContextManager
)
