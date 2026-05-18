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


class AssetQuoteResponse(BaseModel):
    """Intraday quote — latest OHLCV plus rolling 52-week range."""

    symbol: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[int] = None
    previous_close: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None


class FundamentalsResponse(BaseModel):
    """Fundamental financial metrics for an asset."""

    symbol: str
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = None  # Return on equity (decimal, e.g. 0.18 = 18%)
    de_ratio: Optional[float] = None  # Debt-to-equity
    eps: Optional[float] = None
    dividend_yield: Optional[float] = None
    market_cap: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    graham_number: Optional[float] = None
    beta: Optional[float] = None
    vol_30d: Optional[float] = None  # Annualised 30-day realised volatility (%)
    data_source: str = "live"  # "live" | "cache" | "partial"
