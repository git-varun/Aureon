import os
import json
import uuid
import logging
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional

class AuditLogger:
    def __init__(self, log_file_path: Optional[str] = None):
        if log_file_path is None:
            # Fallback to local logs directory relative to app
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            log_dir = os.path.join(base_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file_path = os.path.join(log_dir, "audit.log")

        self.logger = logging.getLogger("aureon.audit")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False  # DO NOT mix with app logs

        # Clear existing handlers to prevent duplicate configurations
        if self.logger.handlers:
            self.logger.handlers.clear()

        # Initialize the last event hash for chaining
        self.last_event_hash = "genesis"
        
        # Try to read the last line of the audit.log to load the last hash
        if os.path.exists(log_file_path) and os.path.getsize(log_file_path) > 0:
            try:
                with open(log_file_path, "rb") as f:
                    f.seek(0, 2)
                    pos = f.tell()
                    # Backtrack to find the start of the last line
                    while pos > 0:
                        pos -= 1
                        f.seek(pos, 0)
                        if f.read(1) == b"\n" and pos != f.tell() - 1:
                            break
                    last_line = f.readline().decode("utf-8").strip()
                    if last_line:
                        last_event = json.loads(last_line)
                        if "event_hash" in last_event:
                            self.last_event_hash = last_event["event_hash"]
            except Exception:
                pass

        try:
            handler = logging.FileHandler(log_file_path, encoding="utf-8")
            formatter = logging.Formatter("%(message)s")
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
        except Exception as e:
            # Fall back to stderr if we cannot write to log file
            print(f"Observability: Failed to initialize file audit logger: {e}. Falling back to StreamHandler.")
            handler = logging.StreamHandler()
            formatter = logging.Formatter("[AUDIT FALLBACK] %(message)s")
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    def log(
        self,
        action: str,
        entity_type: str,
        entity_id: Optional[str],
        status: str,
        details: Optional[Dict[str, Any]] = None,
        actor_id: Optional[str] = None
    ) -> None:
        from app.core.observability.request_context import get_context_dict
        from app.core.observability.sanitizer import Sanitizer

        context = get_context_dict()
        current_actor = actor_id or context.get("user_id") or "-"

        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_id": str(uuid.uuid4()),
            "actor_id": current_actor,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id or "-",
            "status": status,
            "request_id": context.get("request_id", "-"),
            "correlation_id": context.get("correlation_id", "-"),
            "trace_id": context.get("trace_id", "-"),
            "span_id": context.get("span_id", "-"),
            "parent_span_id": context.get("parent_span_id", "-"),
            "parent_hash": self.last_event_hash,
            "details": Sanitizer.sanitize_data(details or {})
        }

        # Calculate cryptographic hash chain (SHA-256) of this event (sorted keys for deterministic output)
        event_bytes = json.dumps(event, sort_keys=True).encode("utf-8")
        event_hash = hashlib.sha256(event_bytes).hexdigest()
        
        # Inject computed hash into event
        event["event_hash"] = event_hash
        self.last_event_hash = event_hash

        # Write immutable JSON audit log line
        self.logger.info(json.dumps(event))

    def verify_chain(self, log_file_path: str) -> bool:
        """Verifies the integrity of the cryptographic hash chain in the audit log file."""
        if not os.path.exists(log_file_path):
            return True
        try:
            expected_parent_hash = "genesis"
            with open(log_file_path, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    event = json.loads(line)
                    
                    # Verify parent_hash match
                    if event.get("parent_hash") != expected_parent_hash:
                        return False
                        
                    # Extract target hash and remove it to recalculate
                    target_hash = event.pop("event_hash", None)
                    event_bytes = json.dumps(event, sort_keys=True).encode("utf-8")
                    recalculated_hash = hashlib.sha256(event_bytes).hexdigest()
                    
                    if recalculated_hash != target_hash:
                        return False
                    
                    expected_parent_hash = target_hash
            return True
        except Exception:
            return False


# Global single audit logger instance
audit_logger = AuditLogger()

def log_audit_event(
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    status: str = "SUCCESS",
    details: Optional[Dict[str, Any]] = None,
    actor_id: Optional[str] = None
) -> None:
    """Convenience function to log a structured business/security audit event."""
    try:
        audit_logger.log(action, entity_type, entity_id, status, details, actor_id)
    except Exception as e:
        # Prevent audit logging issues from failing business flow
        logging.getLogger("aureon").error(f"Audit log failed for action {action}: {e}")
