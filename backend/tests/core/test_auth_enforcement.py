"""Verify that every non-exempt endpoint returns 401 without a JWT token.

Uses FastAPI TestClient with raise_server_exceptions=False so that dependency
failures surface as HTTP responses (401) rather than exceptions.
"""
import inspect

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.core.dependencies import require_auth

# Endpoints that are intentionally public (no auth required)
EXEMPT_PATHS = {
    "/health",
    "/api/auth/health",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/users/health",
    "/api/transactions/health",
    "/api/assets/health",
    "/api/analytics/health",
    "/api/news/health",
    "/docs",
    "/redoc",
    "/openapi.json",
}


def _is_exempt(path: str) -> bool:
    return path in EXEMPT_PATHS


def _has_require_auth(route: APIRoute) -> bool:
    """Check whether require_auth appears in the endpoint's function signature."""
    sig = inspect.signature(route.endpoint)
    return any(
        hasattr(p.default, "dependency") and p.default.dependency is require_auth
        for p in sig.parameters.values()
    ) or any(
        getattr(d, "dependency", None) is require_auth
        for d in route.dependencies
    )


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _collect_protected_routes():
    """Return list of (method, path) for all routes that have require_auth."""
    from app.main import app
    protected = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if _is_exempt(route.path):
            continue
        if _has_require_auth(route):
            for method in sorted(route.methods or []):
                protected.append((method, route.path))
    return protected


_PROTECTED = _collect_protected_routes()


@pytest.mark.parametrize("method,path", _PROTECTED, ids=[f"{m} {p}" for m, p in _PROTECTED])
def test_protected_route_requires_auth(client, method, path):
    """Every protected route must return 401 when called without a token."""
    # Replace path params with dummy values so the router can match the route
    url = path
    for segment in path.split("/"):
        if segment.startswith("{") and segment.endswith("}"):
            param_name = segment[1:-1]
            # Use type-appropriate placeholders
            if "id" in param_name or param_name in ("position_id", "alert_id", "notification_id"):
                url = url.replace(f"{{{param_name}}}", "999", 1)
            else:
                url = url.replace(f"{{{param_name}}}", "TEST", 1)

    fn = getattr(client, method.lower())
    response = fn(url)
    assert response.status_code == 401, (
        f"{method} {path} → expected 401 without auth, got {response.status_code}. "
        f"Body: {response.text[:200]}"
    )
