import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .context import ContextManager
from .core import logger


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs one line per HTTP request: method, path, OK/FAIL, status code,
    duration. No request/response bodies — just whether it happened and
    whether it failed."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-Id") or f"REQ-{uuid.uuid4().hex[:8].upper()}"

        label = f"{request.method} {request.url.path}"

        with ContextManager(request_id=request_id):
            start = time.perf_counter()
            try:
                response = await call_next(request)
            except Exception as exc:
                duration_ms = int((time.perf_counter() - start) * 1000)
                logger.exception(f"{label} - {exc}", component="HTTP", status="FAIL", duration_ms=duration_ms)
                raise

            duration_ms = int((time.perf_counter() - start) * 1000)
            status = "OK" if response.status_code < 400 else "FAIL"
            logger.info(
                f"{label} ({response.status_code})", component="HTTP",
                status=status, duration_ms=duration_ms,
            )
            response.headers["X-Request-Id"] = request_id
            return response
