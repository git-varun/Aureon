"""Portfolio request/response schemas (Pydantic)."""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, model_validator

from app.shared.constants import AssetType, TransactionType
from app.modules.portfolio.metadata_schemas import AssetMetadataUnion, ILLIQUID_TYPES, TRADEABLE_TYPES


class AssetBase(BaseModel):
    """Base asset schema."""

    symbol: str
    name: str
    asset_type: AssetType
    exchange: Optional[str] = None


class AssetCreate(AssetBase):
    """Create asset."""

    sub_type: Optional[str] = None
    asset_metadata: Optional[AssetMetadataUnion] = None

    @model_validator(mode="after")
    def validate_metadata_rules(self) -> "AssetCreate":
        asset_type_val = self.asset_type.value if hasattr(self.asset_type, "value") else str(self.asset_type)
        if asset_type_val in TRADEABLE_TYPES and self.asset_metadata is not None:
            raise ValueError(f"asset_metadata must be None for tradeable type '{asset_type_val}'")
        if asset_type_val in ILLIQUID_TYPES and self.asset_metadata is None:
            raise ValueError(f"asset_metadata is required for illiquid type '{asset_type_val}'")
        if self.asset_metadata is not None:
            meta_type = getattr(self.asset_metadata, "asset_type", None)
            if meta_type != asset_type_val:
                raise ValueError(
                    f"asset_metadata.asset_type '{meta_type}' must match outer asset_type '{asset_type_val}'"
                )
        return self


class AssetResponse(AssetBase):
    """Asset response."""

    id: int
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PositionBase(BaseModel):
    """Base position schema."""

    quantity: float
    avg_buy_price: float


class PositionCreate(PositionBase):
    """Create position."""

    asset_id: int
    current_value: Optional[float] = None
    purchase_date: Optional[datetime] = None


class PositionResponse(PositionBase):
    """Position response."""

    id: int
    asset_id: int
    current_value: float
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    asset: AssetResponse
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PortfolioSyncRequest(BaseModel):
    """Request to sync portfolio from broker."""

    broker: Literal["groww", "zerodha", "binance", "coinbase", "custom_equity"]
    force_refresh: bool = True
    dry_run: bool = False  # validate credentials without writing to DB


class PortfolioResponse(BaseModel):
    """Portfolio summary."""

    total_value: float
    total_invested: float
    total_pnl: float
    pnl_percent: float
    positions_count: int
    positions: List[PositionResponse]


class TransactionCreate(BaseModel):
    """Manual transaction creation."""

    symbol: str
    transaction_type: TransactionType
    quantity: float
    price: float
    transaction_date: datetime
    broker: Optional[str] = "manual"
    notes: Optional[str] = None


class TransactionResponse(BaseModel):
    """Transaction response."""

    id: int
    symbol: str
    transaction_type: TransactionType
    quantity: float
    price: float
    total_value: float
    transaction_date: datetime
    broker: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ManualAssetCreate(BaseModel):
    """Create an illiquid asset + initial position in one call."""

    symbol: str
    name: str
    asset_type: AssetType
    exchange: Optional[str] = None
    asset_metadata: AssetMetadataUnion
    initial_value: float
    purchase_date: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_type_is_illiquid(self) -> "ManualAssetCreate":
        asset_type_val = self.asset_type.value if hasattr(self.asset_type, "value") else str(self.asset_type)
        if asset_type_val not in ILLIQUID_TYPES:
            raise ValueError(f"ManualAssetCreate only for illiquid types; got '{asset_type_val}'")
        meta_type = getattr(self.asset_metadata, "asset_type", None)
        if meta_type != asset_type_val:
            raise ValueError(
                f"asset_metadata.asset_type '{meta_type}' must match outer asset_type '{asset_type_val}'"
            )
        return self


class ManualValuationUpdate(BaseModel):
    """Update the current value of a manually-valued illiquid asset."""

    new_value: float
    notes: Optional[str] = None


class AllocationResponse(BaseModel):
    """Portfolio allocation breakdown by asset type."""

    total_value: float
    by_type: dict
