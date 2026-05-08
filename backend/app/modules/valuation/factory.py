"""Valuation provider factory — DB-driven enabled list, mirrors price provider pattern."""

import importlib
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.shared.interfaces import ValuationProvider

logger = logging.getLogger("valuation.factory")

_ALL_VALUATION_PROVIDERS = {
    "bond_valuation": "app.modules.valuation.providers.bond:BondValuationProvider",
    "epf_ppf_valuation": "app.modules.valuation.providers.epf_ppf:EPFPPFValuationProvider",
    "insurance_valuation": "app.modules.valuation.providers.insurance:InsuranceValuationProvider",
    "real_estate_valuation": "app.modules.valuation.providers.real_estate:RealEstateValuationProvider",
}

_ASSET_TYPE_TO_PROVIDER = {
    "bond": "bond_valuation",
    "epf": "epf_ppf_valuation",
    "ppf": "epf_ppf_valuation",
    "insurance": "insurance_valuation",
    "real_estate": "real_estate_valuation",
}


def _import_provider(dotted: str):
    module_path, class_name = dotted.rsplit(":", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def get_valuation_provider(asset_type: str, session: Session) -> Optional[ValuationProvider]:
    """Return the valuation provider for the given asset type, or None if disabled/unknown."""
    from app.modules.config.services import ConfigService

    provider_name = _ASSET_TYPE_TO_PROVIDER.get(asset_type)
    if not provider_name:
        return None

    config_svc = ConfigService(session)
    providers = config_svc.get_providers_by_type("valuation")
    enabled_names = {p["provider_name"] for p in providers if p["enabled"]}

    if provider_name not in enabled_names:
        logger.debug("get_valuation_provider: '%s' is disabled, skipping", provider_name)
        return None

    dotted = _ALL_VALUATION_PROVIDERS.get(provider_name)
    if not dotted:
        logger.warning("get_valuation_provider: no implementation for '%s'", provider_name)
        return None

    try:
        cls = _import_provider(dotted)
        return cls()
    except Exception as exc:
        logger.error("get_valuation_provider: failed to init '%s': %s", provider_name, exc)
        return None
