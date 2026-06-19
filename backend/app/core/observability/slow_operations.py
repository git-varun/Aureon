import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("aureon")

# Thresholds in milliseconds
THRESHOLDS = {
    "API": 500.0,
    "DB": 100.0,
    "Redis": 10.0,
    "Worker": 2000.0,
    "Provider": 1000.0,
    "Evaluation": 2000.0,
}

SUGGESTED_CAUSES = {
    "API": "Network latency, large payload serialization, or blocking CPU logic in route handlers.",
    "DB": "Unindexed queries, connection pool saturation, table locks, or high database CPU usage.",
    "Redis": "Network roundtrip overhead, large object serialization, keyspace scanning, or Redis blocked by slow commands.",
    "Worker": "Large task queues, heavy calculations, blocking I/O, or resource contention.",
    "Provider": "Downstream rate limits, DNS lookup issues, network packet loss, or provider-side service degradation.",
    "Evaluation": "Heavy LLM/neural net compute, excessive context size, or remote model API delays.",
}

def check_slow_operation(
    category: str,
    actual_ms: float,
    threshold_ms: Optional[float] = None,
    details: Optional[Dict[str, Any]] = None
) -> None:
    """Detects and logs structured warnings for slow operations across all tiers."""
    t_limit = threshold_ms if threshold_ms is not None else THRESHOLDS.get(category, 100.0)
    
    if actual_ms > t_limit:
        cause = SUGGESTED_CAUSES.get(category, "Unknown latency bottleneck.")
        warning_msg = (
            f"[SLOW OPERATION WARNING] Slow {category} operation detected. "
            f"Actual: {actual_ms:.2f}ms, Threshold: {t_limit:.2f}ms. "
            f"Suggested cause: {cause}"
        )
        
        extra_fields = {
            "event": "slow_operation_warning",
            "category": category,
            "actual_ms": round(actual_ms, 2),
            "threshold_ms": round(t_limit, 2),
            "expected_ms": round(t_limit, 2),
            "suggested_cause": cause,
            "execution_step": "SLOW_WARNING"
        }
        if details:
            extra_fields.update(details)
            
        logger.warning(warning_msg, extra=extra_fields)
