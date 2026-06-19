import time
import threading
from typing import Dict, List, Tuple, Any, Optional

class Metric:
    def __init__(self, name: str, documentation: str, label_names: List[str] = None):
        self.name = name
        self.documentation = documentation
        self.label_names = label_names or []
        self._lock = threading.Lock()
        self.values: Dict[Tuple[str, ...], Any] = {}

    def _label_tuple(self, labels: Dict[str, str]) -> Tuple[str, ...]:
        return tuple(labels.get(name, "") for name in self.label_names)

    def _format_labels(self, label_values: Tuple[str, ...]) -> str:
        from app.core.config import settings
        env_val = "development" if settings.DEBUG else "production"
        
        # Inject standard operational metadata labels automatically
        pairs = [
            f'environment="{env_val}"',
            f'service="aureon-api"'
        ]
        
        if self.label_names:
            for name, value in zip(self.label_names, label_values):
                escaped = str(value).replace("\\", "\\\\").replace("\"", "\\\"")
                pairs.append(f'{name}="{escaped}"')
        return "{" + ",".join(pairs) + "}"

    def to_prometheus(self) -> str:
        raise NotImplementedError


class Counter(Metric):
    def __init__(self, name: str, documentation: str, label_names: List[str] = None):
        super().__init__(name, documentation, label_names)

    def inc(self, amount: float = 1.0, **labels) -> None:
        if amount < 0:
            raise ValueError("Counter increments must be non-negative")
        label_values = self._label_tuple(labels)
        with self._lock:
            self.values[label_values] = self.values.get(label_values, 0.0) + amount

    def to_prometheus(self) -> str:
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} counter"
        ]
        with self._lock:
            for label_values, val in self.values.items():
                lbl_str = self._format_labels(label_values)
                lines.append(f"{self.name}{lbl_str} {val}")
        return "\n".join(lines)


class Gauge(Metric):
    def __init__(self, name: str, documentation: str, label_names: List[str] = None):
        super().__init__(name, documentation, label_names)

    def set(self, val: float, **labels) -> None:
        label_values = self._label_tuple(labels)
        with self._lock:
            self.values[label_values] = float(val)

    def inc(self, amount: float = 1.0, **labels) -> None:
        label_values = self._label_tuple(labels)
        with self._lock:
            self.values[label_values] = self.values.get(label_values, 0.0) + amount

    def dec(self, amount: float = 1.0, **labels) -> None:
        label_values = self._label_tuple(labels)
        with self._lock:
            self.values[label_values] = self.values.get(label_values, 0.0) - amount

    def to_prometheus(self) -> str:
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} gauge"
        ]
        with self._lock:
            for label_values, val in self.values.items():
                lbl_str = self._format_labels(label_values)
                lines.append(f"{self.name}{lbl_str} {val}")
        return "\n".join(lines)


class Histogram(Metric):
    DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0]

    def __init__(self, name: str, documentation: str, label_names: List[str] = None, buckets: List[float] = None):
        super().__init__(name, documentation, label_names)
        self.buckets = sorted(buckets or self.DEFAULT_BUCKETS)
        if float("inf") not in self.buckets:
            self.buckets.append(float("inf"))

    def observe(self, amount: float, **labels) -> None:
        label_values = self._label_tuple(labels)
        with self._lock:
            if label_values not in self.values:
                self.values[label_values] = {
                    "count": 0,
                    "sum": 0.0,
                    "buckets": {b: 0 for b in self.buckets}
                }
            
            data = self.values[label_values]
            data["count"] += 1
            data["sum"] += float(amount)
            for b in self.buckets:
                if amount <= b:
                    data["buckets"][b] += 1

    def to_prometheus(self) -> str:
        lines = [
            f"# HELP {self.name} {self.documentation}",
            f"# TYPE {self.name} histogram"
        ]
        with self._lock:
            for label_values, data in self.values.items():
                lbl_str_base = self._format_labels(label_values)
                
                # Render buckets
                for b in self.buckets:
                    b_str = "+Inf" if b == float("inf") else str(b)
                    
                    # Construct labels with le="..." and auto environment/service
                    from app.core.config import settings
                    env_val = "development" if settings.DEBUG else "production"
                    
                    le_labels = [
                        f'environment="{env_val}"',
                        f'service="aureon-api"'
                    ]
                    for name, value in zip(self.label_names, label_values):
                        escaped = str(value).replace("\\", "\\\\").replace("\"", "\\\"")
                        le_labels.append(f'{name}="{escaped}"')
                    le_labels.append(f'le="{b_str}"')
                    lbl_str_le = "{" + ",".join(le_labels) + "}"
                    
                    val = data["buckets"][b]
                    lines.append(f"{self.name}_bucket{lbl_str_le} {val}")
                
                lines.append(f"{self.name}_sum{lbl_str_base} {data['sum']}")
                lines.append(f"{self.name}_count{lbl_str_base} {data['count']}")
        return "\n".join(lines)


