"""Tests for AssetCreate metadata validation rules."""

import pytest
from pydantic import ValidationError

from app.modules.portfolio.schemas import AssetCreate
from app.shared.constants import AssetType


class TestTradeableRejectsMetadata:
    @pytest.mark.parametrize("asset_type", ["equity", "crypto", "mutual_fund", "commodity"])
    def test_tradeable_type_rejects_metadata(self, asset_type):
        with pytest.raises(ValidationError, match="must be None"):
            AssetCreate(
                symbol="TEST",
                name="Test",
                asset_type=asset_type,
                asset_metadata={
                    "asset_type": "bond",
                    "isin": "INE001A01036",
                    "issuer": "SBI",
                    "coupon_rate": 7.5,
                },
            )

    @pytest.mark.parametrize("asset_type", ["equity", "crypto", "mutual_fund", "commodity"])
    def test_tradeable_type_accepts_no_metadata(self, asset_type):
        obj = AssetCreate(symbol="TEST", name="Test", asset_type=asset_type)
        assert obj.asset_metadata is None


class TestIlliquidRequiresMetadata:
    @pytest.mark.parametrize("asset_type", ["bond", "epf", "ppf", "insurance", "real_estate"])
    def test_illiquid_type_without_metadata_raises(self, asset_type):
        with pytest.raises(ValidationError, match="required"):
            AssetCreate(symbol="TEST", name="Test", asset_type=asset_type)

    def test_bond_with_valid_metadata_accepted(self):
        obj = AssetCreate(
            symbol="726054",
            name="SBI Bond",
            asset_type="bond",
            asset_metadata={
                "asset_type": "bond",
                "isin": "INE002A01018",
                "issuer": "SBI",
                "coupon_rate": 7.25,
            },
        )
        assert obj.asset_metadata.asset_type == "bond"

    def test_epf_with_valid_metadata_accepted(self):
        obj = AssetCreate(
            symbol="EPF-001",
            name="My EPF",
            asset_type="epf",
            asset_metadata={
                "asset_type": "epf",
                "employee_monthly": 5000.0,
                "employer_monthly": 5000.0,
            },
        )
        assert obj.asset_metadata.interest_rate == 8.15

    def test_real_estate_with_valid_metadata_accepted(self):
        obj = AssetCreate(
            symbol="RE-MUM-001",
            name="Mumbai Flat",
            asset_type="real_estate",
            asset_metadata={"asset_type": "real_estate", "city": "Mumbai"},
        )
        assert obj.asset_metadata.city == "Mumbai"


class TestDiscriminatorMustMatchOuterType:
    def test_mismatched_discriminator_raises(self):
        with pytest.raises(ValidationError, match="must match"):
            AssetCreate(
                symbol="EPF-001",
                name="My EPF",
                asset_type="epf",
                asset_metadata={
                    "asset_type": "bond",
                    "isin": "INE001A01036",
                    "issuer": "SBI",
                    "coupon_rate": 7.5,
                },
            )
