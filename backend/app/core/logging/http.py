import time
from typing import Any

import httpx
import requests

from .core import logger
from .sanitizer import Sanitizer


def _format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes}B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f}KB"
    return f"{num_bytes / (1024 * 1024):.1f}MB"


def _response_summary(response: Any) -> str:
    """'12 items, 3.4KB' for a list response, '1 object, 512B' for a dict, or just
    the size for anything else — no response content is logged, only its shape."""
    size = _format_size(len(response.content or b""))
    try:
        data = response.json()
    except Exception:
        return size
    if isinstance(data, list):
        return f"{len(data)} items, {size}"
    if isinstance(data, dict):
        return f"1 object, {size}"
    return size


class HttpClient:
    """Explicit, logged HTTP calls for providers. No shared Session/Client object
    exists across providers today and no monkeypatching is used — providers call
    these wrappers directly instead of requests/httpx. Logs OK/FAIL, duration, and
    the shape of the response (count + size) — not the response content itself."""

    def _call(self, fn: Any, provider: str, method: str, url: str, kwargs: dict) -> Any:
        safe_url = Sanitizer.sanitize_url(url)
        label = f"{method} {safe_url}"
        start = time.perf_counter()
        try:
            response = fn(url, **kwargs)
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            # No traceback here — the caller (Provider instrument() wrapper, then
            # the HTTP boundary) logs the full traceback exactly once.
            logger.error(f"{label} - {exc}", component=provider, status="FAIL", duration_ms=duration_ms)
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        status = "OK" if response.status_code < 400 else "FAIL"
        logger.info(
            f"{label} ({response.status_code}, {_response_summary(response)})",
            component=provider, status=status, duration_ms=duration_ms,
        )
        return response

    def get(self, provider: str, url: str, **kwargs: Any) -> requests.Response:
        return self._call(requests.get, provider, "GET", url, kwargs)

    def post(self, provider: str, url: str, **kwargs: Any) -> requests.Response:
        return self._call(requests.post, provider, "POST", url, kwargs)

    def httpx_post(self, provider: str, url: str, **kwargs: Any) -> httpx.Response:
        return self._call(httpx.post, provider, "POST", url, kwargs)


http_client = HttpClient()
