import os
import sys
import psutil
import time
import threading
import hashlib
import traceback
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

class ErrorFingerprinter:
    def __init__(self):
        self._lock = threading.Lock()
        self.fingerprints: Dict[str, Dict[str, Any]] = {}

    def register_error(self, exc: Exception) -> str:
        """Generates a stable hash fingerprint for an exception, tracking counts and timestamps."""
        exc_type = exc.__class__.__name__
        exc_msg = str(exc)
        
        # Build stack trace fingerprint
        tb_str = "".join(traceback.format_tb(exc.__traceback__))
        raw_string = f"{exc_type}:{exc_msg}:{tb_str}"
        fingerprint_hash = hashlib.md5(raw_string.encode("utf-8")).hexdigest()

        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            if fingerprint_hash not in self.fingerprints:
                self.fingerprints[fingerprint_hash] = {
                    "hash": fingerprint_hash,
                    "error_type": exc_type,
                    "message": exc_msg,
                    "count": 0,
                    "first_seen": now,
                    "last_seen": now,
                }
            
            data = self.fingerprints[fingerprint_hash]
            data["count"] += 1
            data["last_seen"] = now

        return fingerprint_hash

    def get_fingerprints(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.fingerprints.values())


class HealthScoreEngine:
    def __init__(self):
        pass

    def get_system_metrics(self) -> Dict[str, Any]:
        """Gathers basic OS resource utilization statistics."""
        try:
            cpu_pct = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            return {
                "cpu_usage_percent": cpu_pct,
                "memory_usage_percent": mem.percent,
                "disk_usage_percent": disk.percent,
                "thread_count": threading.active_count(),
            }
        except Exception:
            return {
                "cpu_usage_percent": 0.0,
                "memory_usage_percent": 0.0,
                "disk_usage_percent": 0.0,
                "thread_count": 1,
            }

    def compute_health_score(self) -> Dict[str, Any]:
        """Calculates system health index % based on database, cache, CPU, and memory bounds."""
        score = 100.0
        checks = {}

        # 1. Database Health Check
        from app.core.database import SessionLocal
        try:
            db_start = time.perf_counter()
            with SessionLocal() as session:
                from sqlalchemy import text
                session.execute(text("SELECT 1")).scalar()
            db_latency = (time.perf_counter() - db_start) * 1000.0
            checks["database"] = {"status": "HEALTHY", "latency_ms": round(db_latency, 2)}
        except Exception as e:
            checks["database"] = {"status": "UNHEALTHY", "error": str(e)}
            score -= 30.0

        # 2. Redis Cache Health Check
        from app.core.redis import get_redis_client
        try:
            redis_start = time.perf_counter()
            client = get_redis_client()
            client.ping()
            redis_latency = (time.perf_counter() - redis_start) * 1000.0
            checks["redis"] = {"status": "HEALTHY", "latency_ms": round(redis_latency, 2)}
        except Exception as e:
            checks["redis"] = {"status": "UNHEALTHY", "error": str(e)}
            score -= 30.0

        # 3. System Resources Utilization Checks
        sys_stats = self.get_system_metrics()
        cpu = sys_stats["cpu_usage_percent"]
        mem = sys_stats["memory_usage_percent"]
        
        checks["cpu"] = {"status": "HEALTHY" if cpu < 85 else "WARNING", "usage_percent": cpu}
        if cpu >= 85:
            score -= 10.0
        if cpu >= 95:
            score -= 10.0

        checks["memory"] = {"status": "HEALTHY" if mem < 90 else "WARNING", "usage_percent": mem}
        if mem >= 90:
            score -= 10.0
        if mem >= 98:
            score -= 10.0

        # Bound score between 0 and 100
        score = max(0.0, min(100.0, score))

        return {
            "health_score_percent": score,
            "status": "HEALTHY" if score >= 80 else ("DEGRADED" if score >= 50 else "UNHEALTHY"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
            "system_resources": sys_stats
        }


# Global Singletons
fingerprinter = ErrorFingerprinter()
health_engine = HealthScoreEngine()
