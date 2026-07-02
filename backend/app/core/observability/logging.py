import json
import logging
import random
import os
import sys
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from app.core.observability.request_context import get_context_dict
from app.core.observability.sanitizer import Sanitizer

# Default sample rates per category and level (WARNING+ always pass)
DEFAULT_SAMPLING_RATES = {
    "API": {"INFO": 1.0, "DEBUG": 0.1},
    "DATABASE": {"INFO": 1.0, "DEBUG": 0.01},
    "CACHE": {"INFO": 1.0, "DEBUG": 0.01},
    "AUTH": {"INFO": 1.0, "DEBUG": 1.0},
    "SECURITY": {"INFO": 1.0, "DEBUG": 1.0},
    "WORKER": {"INFO": 1.0, "DEBUG": 0.05},
    "PROVIDER": {"INFO": 1.0, "DEBUG": 0.05},
    "PORTFOLIO": {"INFO": 1.0, "DEBUG": 0.1},
    "EVALUATION": {"INFO": 1.0, "DEBUG": 0.1},
    "SYSTEM": {"INFO": 1.0, "DEBUG": 0.1},
    "MONITORING": {"INFO": 1.0, "DEBUG": 0.1},
}

# Logger name to category mapping fallback
LOGGER_CATEGORY_MAP = {
    "api": "API",
    "database": "DATABASE",
    "db": "DATABASE",
    "sqlalchemy": "DATABASE",
    "redis": "CACHE",
    "cache": "CACHE",
    "auth": "AUTH",
    "security": "SECURITY",
    "celery": "WORKER",
    "worker": "WORKER",
    "providers": "PROVIDER",
    "portfolio": "PORTFOLIO",
    "ai": "EVALUATION",
    "evaluation": "EVALUATION",
    "monitoring": "MONITORING",
}

class TelemetryLoggingFilter(logging.Filter):
    """Filter that auto-populates context, sanitizes fields, enforces taxonomy/categories, and handles sampling."""
    def filter(self, record: logging.LogRecord) -> bool:
        # 1. Fetch request context
        context = get_context_dict()
        
        # Inject trace/request context variables
        record.request_id = context.get("request_id", "-")
        record.correlation_id = context.get("correlation_id", "-")
        record.user_id = context.get("user_id", "-")
        record.job_id = context.get("job_id", "-")
        record.trace_id = context.get("trace_id", "-")
        record.span_id = context.get("span_id", "-")
        record.parent_span_id = context.get("parent_span_id", "-")

        # 2. Category classification
        category = getattr(record, "category", None)
        if not category:
            category = "SYSTEM"
            # Deduce from logger name
            logger_name = record.name.lower()
            for key, cat in LOGGER_CATEGORY_MAP.items():
                if key in logger_name:
                    category = cat
                    break
            record.category = category

        # 3. Enforce Event Taxonomy
        event = getattr(record, "event", None)
        if not event:
            func_name = getattr(record, "funcName", None) or "log"
            record.event = f"{record.category.lower()}.{func_name.lower()}"

        # 4. Log Sampling
        if record.levelno >= logging.WARNING:
            return True

        rate = 1.0
        level_name = record.levelname
        
        env_rate_key = f"LOG_SAMPLE_RATE_{record.category}_{level_name}"
        env_override = os.getenv(env_rate_key)
        if env_override is not None:
            try:
                rate = float(env_override)
            except ValueError:
                pass
        else:
            cat_rates = DEFAULT_SAMPLING_RATES.get(record.category, {})
            rate = cat_rates.get(level_name, 1.0 if level_name == "INFO" else 0.1)

        if rate < 1.0:
            if record.request_id and record.request_id != "-":
                val = abs(hash(record.request_id)) % 10000 / 10000.0
                if val >= rate:
                    return False
            else:
                if random.random() >= rate:
                    return False

        return True


class JsonTelemetryFormatter(logging.Formatter):
    """Production JSON Formatter that outputs structured telemetry data with built-in sanitization."""
    def format(self, record: logging.LogRecord) -> str:
        # Base JSON logs structure
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt) or datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "category": getattr(record, "category", "SYSTEM"),
            "event": getattr(record, "event", "system.log"),
            "request_id": getattr(record, "request_id", "-"),
            "correlation_id": getattr(record, "correlation_id", "-"),
            "trace_id": getattr(record, "trace_id", "-"),
            "span_id": getattr(record, "span_id", "-"),
            "parent_span_id": getattr(record, "parent_span_id", "-"),
            "job_id": getattr(record, "job_id", "-"),
            "user_id": getattr(record, "user_id", "-"),
            "service": "aureon-backend",
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "message": Sanitizer.sanitize_string(record.getMessage()),
        }

        # Inject extra duration/timing if present
        duration_ms = getattr(record, "duration_ms", None)
        if duration_ms is not None and duration_ms != "-":
            log_data["duration_ms"] = duration_ms

        # Extract extra fields passed to logger
        extras = {}
        reserved_attrs = {
            'args', 'asctime', 'created', 'exc_info', 'filename', 'funcName',
            'levelname', 'levelno', 'lineno', 'module', 'msecs', 'message',
            'msg', 'name', 'pathname', 'process', 'processName', 'relativeCreated',
            'stack_info', 'thread', 'threadName', 'category', 'event',
            'request_id', 'correlation_id', 'job_id', 'user_id', 'duration_ms',
            'trace_id', 'span_id', 'parent_span_id'
        }
        for k, v in record.__dict__.items():
            if k not in reserved_attrs and not k.startswith('_'):
                extras[k] = v

        if extras:
            log_data["details"] = Sanitizer.sanitize_data(extras)

        # Handle exception tracebacks
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