class MetricsRegistry:
    def __init__(self):
        self._metrics: Dict[str, Metric] = {}
        self._lock = threading.Lock()

    def register(self, metric: Metric) -> Metric:
        with self._lock:
            if metric.name in self._metrics:
                return self._metrics[metric.name]
            self._metrics[metric.name] = metric
            return metric

    def generate_prometheus_metrics(self) -> str:
        # Dynamically collect system resource utilization before outputting metrics
        try:
            import psutil
            import gc
            import threading
            from app.core.redis import redis_pool
            from app.core.database import engine

            # 1. Update CPU, Memory, Thread gauges
            system_cpu_usage_percent.set(psutil.cpu_percent(interval=None))
            mem = psutil.virtual_memory()
            system_memory_usage_percent.set(mem.percent)
            system_threads_count.set(threading.active_count())

            # 2. Update GC pauses count (collections sum)
            try:
                gc_stats = gc.get_stats()
                total_pauses = sum(stat.get("collections", 0) for stat in gc_stats)
                system_gc_pause_count.set(total_pauses)
            except Exception:
                pass

            # 3. Update Redis pool usage
            try:
                in_use = len(redis_pool._in_use_connections) if hasattr(redis_pool, "_in_use_connections") else 0
                created = len(redis_pool._created_connections) if hasattr(redis_pool, "_created_connections") else 0
                redis_pool_usage.set(in_use, pool_state="active")
                redis_pool_usage.set(max(0, created - in_use), pool_state="idle")
            except Exception:
                pass

            # 4. Update Database pool active connections
            try:
                if hasattr(engine, "pool"):
                    pool = engine.pool
                    db_connection_pool_usage.set(pool.checkedout(), pool_state="active")
                    db_connection_pool_usage.set(pool.checkedin(), pool_state="idle")
                    db_connection_pool_usage.set(pool.size(), pool_state="size")
            except Exception:
                pass

            # 5. Celery Worker Concurrency
            try:
                from app.workers.celery_app import celery_app
                if not celery_app.conf.task_always_eager:
                    inspector = celery_app.control.inspect()
                    if inspector:
                        stats = inspector.stats()
                        if stats:
                            total_concurrency = sum(stat.get("pool", {}).get("max-concurrency", 0) for stat in stats.values())
                            celery_worker_concurrency.set(total_concurrency)
            except Exception:
                pass

            # 6. DLQ size and queue delays (fetch from Redis queue sizes)
            try:
                from app.core.redis import get_redis_client
                client = get_redis_client()
                # Check celery queue lengths
                for qname in ["celery", "default", "dlq"]:
                    qlen = client.llen(qname)
                    if qlen:
                        if qname == "dlq":
                            dlq_size.set(qlen)
                        celery_queue_depth.set(qlen, queue_name=qname)
            except Exception:
                pass

        except Exception:
            pass

        output = []
        with self._lock:
            for metric in self._metrics.values():
                output.append(metric.to_prometheus())
        return "\n\n".join(output) + "\n"


# Global registry
registry = MetricsRegistry()

# ── Standard Metrics ───────────────────────────────────────────────────

http_requests_total = registry.register(
    Counter("http_requests_total", "Total HTTP requests handled", ["method", "path", "status"])
)

http_request_duration_seconds = registry.register(
    Histogram("http_request_duration_seconds", "HTTP request processing latency", ["method", "path"])
)

db_query_duration_seconds = registry.register(
    Histogram("db_query_duration_seconds", "SQLAlchemy query latencies", ["operation", "table"])
)

redis_operation_duration_seconds = registry.register(
    Histogram("redis_operation_duration_seconds", "Redis execution timings", ["operation"])
)

service_execution_duration_seconds = registry.register(
    Histogram("service_execution_duration_seconds", "Domain services latency", ["service", "function"])
)

