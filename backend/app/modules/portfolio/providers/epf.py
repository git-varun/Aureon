"""EPF portfolio provider — manual corpus entry (EPFO has no public API).

Configure via the UI with a JSON object:
  {
    "corpus": 500000,
    "employee_monthly": 1800,
    "employer_monthly": 1800,
    "vpf_monthly": 0,
    "interest_rate": 8.15
  }

`corpus` is treated as the current market value (qty=1, avg_buy_price=corpus).
If corpus is absent, the provider estimates it from 12 months of contributions.
"""

import json
import logging
from typing import Any, Dict, List

from pydantic import ValidationError

from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.interfaces import AssetPayload, AssetSource

logger = logging.getLogger("providers.epf")


class EPFSync(AssetSource):
    """Load EPF holdings from manually-configured corpus JSON."""

    def __init__(self, cred_manager: CredentialManager):
        self._raw = (cred_manager.get_credential("epf", "corpus_json") or "").strip()

    @property
    def provider_name(self) -> str:
        return "epf"

    def validate_credentials(self) -> None:
        data = self._load()
        if not data:
            raise ValueError("epf.corpus_json must be a non-empty JSON object.")

    def _load(self) -> Dict[str, Any]:
        if not self._raw:
            return {}
        try:
            data = json.loads(self._raw)
        except json.JSONDecodeError as exc:
            raise ValueError("epf.corpus_json must be valid JSON") from exc
        if not isinstance(data, dict):
            raise ValueError("epf.corpus_json must be a JSON object")
        return data

    def fetch_holdings(self) -> List[AssetPayload]:
        try:
            data = self._load()
        except ValueError as exc:
            logger.error("EPFSync: invalid config: %s", exc)
            return []

        if not data:
            return []

        corpus = float(data.get("corpus", 0) or 0)
        if corpus <= 0:
            # Estimate: 12 months of contributions compounded at interest rate
            rate = float(data.get("interest_rate", 8.15)) / 100.0
            employee = float(data.get("employee_monthly", 0) or 0)
            employer = float(data.get("employer_monthly", 0) or 0)
            vpf = float(data.get("vpf_monthly", 0) or 0)
            corpus = round((employee + employer + vpf) * 12 * (1 + rate), 2)

        if corpus <= 0:
            logger.warning("EPFSync: corpus is zero — check epf.corpus_json config")
            return []

        try:
            payload = AssetPayload(
                symbol="EPF",
                qty=1.0,
                avg_buy_price=corpus,
                source="EPF (Manual)",
                type="epf",
                unrealized_pnl=0.0,
                positions=[{
                    "source": "EPF (Manual)",
                    "market_type": "spot",
                    "position_type": "long",
                    "qty": 1.0,
                    "avg_buy_price": corpus,
                    "unrealized_pnl": 0.0,
                }],
            )
        except ValidationError as exc:
            logger.error("EPFSync schema error: %s", exc)
            return []

        logger.info("EPFSync: EPF corpus=%.2f", corpus)
        return [payload]
