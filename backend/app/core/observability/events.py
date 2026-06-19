from datetime import datetime, timezone
import uuid
from typing import Any, Dict, Optional

class DomainEvent:
    event_type: str = "domain.event"
    version: str = "1.0.0"

    def __init__(self, **kwargs):
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.event_id = str(uuid.uuid4())
        self.data = kwargs

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "version": self.version,
            "timestamp": self.timestamp,
            "data": self.data
        }

class PortfolioImported(DomainEvent):
    event_type = "portfolio.imported"
    version = "1.0.0"

class PortfolioDeleted(DomainEvent):
    event_type = "portfolio.deleted"
    version = "1.0.0"

class RecommendationGenerated(DomainEvent):
    event_type = "recommendation.generated"
    version = "1.0.0"

class RecommendationAccepted(DomainEvent):
    event_type = "recommendation.accepted"
    version = "1.0.0"

class EvaluationCompleted(DomainEvent):
    event_type = "evaluation.completed"
    version = "1.0.0"

class WatchlistUpdated(DomainEvent):
    event_type = "watchlist.updated"
    version = "1.0.0"

class SignalCreated(DomainEvent):
    event_type = "signal.created"
    version = "1.0.0"

class ProviderDisabled(DomainEvent):
    event_type = "provider.disabled"
    version = "1.0.0"

class CalibrationStarted(DomainEvent):
    event_type = "calibration.started"
    version = "1.0.0"

class PortfolioRebalanced(DomainEvent):
    event_type = "portfolio.rebalanced"
    version = "1.0.0"

def emit_domain_event(event: DomainEvent) -> None:
    """Emits a structured domain event, logs it under the event taxonomy, and triggers metrics/auditing as needed."""
    from app.core.observability.logging import logger
    from app.core.observability.audit import log_audit_event
    from app.core.observability.metrics import registry, Counter

    event_dict = event.to_dict()
    
    # 1. Structured Logging under the event taxonomy
    logger.info(
        f"Domain Event {event.event_type} (v{event.version}) emitted: {event.data}",
        extra={"event_taxonomy": event.event_type, "event_data": event_dict}
    )

    # 2. Increment global metrics counter for this event type
    metric_name = f"domain_event_{event.event_type.replace('.', '_')}_total"
    try:
        # Fast registry fetch or register
        counter = registry._metrics.get(metric_name)
        if not counter:
            counter = registry.register(
                Counter(metric_name, f"Total count of {event.event_type} domain events")
            )
        # Avoid direct cast errors, guarantee it is Counter
        if isinstance(counter, Counter):
            counter.inc()
    except Exception:
        pass

    # 3. Secure Audit Logging for critical events
    audit_critical_events = {
        "portfolio.imported": ("PORTFOLIO_IMPORT", "portfolio"),
        "portfolio.deleted": ("PORTFOLIO_DELETE", "portfolio"),
        "recommendation.accepted": ("RECOMMENDATION_ACCEPT", "recommendation"),
        "provider.disabled": ("PROVIDER_DISABLE", "provider"),
        "portfolio.rebalanced": ("PORTFOLIO_REBALANCE", "portfolio"),
    }
    
    if event.event_type in audit_critical_events:
        action, entity_type = audit_critical_events[event.event_type]
        entity_id = event.data.get("portfolio_id") or event.data.get("recommendation_id") or event.data.get("provider_name")
        log_audit_event(
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            status="SUCCESS",
            details=event.data
        )
