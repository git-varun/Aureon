"""NPS valuation: corpus from manually-entered metadata balance.

No auto-growth is applied — balance must be updated by the user.
expected_return_rate is stored in metadata for display-only projection.
"""

import logging
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.nps")


class NPSValuationProvider(ValuationProvider):
    provider_name = "nps_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        """Return balance from metadata as-is (manual entry, no ledger)."""
        balance = float(asset_metadata.get("balance") or 0)
        if balance <= 0:
            logger.warning("NPSValuationProvider: balance is zero or missing in metadata")
        return balance

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        rate = asset_metadata.get("expected_return_rate")
        return float(rate) if rate is not None else None
