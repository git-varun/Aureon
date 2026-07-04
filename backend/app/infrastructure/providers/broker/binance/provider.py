import hashlib
import hmac
import logging
import time
from typing import Any, List, Optional
from urllib.parse import urlencode

import requests

from app.core.exceptions import BinanceAuthError
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import BrokerProvider
from app.core.providers.registry import registry

logger = logging.getLogger("providers.binance")

_BASE_URL = "https://api.binance.com"


class BinanceClient:
    """Thin Binance Spot REST client. Signed requests per Binance's standard
    HMAC-SHA256 request-security scheme: query string (including a timestamp)
    is signed with the API secret, and the API key travels as a header."""

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret

    def _signed_get(self, path: str, params: Optional[dict] = None) -> Any:
        params = dict(params or {})
        params["timestamp"] = int(time.time() * 1000)
        query = urlencode(params)
        signature = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        query = f"{query}&signature={signature}"

        try:
            res = requests.get(
                f"{_BASE_URL}{path}?{query}",
                headers={"X-MBX-APIKEY": self.api_key},
                timeout=15,
            )
        except requests.RequestException as e:
            raise BinanceAuthError(f"Binance request failed: {e}") from e

        if res.status_code == 401:
            raise BinanceAuthError("Binance rejected the API key/secret")
        res.raise_for_status()
        return res.json()

    def get_account(self) -> dict[str, Any]:
        return self._signed_get("/api/v3/account")

    def get_balances(self) -> List[dict[str, Any]]:
        """Non-zero spot balances — Binance's /account endpoint reports every
        listed asset (mostly zero balances), so filter down to holdings."""
        balances = self.get_account().get("balances") or []
        return [b for b in balances if float(b.get("free") or 0) + float(b.get("locked") or 0) > 0]

    def health_check(self) -> bool:
        try:
            self.get_account()
            return True
        except Exception:
            return False


class BinanceBrokerProvider(BrokerProvider):
    """Registry-facing wrapper. sync() == get_balances(); validate() == health_check().
    Only spot balances are implemented — no order placement, hence PARTIAL lifecycle
    status in ProviderConfig rather than ACTIVE. Balances reflect current holdings,
    not cost basis (Binance's account endpoint has no average-price field); accurate
    P&L requires importing trade history via the CSV importer."""

    def __init__(self):
        self._client: Optional[BinanceClient] = None

    @property
    def provider_name(self) -> str:
        return "binance"

    def capabilities(self) -> List[Capability]:
        return [Capability.PORTFOLIO, Capability.HOLDINGS]

    def authenticate(self, api_key: str | None = None, api_secret: str | None = None, **_: str) -> None:
        if not api_key or not api_secret:
            return
        self._client = BinanceClient(api_key, api_secret)

    def sync(self, **kwargs: Any) -> List[dict[str, Any]]:
        if self._client is None:
            raise BinanceAuthError("AUTH_REQUIRED: Binance api_key/api_secret not configured")
        return self._client.get_balances()

    def validate(self, **kwargs: Any) -> bool:
        return self.health_check()

    def health_check(self) -> bool:
        if self._client is None:
            return False
        return self._client.health_check()


registry.register(BinanceBrokerProvider)
