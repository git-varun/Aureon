"""Signals domain models (SQLAlchemy ORM)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text

from app.core.db import Base
from app.shared.constants import SignalType, TimeFrame


class Signal(Base):
    """A trading signal for an asset."""

    __tablename__ = "signals"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(60), nullable=False, index=True)
    signal_type = Column(Enum(SignalType), nullable=False)
    timeframe = Column(Enum(TimeFrame), nullable=False, default=TimeFrame.SHORT_TERM)

    # Signal metrics
    rsi = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    atr = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)  # 0.0 - 1.0

    # Recommendation context
    rationale = Column(Text, nullable=True)
    risk_level = Column(String(20), nullable=True)  # low, medium, high
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("idx_signal_symbol_type", "symbol", "signal_type"),)


class SignalHistory(Base):
    """Historical signal tracking for backtesting and analysis."""

    __tablename__ = "signal_history"

    id = Column(Integer, primary_key=True)
    signal_id = Column(Integer, ForeignKey("signals.id"), nullable=False)

    entry_date = Column(DateTime, nullable=False)
    exit_date = Column(DateTime, nullable=True)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    profit_loss = Column(Float, nullable=True)
    profit_loss_percent = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (Index("idx_history_signal", "signal_id"),)
