"""Real estate valuation: user-set price; net equity after mortgage."""

import logging
from typing import Optional

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.real_estate")


class RealEstateValuationProvider(ValuationProvider):
    provider_name = "real_estate_valuation"

    def compute_current_value(self, asset_metadata: dict, accrual_history: list) -> float:
        """Return current_value from metadata (user-set); subtract mortgage for net equity."""
        # current_value is set via manual valuation update endpoint
        current_value = float(asset_metadata.get("current_value", 0.0))
        mortgage = float(asset_metadata.get("mortgage_outstanding", 0.0))
        return max(0.0, round(current_value - mortgage, 2))

    def compute_yield(self, asset_metadata: dict) -> Optional[float]:
        rental_monthly = float(asset_metadata.get("rental_monthly", 0.0))
        current_value = float(asset_metadata.get("current_value", 0.0))
        if current_value > 0 and rental_monthly > 0:
            return round((rental_monthly * 12 / current_value) * 100, 2)
        return None
