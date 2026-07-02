import hashlib
import logging
from typing import Any, Optional

import requests

from app.core.exceptions import ZerodhaAuthError

logger = logging.getLogger("providers.zerodha")

_BASE_URL = "https://api.kite.trade"
_LOGIN_URL = "https://kite.zerodha.com/connect/login"


class ZerodhaClient:
    """Thin Kite Connect HTTP client. Not a ProviderAdapter — holdings-fetch doesn't
    fit the get_quote/get_news/health_check shape used by the price/news providers."""

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
            res = requests.post(
                f"{_BASE_URL}/session/token",
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
            res = requests.get(f"{_BASE_URL}/portfolio/holdings", headers=self._auth_header(), timeout=15)
        except requests.RequestException as e:
            raise ZerodhaAuthError(f"Zerodha holdings request failed: {e}") from e

        if res.status_code == 403:
            raise ZerodhaAuthError("AUTH_REQUIRED: Zerodha access token expired")
        res.raise_for_status()
        return res.json().get("data") or []

    def health_check(self) -> bool:
        try:
            res = requests.get(f"{_BASE_URL}/user/profile", headers=self._auth_header(), timeout=5)
            return res.status_code == 200
        except Exception:
            return False
