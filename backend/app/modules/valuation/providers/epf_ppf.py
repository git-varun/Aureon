"""EPF/PPF valuation: corpus from accrual ledger + running contribution estimate."""

import logging
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.epf_ppf")


class EPFPPFValuationProvider(ValuationProvider):
    provider_name = "epf_ppf_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        """Latest running_total from accrual ledger, or estimate from contributions."""
        if accrual_history:
            latest = max(accrual_history, key=lambda r: r.get("period_end", ""))
            running_total = latest.get("running_total")
            if running_total is not None:
                return float(running_total)

        # Estimate: sum of all contributions with simple annual compounding
        rate = float(asset_metadata.get("interest_rate", 8.15)) / 100.0
        employee = float(asset_metadata.get("employee_monthly", 0.0))
        employer = float(asset_metadata.get("employer_monthly", 0.0))
        vpf = float(asset_metadata.get("vpf_monthly", 0.0))
        monthly = employee + employer + vpf
        # One year of contributions as rough estimate
        return round(monthly * 12 * (1 + rate), 2)

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        return asset_metadata.get("interest_rate")
