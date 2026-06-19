import json
import logging
import random
import os
import sys
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from app.core.observability.request_context import get_context_dict
from app.core.observability.sanitizer import Sanitizer

# Default sample rates per category and level
DEFAULT_SAMPLING_RATES = {
    "API": {"INFO": 1.0, "DEBUG": 0.1},
    "DATABASE": {"INFO": 0.1, "DEBUG": 0.01},
    "CACHE": {"INFO": 0.1, "DEBUG": 0.01},
    "AUTH": {"INFO": 1.0, "DEBUG": 1.0},
    "SECURITY": {"INFO": 1.0, "DEBUG": 1.0},
    "WORKER": {"INFO": 0.5, "DEBUG": 0.05},
    "PROVIDER": {"INFO": 0.5, "DEBUG": 0.05},
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
    """Readable colorized formatter for developer consoles in local development."""
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[41m\033[37m", # Red background, white text
        "RESET": "\033[0m"
    }

    def format(self, record: logging.LogRecord) -> str:
        lvl = record.levelname
        color = self.COLORS.get(lvl, self.COLORS["RESET"])
        reset = self.COLORS["RESET"]
        
        timestamp = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        req_id = getattr(record, "request_id", "-")
        corr_id = getattr(record, "correlation_id", "-")
        trace_id = getattr(record, "trace_id", "-")
        span_id = getattr(record, "span_id", "-")
        category = getattr(record, "category", "SYSTEM")
        event = getattr(record, "event", "system.log")
        msg = Sanitizer.sanitize_string(record.getMessage())

        # Construct highly readable logging format
        log_line = (
            f"{timestamp} | {color}{lvl:<8}{reset} | "
            f"[{category} - {event}] "
            f"[req:{req_id} | corr:{corr_id} | trace:{trace_id} | span:{span_id}] - {msg}"
        )

        # Append duration if applicable
        duration_ms = getattr(record, "duration_ms", None)
        if duration_ms is not None and duration_ms != "-":
            log_line += f" ({duration_ms}ms)"

        # Append exceptions if present
        if record.exc_info:
            log_line += f"\n{self.formatException(record.exc_info)}"

        return log_line


def setup_observability_logging(name: str = "aureon") -> logging.Logger:
    """Configures global logging system to use the new enterprise-grade structured filters and formats."""
    # Read environment config
    try:
        from app.core.config import settings
        is_debug = settings.DEBUG
    except Exception:
        is_debug = True

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(TelemetryLoggingFilter())

    if is_debug:
        formatter = PrettyConsoleTelemetryFormatter()
    else:
        formatter = JsonTelemetryFormatter()

    handler.setFormatter(formatter)
    log_level = logging.DEBUG if is_debug else logging.INFO

    # Names of all observed loggers
    observed_loggers = [
        "aureon",
        "api",
        "app.core.google_auth",
        "app.startup_validation",
        "ai.service",
        "config.service",
        "news.service",
        "portfolio.service",
        "portfolio.importer",
        "providers.finnhub",
        "providers.polygon",
        "providers.yahoo",
        "workers.evaluation.signals",
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

    return logging.getLogger(name)

# Expose main telemetry logger
logger = setup_observability_logging()
