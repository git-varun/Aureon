import hashlib
import logging
import time
from typing import Any, List, Optional

import requests

from app.core.exceptions import GrowwAuthError
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import BrokerProvider
from app.core.providers.registry import registry

logger = logging.getLogger("providers.groww")

_BASE_URL = "https://api.groww.in/v1"


def _extract_groww_error(res: requests.Response) -> str:
    try:
        body = res.json()
        return (body.get("error") or {}).get("errorMessage") or res.text[:200]
    except Exception:
        return res.text[:200]


class GrowwClient:
    """Thin Groww Trading API client using the API Key + Secret checksum flow
    (https://groww.in/trade-api/docs/curl): a session access token is exchanged
    per-request rather than cached, since sync operations here are periodic/
    on-demand — the token is only valid ~10 minutes anyway."""

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret

    def _exchange_access_token(self) -> str:
        timestamp = str(int(time.time()))
        checksum = hashlib.sha256(f"{self.api_secret}{timestamp}".encode()).hexdigest()

        try:
            res = requests.post(
                f"{_BASE_URL}/token/api/access",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"key_type": "approval", "checksum": checksum, "timestamp": timestamp},
                timeout=10,
            )
        except requests.RequestException as e:
            raise GrowwAuthError(f"Groww token exchange failed: {e}") from e

        if res.status_code in (401, 403):
            # 403 commonly means "Session approval required before generating token" —
            # the daily API-session approval hasn't been completed in the Groww app yet,
            # not a bad key/secret/checksum. Surface Groww's own message when present.
            detail = _extract_groww_error(res)
            raise GrowwAuthError(f"AUTH_REQUIRED: Groww token exchange rejected — {detail}")
        res.raise_for_status()

        token = res.json().get("token")
        if not token:
            raise GrowwAuthError("Groww token exchange returned no token")
        return token

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._exchange_access_token()}",
            "Accept": "application/json",
            "X-API-VERSION": "1.0",
        }

    def get_holdings(self) -> List[dict[str, Any]]:
        try:
            res = requests.get(f"{_BASE_URL}/holdings/user", headers=self._auth_headers(), timeout=15)
        except requests.RequestException as e:
            raise GrowwAuthError(f"Groww holdings request failed: {e}") from e

        if res.status_code == 401:
            raise GrowwAuthError("AUTH_REQUIRED: Groww session rejected — re-approve API access")
        res.raise_for_status()
        return res.json().get("holdings") or []

    def health_check(self) -> bool:
        try:
            self.get_holdings()
            return True
        except Exception:
            return False


class GrowwBrokerProvider(BrokerProvider):
    """Registry-facing wrapper. sync() == get_holdings(); validate() == health_check().
    Only equity holdings are implemented — no order placement/positions, hence
    PARTIAL lifecycle status in ProviderConfig rather than ACTIVE."""

    def __init__(self):
        self._client: Optional[GrowwClient] = None

    @property
    def provider_name(self) -> str:
        return "groww"

    def capabilities(self) -> List[Capability]:
        return [Capability.PORTFOLIO, Capability.HOLDINGS]

    def authenticate(self, api_key: str | None = None, api_secret: str | None = None, **_: str) -> None:
        if not api_key or not api_secret:
            return
        self._client = GrowwClient(api_key, api_secret)

    def sync(self, **kwargs: Any) -> List[dict[str, Any]]:
        if self._client is None:
            raise GrowwAuthError("AUTH_REQUIRED: Groww api_key/api_secret not configured")
        return self._client.get_holdings()

    def validate(self, **kwargs: Any) -> bool:
        return self.health_check()

    def health_check(self) -> bool:
        if self._client is None:
            return False
        return self._client.health_check()


registry.register(GrowwBrokerProvider)
