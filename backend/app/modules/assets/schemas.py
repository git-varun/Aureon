"""Assets request/response schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AssetResponse(BaseModel):
    """Minimal asset row — used in list views."""

    id: int
    symbol: str
    name: str
    type: str
    exchange: Optional[str] = None
    current_price: Optional[float] = None
    previous_close: Optional[float] = None
    market_cap: Optional[float] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AssetDetailResponse(AssetResponse):
    """Extended asset detail — includes recent price samples."""

    prices_24h: List[float] = []
    volume_24h: Optional[float] = None
    latest_price_ts: Optional[datetime] = None


class AssetListResponse(BaseModel):
    """Paginated asset list."""

    data: List[AssetResponse]
    total: int


class PriceHistoryEntry(BaseModel):
    """Single OHLCV row."""

    date: datetime
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: float
    volume: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class ChartCandleResponse(BaseModel):
    """TradingView lightweight-charts candle with optional overlays."""

    time: int  # Unix timestamp
    open: float
    high: float
    low: float
    close: float
    volume: int
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    ema20: Optional[float] = None
    bbu: Optional[float] = None
    bbl: Optional[float] = None
