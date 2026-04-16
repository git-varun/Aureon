"""Portfolio domain models (SQLAlchemy ORM)."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Column, String, Float, Integer, DateTime, Text, Enum, Index, ForeignKey
)
from sqlalchemy.orm import relationship

from app.core.db import Base
from app.shared.constants import AssetType, TransactionType


class Asset(Base):
    """An asset (security) with metadata."""

    __tablename__ = "assets"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    asset_type = Column(Enum(AssetType), nullable=False)
    exchange = Column(String(20), nullable=True)  # NSE, BSE, NASDAQ, etc.

    current_price = Column(Float, nullable=True)
    previous_close = Column(Float, nullable=True)
    market_cap = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    positions = relationship("Position", back_populates="asset", cascade="all, delete-orphan")
    prices = relationship("PriceHistory", back_populates="asset", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="asset")

    __table_args__ = (Index("idx_symbol_type", "symbol", "asset_type"),)


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

    transaction_type = Column(Enum(TransactionType), nullable=False)
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    transaction_date = Column(DateTime, nullable=False)
    total_value = Column(Float, nullable=False)  # quantity * price
    broker = Column(String(50), nullable=True)  # groww, zerodha, binance

    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="transactions")

    __table_args__ = (Index("idx_transaction_asset_date", "asset_id", "transaction_date"),)
