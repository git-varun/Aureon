"""Coinbase portfolio provider for crypto holdings."""

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, List

import requests

from app.core.config import settings
from app.shared.interfaces import AssetPayload, AssetSource


class CoinbaseSync(AssetSource):
    """Fetch crypto holdings from Coinbase Pro / Coinbase Exchange API."""

    def __init__(self):
        self.logger = logging.getLogger("Coinbase")
        self.api_key = settings.coinbase_api_key
        self.api_secret = settings.coinbase_api_secret
        self.passphrase = settings.coinbase_passphrase
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.base_url = "https://api.pro.coinbase.com"

    @property
    def provider_name(self) -> str:
        return "coinbase"

    def validate_credentials(self) -> None:
        missing = []
        if not self.api_key or self.api_key.lower() == "none":
            missing.append("COINBASE_API_KEY")
        if not self.api_secret or self.api_secret.lower() == "none":
            missing.append("COINBASE_API_SECRET")
        if not self.passphrase or self.passphrase.lower() == "none":
            missing.append("COINBASE_PASSPHRASE")
        if missing:
            raise ValueError(f"Missing Coinbase credentials: {', '.join(missing)}")

        try:
            self._request("/accounts")
        except Exception as exc:
            raise ValueError(f"Coinbase credential validation failed: {exc}") from exc

    def _sign(self, method: str, path: str, body: str = "") -> Dict[str, str]:
        timestamp = str(time.time())
        message = timestamp + method.upper() + path + body
        try:
            secret_bytes = base64.b64decode(self.api_secret)
        except Exception as exc:
            raise ValueError("COINBASE_API_SECRET must be base64 encoded") from exc

        signature = hmac.new(secret_bytes, message.encode("utf-8"), hashlib.sha256).digest()
        return {
            "CB-ACCESS-SIGN": base64.b64encode(signature).decode("utf-8"),
            "CB-ACCESS-TIMESTAMP": timestamp,
            "CB-ACCESS-KEY": self.api_key,
            "CB-ACCESS-PASSPHRASE": self.passphrase,
        }

    def _request(self, path: str, method: str = "GET", body: str = "") -> Any:
        headers = self._sign(method, path, body)
        url = f"{self.base_url}{path}"
        response = self.session.request(method, url, headers=headers, data=body, timeout=10)
        response.raise_for_status()
        return response.json()

    def fetch_holdings(self) -> List[AssetPayload]:
        if not self.api_key or not self.api_secret or not self.passphrase:
            self.logger.warning("Coinbase provider disabled: missing credentials.")
            return []

        holdings = []
        try:
            accounts = self._request("/accounts")
            for record in accounts:
                balance = float(record.get("balance") or 0)
                if balance <= 0:
                    continue
                currency = str(record.get("currency", "")).upper()
                if not currency:
                    continue

                asset_type = "crypto_cash" if currency in ("USDT", "USDC", "BUSD", "DAI") else "crypto_spot"
                symbol = f"{currency}-USD" if currency not in ("USD",) else "USD"
                holdings.append(
                    AssetPayload(
                        symbol=symbol,
                        qty=balance,
                        source="Coinbase",
                        type=asset_type,
                        avg_buy_price=0.0,
                        unrealized_pnl=0.0,
                    )
                )
        except Exception as exc:
            self.logger.error("Coinbase holdings fetch failed: %s", exc)
        self.logger.info("Coinbase payload compiled: %d assets", len(holdings))
        return holdings
