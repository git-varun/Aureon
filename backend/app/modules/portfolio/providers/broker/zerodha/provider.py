import hashlib
from typing import Any, List, Optional

import requests

from app.core.exceptions import RateLimitError, ZerodhaAuthError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import BrokerProvider
from app.core.providers.registry import registry

_BASE_URL = "https://api.kite.trade"
_LOGIN_URL = "https://kite.zerodha.com/connect/login"


class ZerodhaClient:
    """Thin Kite Connect HTTP client. Wrapped by ZerodhaBrokerProvider below for
    registry/interface conformance; also used directly by the OAuth login/callback
    endpoints (app/api/v1/config.py) since that flow needs generate_session()/login_url()
    ahead of having a full access_token to authenticate() with."""

    def __init__(self, api_key: str, api_secret: Optional[str] = None, access_token: Optional[str] = None):
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token = access_token

    def login_url(self) -> str:
        return f"{_LOGIN_URL}?api_key={self.api_key}&v=3"

    def generate_session(self, request_token: str) -> dict[str, Any]:
        if not self.api_secret:
            raise ZerodhaAuthError("Zerodha api_secret is not configured")

        checksum = hashlib.sha256(
            f"{self.api_key}{request_token}{self.api_secret}".encode("utf-8")
        ).hexdigest()

        try:
            res = http_client.post(
                "Zerodha", f"{_BASE_URL}/session/token",
                data={"api_key": self.api_key, "request_token": request_token, "checksum": checksum},
                timeout=10,
            )
        except requests.RequestException as e:
            raise ZerodhaAuthError(f"Zerodha session exchange failed: {e}") from e

        if res.status_code == 403:
            raise ZerodhaAuthError("Zerodha rejected the login request token")
        res.raise_for_status()

        data = res.json().get("data") or {}
        access_token = data.get("access_token")
        if not access_token:
            raise ZerodhaAuthError("Zerodha session exchange returned no access_token")

        self.access_token = access_token
        return data

    def _auth_header(self) -> dict[str, str]:
        if not self.access_token:
            raise ZerodhaAuthError("AUTH_REQUIRED: Zerodha is not connected")
        return {"Authorization": f"token {self.api_key}:{self.access_token}"}

    def get_holdings(self) -> list[dict[str, Any]]:
        try:
            res = http_client.get("Zerodha", f"{_BASE_URL}/portfolio/holdings", headers=self._auth_header(), timeout=15)
        except requests.RequestException as e:
            raise ZerodhaAuthError(f"Zerodha holdings request failed: {e}") from e

        if res.status_code == 403:
            raise ZerodhaAuthError("AUTH_REQUIRED: Zerodha access token expired")
        if res.status_code == 429:
            raise RateLimitError("Zerodha rate limited the request — try again later")
        res.raise_for_status()
        return res.json().get("data") or []

    def health_check(self) -> bool:
        try:
            res = http_client.get("Zerodha", f"{_BASE_URL}/user/profile", headers=self._auth_header(), timeout=5)
            return res.status_code == 200
        except Exception:
            return False


class ZerodhaBrokerProvider(BrokerProvider):
    """Registry-facing wrapper. sync() == get_holdings(); validate() == health_check().
    Only holdings are implemented — no order placement/quote support, hence PARTIAL
    lifecycle status in ProviderConfig rather than ACTIVE."""

    def __init__(self):
        self._client: Optional[ZerodhaClient] = None

    @property
    def provider_name(self) -> str:
        return "zerodha"

    def capabilities(self) -> List[Capability]:
        return [Capability.PORTFOLIO, Capability.HOLDINGS]

    def authenticate(self, api_key: str | None = None, api_secret: str | None = None, access_token: str | None = None, **_: str) -> None:
        if not api_key:
            return
        self._client = ZerodhaClient(api_key, api_secret, access_token)

    def sync(self, **kwargs: Any) -> list[dict[str, Any]]:
        if self._client is None:
            raise ZerodhaAuthError("AUTH_REQUIRED: Zerodha is not connected")
        return self._client.get_holdings()

    def validate(self, **kwargs: Any) -> bool:
        return self.health_check()

    def health_check(self) -> bool:
        if self._client is None:
            return False
        return self._client.health_check()


registry.register(ZerodhaBrokerProvider)
