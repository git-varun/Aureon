import logging
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("aureon")

class FeatureFlagEvaluator:
    @staticmethod
    def evaluate(
        flag_name: str,
        user_id: Optional[str] = None,
        default_enabled: bool = False,
        experiment_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Evaluates a feature flag for a given user, logging evaluation telemetry for A/B testing."""
        from app.core.observability.request_context import get_context_dict
        
        # Fallback to current context user if not provided
        current_user = user_id or get_context_dict().get("user_id") or "anonymous"
        
        # Simple deterministic variant routing logic based on user ID hash for illustration/stub
        import hashlib
        hasher = hashlib.md5(f"{flag_name}:{current_user}".encode("utf-8"))
        hash_val = int(hasher.hexdigest(), 16)
        
        # Determine enabled state and variant (e.g. 50% split)
        enabled = (hash_val % 2 == 0) if not default_enabled else True
        variant = "variant_b" if (hash_val % 100 >= 50) else "variant_a"
        if not enabled:
            variant = "control"
            
        exp_id = experiment_id or f"exp_{flag_name}"

        # Standardized telemetry event log
        logger.info(
            f"Feature Flag Evaluation: flag={flag_name} enabled={enabled} variant={variant} user_id={current_user} experiment={exp_id}",
            extra={
                "category": "SECURITY" if "auth" in flag_name else "SYSTEM",
                "event": "feature_flag.evaluated",
                "flag_name": flag_name,
                "enabled": enabled,
                "variant": variant,
                "user_id": current_user,
                "experiment_id": exp_id
            }
        )
        
        return enabled, variant