class PrettyConsoleTelemetryFormatter(logging.Formatter):
    """Compact one-liner formatter: [LABEL] operation ........ STATUS (Xms)"""
    COLORS = {
        "DEBUG":    "\033[36m",
        "INFO":     "\033[32m",
        "WARNING":  "\033[33m",
        "ERROR":    "\033[31m",
        "CRITICAL": "\033[41m\033[37m",
        "RESET":    "\033[0m",
    }

    _LABELS = {
        "API": "HTTP", "DATABASE": "DB", "CACHE": "CACHE",
        "AUTH": "AUTH", "SECURITY": "SEC", "WORKER": "JOB",
        "PROVIDER": "PROVIDER", "PORTFOLIO": "PORTFOLIO",
        "EVALUATION": "EVAL", "SYSTEM": "SVC", "MONITORING": "MONITOR",
    }
    _OP_WIDTH = 55  # chars for "[LABEL] operation" before the dots

    def format(self, record: logging.LogRecord) -> str:
        reset = self.COLORS["RESET"]
        lvl = record.levelname
        category = getattr(record, "category", "SYSTEM")
        event = getattr(record, "event", "")
        duration_ms = getattr(record, "duration_ms", None)
        status_code = getattr(record, "status_code", None)

        # Determine status label and color
        if lvl in ("ERROR", "CRITICAL"):
            status, s_color = "FAIL", self.COLORS["ERROR"]
        elif lvl == "WARNING":
            status, s_color = "WARN", self.COLORS["WARNING"]
        elif status_code is not None:
            sc = int(status_code)
            status = str(status_code)
            s_color = self.COLORS["INFO"] if sc < 400 else self.COLORS["ERROR"]
        elif event.endswith(".started"):
            status, s_color = "START", self.COLORS["DEBUG"]
        elif event.endswith(".completed"):
            status, s_color = "OK", self.COLORS["INFO"]
        elif event.endswith(".failed"):
            status, s_color = "FAIL", self.COLORS["ERROR"]
        elif event == "cache.hit":
            status, s_color = "HIT", self.COLORS["INFO"]
        elif event == "cache.miss":
            status, s_color = "MISS", self.COLORS["DEBUG"]
        else:
            status, s_color = "INFO", self.COLORS["INFO"]

        # Operation name: prefer structured extra, fall back to message
        operation = getattr(record, "operation", None)
        if not operation:
            operation = Sanitizer.sanitize_string(record.getMessage())

        label = self._LABELS.get(category, category)
        left = f"[{label}] {operation}"
        pad = max(1, self._OP_WIDTH - len(left))

        dur = f" ({duration_ms}ms)" if duration_ms is not None else ""
        line = f"{left} {'.' * pad} {s_color}{status}{reset}{dur}"

        if record.exc_info:
            line += f"\n{self.formatException(record.exc_info)}"

        return line


def setup_observability_logging(name: str = "aureon") -> logging.Logger:
    """Configure structured logging: INFO-level clean console, noisy third-parties suppressed."""
    try:
        from app.core.config import settings
        is_debug = settings.DEBUG
    except Exception:
        is_debug = True

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(TelemetryLoggingFilter())
    handler.setFormatter(PrettyConsoleTelemetryFormatter() if is_debug else JsonTelemetryFormatter())

    # Always use INFO for the console — DEBUG calls are for file/aggregation backends
    log_level = logging.INFO

    # Logger hierarchy roots — covers all app.* and workers.* sub-loggers automatically
    observed_loggers = [
        "aureon",
        "app",
        "api",
        "workers",
        "providers",
        "celery.ai",
        "celery",
        "celery.task",
        "celery.worker",
    ]

    for logger_name in observed_loggers:
        lgr = logging.getLogger(logger_name)
        if lgr.handlers:
            lgr.handlers.clear()
        lgr.addHandler(handler)
        lgr.setLevel(log_level)
        lgr.propagate = False

    # Suppress noisy third-party libraries
    for noisy in ["sqlalchemy", "sqlalchemy.engine", "urllib3", "httpx", "yfinance", "alembic"]:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return logging.getLogger(name)

# Expose main telemetry logger
logger = setup_observability_logging()
