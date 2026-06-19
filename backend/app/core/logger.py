# Backward compatibility layer for Phase 1 logger imports.
# All actual structured logging, tracing, and metrics are routed to app.core.observability.

from app.core.observability.logging import (
    logger,
    setup_observability_logging as setup_logger,
    TelemetryLoggingFilter as StructuredLoggingFilter,
    JsonTelemetryFormatter as JsonFormatter
)
from app.core.observability.decorators import (
    instrument_service,
    instrument_repository,
    instrument_provider
)
from app.core.observability.request_context import (
    ctx_request_id,
    ctx_task_id,
    ctx_worker_id
)

def patch_all_repositories():
    """No-op. Replaced by compile-time/import-time explicit self-instrumentation in BaseRepository."""
    pass

def patch_all_services():
    """No-op. Replaced by compile-time/import-time explicit self-instrumentation in BaseService."""
    pass

def patch_all_providers():
    """No-op. Replaced by compile-time/import-time explicit self-instrumentation in ProviderAdapter."""
    pass
