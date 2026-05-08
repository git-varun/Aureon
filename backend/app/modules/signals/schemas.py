"""Signals request/response schemas (Pydantic)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.shared.constants import SignalType, TimeFrame


class SignalBase(BaseModel):
    """Base signal schema."""

    symbol: str
    signal_type: SignalType
    timeframe: TimeFrame = TimeFrame.SHORT_TERM


class SignalCreate(SignalBase):
    """Create signal."""

    confidence: float
    rationale: Optional[str] = None
    risk_level: Optional[str] = None


class SignalResponse(SignalBase):
    """Signal response."""

    id: int
    rsi: Optional[float] = None
    macd: Optional[float] = None
    atr: Optional[float] = None
    confidence: float
    rationale: Optional[str] = None
    risk_level: Optional[str] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerateSignalsRequest(BaseModel):
    """Request to generate signals (async task)."""

    symbols: Optional[list[str]] = None  # None = all assets


class SignalHistoryResponse(BaseModel):
    """Signal historical performance."""

    symbol: str
    entry_date: datetime
    exit_date: Optional[datetime] = None
    entry_price: float
    exit_price: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percent: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)