repository_execution_duration_seconds = registry.register(
    Histogram("repository_execution_duration_seconds", "Infrastructure repositories latency", ["repository", "function"])
)

provider_request_duration_seconds = registry.register(
    Histogram("provider_request_duration_seconds", "External market data providers latency", ["provider", "endpoint", "symbol"])
)

celery_task_duration_seconds = registry.register(
    Histogram("celery_task_duration_seconds", "Celery tasks latency", ["task_name", "status"])
)

ai_evaluation_duration_seconds = registry.register(
    Histogram("ai_evaluation_duration_seconds", "AI evaluations latency", ["feature_name", "model"])
)

cache_hits_total = registry.register(
    Counter("cache_hits_total", "Cache hits counter", ["cache_key_prefix"])
)

cache_misses_total = registry.register(
    Counter("cache_misses_total", "Cache misses counter", ["cache_key_prefix"])
)

db_connection_pool_usage = registry.register(
    Gauge("db_connection_pool_usage", "Database pool active connections count", ["pool_state"])
)

celery_queue_depth = registry.register(
    Gauge("celery_queue_depth", "Celery tasks queue depth", ["queue_name"])
)

telemetry_errors_total = registry.register(
    Counter("telemetry_errors_total", "Count of exceptions encountered in system operations", ["category", "error_type"])
)

# ── SLO Metrics ────────────────────────────────────────────────────────

slo_availability = registry.register(
    Gauge("slo_availability", "SLO availability status (1.0 for healthy, 0.0 for unhealthy)", ["endpoint"])
)

slo_latency_seconds = registry.register(
    Histogram("slo_latency_seconds", "SLO latency target tracking", ["operation", "slo_target"])
)

slo_error_budget_percentage = registry.register(
    Gauge("slo_error_budget_percentage", "SLO remaining error budget percentage", ["slo_name"])
)

slo_success_rate = registry.register(
    Gauge("slo_success_rate", "SLO success rate tracking", ["operation"])
)

slo_queue_delay_seconds = registry.register(
    Histogram("slo_queue_delay_seconds", "Celery task queue propagation delay", ["queue_name"])
)

slo_provider_sla_status = registry.register(
    Gauge("slo_provider_sla_status", "SLA compliance for external providers (1.0 compliant, 0.0 breached)", ["provider", "endpoint"])
)

slo_evaluation_sla_status = registry.register(
    Gauge("slo_evaluation_sla_status", "SLA compliance for AI evaluations (1.0 compliant, 0.0 breached)", ["feature_name"])
)

slo_data_freshness_sla_status = registry.register(
    Gauge("slo_data_freshness_sla_status", "SLA compliance for data freshness (1.0 compliant, 0.0 breached)", ["data_type"])
)

# ── Resource Usage Metrics ─────────────────────────────────────────────

system_cpu_usage_percent = registry.register(
    Gauge("system_cpu_usage_percent", "System CPU usage percentage")
)

system_memory_usage_percent = registry.register(
    Gauge("system_memory_usage_percent", "System Memory usage percentage")
)

system_threads_count = registry.register(
    Gauge("system_threads_count", "System active threads count")
)

system_gc_pause_count = registry.register(
    Gauge("system_gc_pause_count", "System garbage collection pause count")
)

redis_pool_usage = registry.register(
    Gauge("redis_pool_usage", "Redis connection pool usage states", ["pool_state"])
)

celery_worker_concurrency = registry.register(
    Gauge("celery_worker_concurrency", "Celery workers total configured concurrency limits")
)

# ── Dead Letter Queue (DLQ) Metrics ─────────────────────────────────────

dlq_size = registry.register(
    Gauge("dlq_size", "Current number of failed tasks sitting in the Dead Letter Queue")
)

dlq_retry_count = registry.register(
    Counter("dlq_retry_count", "Total number of task retries attempted from DLQ")
)

dlq_retry_success = registry.register(
    Counter("dlq_retry_success", "Total number of successful retries from DLQ")
)

dlq_retry_failure = registry.register(
    Counter("dlq_retry_failure", "Total number of failed retries from DLQ")
)

dlq_oldest_failed_task_age_seconds = registry.register(
    Gauge("dlq_oldest_failed_task_age_seconds", "Age of the oldest failed task in the DLQ")
)

dlq_average_retries = registry.register(
    Gauge("dlq_average_retries", "Average retries across DLQ tasks")
)
