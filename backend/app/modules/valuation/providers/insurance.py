"""Insurance valuation: ULIP uses NAV×units; others use sum_assured or manual value."""

import logging
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.insurance")


class InsuranceValuationProvider(ValuationProvider):
    provider_name = "insurance_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        sub_type = asset_metadata.get("sub_type", "term")

        if sub_type == "ulip":
            nav = asset_metadata.get("nav")
            units = asset_metadata.get("units")
            if nav and units:
                return round(float(nav) * float(units), 2)

        # For term/health: value = 0 (pure risk product, no maturity value unless claimed)
        # For endowment: use sum_assured as proxy until actual surrender value is known
        if sub_type in ("endowment",):
            return float(asset_metadata.get("sum_assured", 0.0))

        return 0.0

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        # Only ULIPs have a market-linked yield; others return None
        return None
