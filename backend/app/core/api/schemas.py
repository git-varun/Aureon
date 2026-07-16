import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

# --- Portfolio Schemas ---

class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class PortfolioUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class PortfolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

class TransactionCreate(BaseModel):
    symbol: str = Field(..., min_length=1)
    transaction_type: str = Field(..., description="BUY, SELL, BONUS, SPLIT, DIVIDEND")
    quantity: float = Field(..., gt=0)
    price: float = Field(..., ge=0)
    transaction_date: datetime
    fees: float = Field(0.0, ge=0)
    taxes: float = Field(0.0, ge=0)
    notes: Optional[str] = None
    broker: Optional[str] = None
    broker_reference: Optional[str] = None

class TransactionUpdate(BaseModel):
    symbol: Optional[str] = None
    transaction_type: Optional[str] = None
    quantity: Optional[float] = Field(None, gt=0)
    price: Optional[float] = Field(None, ge=0)
    transaction_date: Optional[datetime] = None
    fees: Optional[float] = Field(None, ge=0)
    taxes: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    broker: Optional[str] = None
    broker_reference: Optional[str] = None

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    portfolio_id: uuid.UUID
    symbol: str
    transaction_type: str
    quantity: float
    price: float
    transaction_date: datetime
    fees: float
    taxes: float
    notes: Optional[str] = None
    broker: Optional[str] = None
    broker_reference: Optional[str] = None
    kind: str
    created_at: datetime

class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    portfolio_id: uuid.UUID
    symbol: str
    quantity: float
    avg_buy_price: float
    wallet: str
    leverage: Optional[float] = None
    liquidation_price: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    margin_usd: Optional[float] = None
    side: Optional[str] = None
    created_at: datetime
    price: Optional[float] = None
    price_source: Optional[str] = None
    quote_age_status: Optional[str] = None
    quote_updated_at: Optional[datetime] = None
    epf_estimate_basis: Optional[dict[str, Any]] = None
    currency: Optional[str] = None

class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    portfolio_id: uuid.UUID
    market_value: Optional[float] = None
    cash_balance: Optional[float] = None
    allocation: Optional[dict[str, Any]] = None  # wait, import Any from typing at the top if needed. Let's make it Optional[dict]
    daily_return: Optional[float] = None
    total_return: Optional[float] = None
    updated_at: datetime

