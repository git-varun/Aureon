"""Portfolio domain models (SQLAlchemy ORM)."""

from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text)
from sqlalchemy.orm import relationship, validates

from app.core.db import Base
from app.shared.constants import AssetTier, AssetType, TransactionType


class Asset(Base):
    """An asset (security) with metadata."""

    __tablename__ = "assets"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    asset_type = Column(String(30), nullable=False)
    sub_type = Column(String(50), nullable=True)
    exchange = Column(String(20), nullable=True)

    current_price = Column(Float, nullable=True)
    previous_close = Column(Float, nullable=True)
    market_cap = Column(Float, nullable=True)

    # Phase 1 additions
    price_source = Column(String(20), default="market")
    currency = Column(String(10), default="INR")
    is_tradeable = Column(Boolean, default=True)
    annual_yield = Column(Float, nullable=True)
    maturity_date = Column(Date, nullable=True)
    asset_metadata = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    tier = Column(String(20), nullable=True)  # AssetTier — active|semi|passive

    last_seeded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    positions = relationship("Position", back_populates="asset", cascade="all, delete-orphan")
    prices = relationship("PriceHistory", back_populates="asset", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="asset")

    __table_args__ = (Index("idx_symbol_type", "symbol", "asset_type"),)

    @validates("asset_type")
    def validate_asset_type(self, key, value):
        valid = {m.value for m in AssetType}
        if value not in valid:
            raise ValueError(f"Invalid asset_type: {value!r}")
        return value

    @validates("tier")
    def validate_tier(self, key, value):
        if value is None:
            return value
        valid = {m.value for m in AssetTier}
        if value not in valid:
            raise ValueError(f"Invalid tier: {value!r}")
        return value


class Position(Base):
    """A user's holding in an asset."""

    __tablename__ = "positions"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    quantity = Column(Float, nullable=False)
    avg_buy_price = Column(Float, nullable=False)
    current_value = Column(Float, nullable=False)  # quantity * current_price
    pnl = Column(Float, nullable=True)  # profit/loss in INR
    pnl_percent = Column(Float, nullable=True)  # profit/loss %

    purchase_date = Column(DateTime, nullable=True)

    # Phase 1 additions
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    valuation_method = Column(String(20), default="market")
    last_valued_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    asset = relationship("Asset", back_populates="positions")

    __table_args__ = (Index("idx_position_asset", "asset_id"),)


class PriceHistory(Base):
    """Historical price data for an asset."""

    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    date = Column(DateTime, nullable=False)
    open_price = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="prices")

    __table_args__ = (
        Index("idx_price_asset_date", "asset_id", "date"),
        Index("idx_price_date", "date"),
    )


class CostBasis(Base):
    """Tax lot tracking for capital gains computation."""

    __tablename__ = "cost_basis"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    quantity = Column(Float, nullable=False)
    purchase_price = Column(Float, nullable=False)
    purchase_date = Column(DateTime, nullable=False)
    source = Column(String(50), nullable=True)  # groww, zerodha, binance

    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    """Price/signal alerts for assets."""

    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    alert_type = Column(String(20), nullable=False)  # price, signal, news
    condition = Column(Text, nullable=False)  # e.g., "price > 100" or "rsi < 30"
    is_active = Column(Integer, default=1)

    created_at = Column(DateTime, default=datetime.utcnow)


class Transaction(Base):
    """Buy/sell/dividend transactions."""

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    transaction_type = Column(String(30), nullable=False)
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    transaction_date = Column(DateTime, nullable=False)
    total_value = Column(Float, nullable=False)  # quantity * price
    broker = Column(String(50), nullable=True)  # groww, zerodha, binance

    # Phase 1 additions
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    fees = Column(Float, default=0.0)
    taxes = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    broker_reference = Column(String(100), nullable=True)

    # Aureon ledger fields
    kind = Column(String(30), default="trade", nullable=False)  # trade|applied|contribution
    recommendation_id = Column(Integer, ForeignKey("recommendations.id"), nullable=True)
    predicted_impact = Column(String(80), nullable=True)
    realized_impact = Column(String(80), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="transactions")

    __table_args__ = (
        Index("idx_transaction_asset_date", "asset_id", "transaction_date"),
        Index("idx_transaction_kind", "kind"),
        Index("idx_transaction_rec", "recommendation_id"),
    )

    VALID_KINDS = {"trade", "applied", "contribution"}

    @validates("kind")
    def validate_kind(self, key, value):
        if value not in self.VALID_KINDS:
            raise ValueError(f"Invalid kind: {value!r}")
        return value

    @validates("transaction_type")
    def validate_transaction_type(self, key, value):
        valid = {m.value for m in TransactionType}
        if value not in valid:
            raise ValueError(f"Invalid transaction_type: {value!r}")
        return value


class AssetValuation(Base):
    """Point-in-time valuation record for illiquid assets."""

    __tablename__ = "asset_valuations"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    valuation_amount = Column(Float, nullable=False)
    valuation_date = Column(Date, nullable=False)
    valuation_method = Column(String(30), nullable=False)  # 'manual'/'accrual'/'api_estimate'
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("idx_asset_valuation_date", "asset_id", "valuation_date"),)


class AccrualLedger(Base):
    """Interest / contribution credits for EPF, PPF, EPS, and bond coupons."""

    __tablename__ = "accrual_ledger"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    accrual_type = Column(String(30), nullable=False)  # 'interest'/'contribution'/'employer_contribution'/'coupon'
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    rate_used = Column(Float, nullable=True)
    running_total = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("idx_accrual_asset_period", "asset_id", "period_start"),)


class AuditLog(Base):
    """Append-only audit trail for financial writes."""

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    entity = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)
    action = Column(String(20), nullable=False)
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)
    actor_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
