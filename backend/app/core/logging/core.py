import logging
import sys
from datetime import datetime
from typing import Any, Dict, Optional

from .sanitizer import Sanitizer


class AureonFormatter(logging.Formatter):
    """One compact line per log entry: [HH:MM:SS] LEVEL [Component] message ... STATUS (Xms)
    Whether something happened/failed and how long it took — nothing more by default."""

    COLORS = {
        "DEBUG": "\033[33m",           # yellow
        "INFO": "",                    # plain/default terminal color
        "WARNING": "\033[38;5;208m",   # orange
        "ERROR": "\033[31m",           # red
        "CRITICAL": "\033[41m\033[97m",
        "RESET": "\033[0m",
    }

    def format(self, record: logging.LogRecord) -> str:
        reset = self.COLORS["RESET"]
        level = record.levelname
        level_color = self.COLORS.get(level, "")

        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        component = getattr(record, "component", None) or record.name

        line = f"[{ts}] {level_color}{level}{reset} [{component}] {Sanitizer.sanitize_string(record.getMessage())}"

        status = getattr(record, "status", None)
        if status:
            status_color = self.COLORS["ERROR"] if status == "FAIL" else level_color
            line += f" ... {status_color}{status}{reset}"

        duration_ms = getattr(record, "duration_ms", None)
        if duration_ms is not None:
            line += f" ({duration_ms}ms)"

        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)

        return line


class AureonLogger:
    """The one logger. Every component (HTTP, DB, Redis, Celery, services,
    repositories, providers) logs through this — no per-component logging style."""

    def __init__(self, logger: logging.Logger):
        self._logger = logger

    def _log(
        self,
        level: int,
        message: str,
        *,
        component: Optional[str] = None,
        status: Optional[str] = None,
        duration_ms: Optional[int] = None,
        exc_info: Any = None,
    ) -> None:
        extra: Dict[str, Any] = {}
        if component is not None:
            extra["component"] = component
        if status is not None:
            extra["status"] = status
        if duration_ms is not None:
            extra["duration_ms"] = duration_ms
        self._logger.log(level, message, extra=extra, exc_info=exc_info)

    def debug(self, message: str, **kw: Any) -> None:
        self._log(logging.DEBUG, message, **kw)

    def info(self, message: str, **kw: Any) -> None:
        self._log(logging.INFO, message, **kw)

    def warning(self, message: str, **kw: Any) -> None:
        self._log(logging.WARNING, message, **kw)

    def error(self, message: str, **kw: Any) -> None:
        self._log(logging.ERROR, message, **kw)

    def critical(self, message: str, **kw: Any) -> None:
        self._log(logging.CRITICAL, message, **kw)

    def exception(self, message: str, **kw: Any) -> None:
        kw.setdefault("exc_info", True)
        self._log(logging.ERROR, message, **kw)


def setup_logging(name: str = "aureon") -> AureonLogger:
    """Configures the one console handler used by the entire backend."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(AureonFormatter())

    for logger_name in ["aureon", "app", "api", "workers", "providers", "celery", "celery.task", "celery.worker"]:
        lgr = logging.getLogger(logger_name)
        lgr.handlers.clear()
        lgr.addHandler(handler)
        lgr.setLevel(logging.INFO)
        lgr.propagate = False

    # Noisy third-party library internals (not part of Aureon's own instrumentation)
    for noisy in ["sqlalchemy.engine", "sqlalchemy.pool", "urllib3", "httpx", "yfinance", "alembic"]:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return AureonLogger(logging.getLogger(name))


logger = setup_logging()
