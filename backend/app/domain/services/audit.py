import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.domain.entities.system import AuditLog


def log_audit_action(
    session: Session,
    action: str,
    entity_type: str,
    actor_id: Optional[uuid.UUID] = None,
    entity_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None
) -> AuditLog:
    """Creates and persists an append-only audit log record."""
    audit_entry = AuditLog(
        id=uuid.uuid4(),
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        created_at=datetime.now(timezone.utc)
    )
    session.add(audit_entry)
    session.flush()  # flush to assign IDs without committing the whole transaction yet
    return audit_entry
