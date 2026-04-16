"""Portfolio request/response schemas (Pydantic)."""

from datetime import datetime
from typing import Literal, Optional, List

from pydantic import BaseModel

from app.shared.constants import AssetType, TransactionType


class AssetBase(BaseModel):
    """Base asset schema."""

    symbol: str
    name: str
    asset_type: AssetType
    exchange: Optional[str] = None


class AssetCreate(AssetBase):
    """Create asset."""

    pass


class AssetResponse(AssetBase):
    """Asset response."""

    id: int
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PositionBase(BaseModel):
    """Base position schema."""

    quantity: float
    avg_buy_price: float


class PositionCreate(PositionBase):
    """Create position."""

    asset_id: int
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

    class Config:
        from_attributes = True


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


class PriceHistoryResponse(BaseModel):
    """Historical price data."""

    symbol: str
    date: datetime
    close: float
    volume: Optional[float] = None


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

    class Config:
        from_attributes = True
