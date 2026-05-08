"""Tests for AssetMetadataUnion discriminated union and per-type validation."""

import pytest
from pydantic import ValidationError

from app.modules.portfolio.metadata_schemas import (
    AssetMetadataUnion,
    BondMetadata,
    EPFMetadata,
    PPFMetadata,
    InsuranceMetadata,
    RealEstateMetadata,
)
from typing import Annotated, Union
from pydantic import TypeAdapter, Field

_adapter = TypeAdapter(AssetMetadataUnion)


class TestBondMetadata:
    def test_round_trip(self):
        data = {"asset_type": "bond", "isin": "INE001A01036", "issuer": "SBI", "coupon_rate": 7.5}
        m = _adapter.validate_python(data)
        assert isinstance(m, BondMetadata)
        assert m.face_value == 1000.0
        assert m.coupon_frequency == "semi-annual"

    def test_missing_required_field(self):
        with pytest.raises(ValidationError):
            _adapter.validate_python({"asset_type": "bond", "isin": "INE001A01036", "issuer": "SBI"})


class TestEPFMetadata:
    def test_round_trip(self):
        data = {"asset_type": "epf", "employee_monthly": 5000.0, "employer_monthly": 5000.0}
        m = _adapter.validate_python(data)
        assert isinstance(m, EPFMetadata)
        assert m.interest_rate == 8.15

    def test_missing_required_field(self):
        with pytest.raises(ValidationError):
            _adapter.validate_python({"asset_type": "epf", "employee_monthly": 5000.0})


class TestPPFMetadata:
    def test_round_trip(self):
        data = {"asset_type": "ppf", "bank": "SBI", "subscription_year": 2020}
        m = _adapter.validate_python(data)
        assert isinstance(m, PPFMetadata)
        assert m.interest_rate == 7.1


class TestInsuranceMetadata:
    def test_term_round_trip(self):
        data = {
            "asset_type": "insurance", "sub_type": "term",
            "policy_number": "P001", "insurer": "LIC",
            "sum_assured": 1_000_000.0, "annual_premium": 10000.0,
        }
        m = _adapter.validate_python(data)
        assert isinstance(m, InsuranceMetadata)
        assert m.nav is None

    def test_missing_required_field(self):
        with pytest.raises(ValidationError):
            _adapter.validate_python({"asset_type": "insurance", "sub_type": "term", "policy_number": "P001"})


class TestRealEstateMetadata:
    def test_round_trip(self):
        data = {"asset_type": "real_estate", "city": "Mumbai", "area_sqft": 1200.0}
        m = _adapter.validate_python(data)
        assert isinstance(m, RealEstateMetadata)
        assert m.rental_monthly == 0.0

    def test_model_dump(self):
        data = {"asset_type": "real_estate", "city": "Delhi"}
        m = _adapter.validate_python(data)
        dumped = m.model_dump()
        assert dumped["asset_type"] == "real_estate"
        assert dumped["city"] == "Delhi"


class TestDiscriminatorRejection:
    def test_wrong_asset_type_rejected(self):
        with pytest.raises(ValidationError):
            _adapter.validate_python({"asset_type": "equity"})

    def test_unknown_asset_type_rejected(self):
        with pytest.raises(ValidationError):
            _adapter.validate_python({"asset_type": "crypto", "symbol": "BTC"})
