import logging
from contextvars import ContextVar

# 1. Create a Context Variable to hold the Correlation ID
# Default is 'SYSTEM' for background cron jobs or startup tasks
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="SYSTEM")


class CorrelationIdFilter(logging.Filter):
    """Injects the Correlation ID into every log record automatically."""

    def filter(self, record):
        record.correlation_id = correlation_id_var.get()
        return True


def setup_master_logger():
    """Configures the root logger for the entire application."""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # If handlers already exist (e.g., from hot-reloading), don't duplicate them
    if logger.handlers:
        return logger

    # 2. Strict Log Structure: Time | Level | [CorrID] | Module | Message
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-7s |[%(correlation_id)s] | %(name)-15s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 3. File-Stream Logging (api.log)
    file_handler = logging.FileHandler("api.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.addFilter(CorrelationIdFilter())

    # 4. Console Logging
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.addFilter(CorrelationIdFilter())

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # 5. Mute noisy 3rd party libraries
    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    return logger
