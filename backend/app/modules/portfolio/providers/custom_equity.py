"""Custom equity portfolio provider for environment-configured holdings."""

import json
import logging
from typing import Any, Dict, List

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import AssetPayload, AssetSource


class CustomEquitySync(AssetSource):
    """Load custom equity holdings from JSON configuration."""

    def __init__(self, cred_manager: CredentialManager):
        self.logger = logging.getLogger("CustomEquity")
        json_payload, file_path = cred_manager.get_custom_equity_credentials()
        self.json_payload = (json_payload or "").strip()
        self.file_path = (file_path or "").strip()

    @property
    def provider_name(self) -> str:
        return "custom_equity"

    def validate_credentials(self) -> None:
        holdings = self._load_holdings()
        if not holdings:
            raise ValueError(
                "CUSTOM_EQUITY_HOLDINGS_JSON or CUSTOM_EQUITY_HOLDINGS_FILE must contain a non-empty JSON array of holdings."
            )

    def _load_holdings(self) -> List[Dict[str, Any]]:
        raw = self.json_payload
        if not raw and self.file_path:
            try:
                with open(self.file_path, "r", encoding="utf-8") as handle:
                    raw = handle.read().strip()
            except FileNotFoundError:
                raise ValueError(f"Holdings file not found: {self.file_path}")

        if not raw:
            return []

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("CUSTOM_EQUITY_HOLDINGS_JSON must be valid JSON") from exc

        if not isinstance(data, list):
            raise ValueError("Holdings payload must be a JSON array of asset objects")
        return data

    def fetch_holdings(self) -> List[AssetPayload]:
        holdings: List[AssetPayload] = []
        try:
            raw_holdings = self._load_holdings()
            for item in raw_holdings:
                symbol = str(item.get("symbol", "")).strip()
                qty = float(item.get("qty", 0) or 0)
                if not symbol or qty <= 0:
                    continue

                holdings.append(
                    AssetPayload(
                        symbol=symbol,
                        qty=qty,
                        avg_buy_price=float(item.get("avg_buy_price", 0.0) or 0.0),
                        source=str(item.get("source", "custom_equity")) or "custom_equity",
                        type=str(item.get("type", "equity")).lower(),
                        unrealized_pnl=float(item.get("unrealized_pnl", 0.0) or 0.0),
                    )
                )
        except ValueError as exc:
            self.logger.error("Custom equity holdings invalid: %s", exc)
        except Exception as exc:
            self.logger.error("Custom equity provider failed: %s", exc)
        self.logger.info("Custom equity payload compiled: %d assets", len(holdings))
        return holdings
