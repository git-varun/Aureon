"""NPS portfolio provider — manual balance entry (CRA has no public API).

Configure via the UI with a JSON object:
  {
    "tier1_balance": 200000,
    "tier2_balance": 50000
  }

Each tier maps to a separate AssetPayload (NPS_TIER1, NPS_TIER2).
Balances with value 0 or absent are omitted.
"""

import json
import logging
from typing import Any, Dict, List

from pydantic import ValidationError

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import AssetPayload, AssetSource

logger = logging.getLogger("providers.nps")


class NPSSync(AssetSource):
    """Load NPS holdings from manually-configured balance JSON."""

    def __init__(self, cred_manager: CredentialManager):
        self._raw = (cred_manager.get_credential("nps", "corpus_json") or "").strip()

    @property
    def provider_name(self) -> str:
        return "nps"

    def validate_credentials(self) -> None:
        data = self._load()
        if not data:
            raise ValueError("nps.corpus_json must be a non-empty JSON object.")

    def _load(self) -> Dict[str, Any]:
        if not self._raw:
            return {}
        try:
            data = json.loads(self._raw)
        except json.JSONDecodeError as exc:
            raise ValueError("nps.corpus_json must be valid JSON") from exc
        if not isinstance(data, dict):
            raise ValueError("nps.corpus_json must be a JSON object")
        return data

    def fetch_holdings(self) -> List[AssetPayload]:
        try:
            data = self._load()
        except ValueError as exc:
            logger.error("NPSSync: invalid config: %s", exc)
            return []

        if not data:
            return []

        tiers = [
            ("NPS_TIER1", float(data.get("tier1_balance", 0) or 0)),
            ("NPS_TIER2", float(data.get("tier2_balance", 0) or 0)),
        ]

        results: List[AssetPayload] = []
        for symbol, balance in tiers:
            if balance <= 0:
                continue
            try:
                results.append(AssetPayload(
                    symbol=symbol,
                    qty=1.0,
                    avg_buy_price=balance,
                    source="NPS (Manual)",
                    type="nps",
                    unrealized_pnl=0.0,
                    positions=[{
                        "source": "NPS (Manual)",
                        "market_type": "spot",
                        "position_type": "long",
                        "qty": 1.0,
                        "avg_buy_price": balance,
                        "unrealized_pnl": 0.0,
                    }],
                ))
            except ValidationError as exc:
                logger.error("NPSSync schema error for %s: %s", symbol, exc)

        logger.info("NPSSync: yielding %d NPS assets", len(results))
        return results
