import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class Portfolio(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "portfolios"
    __table_args__ = {"schema": "portfolio"}

    name: Mapped[str] = mapped_column(String, nullable=False)


class Transaction(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = {"schema": "portfolio"}

    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolio.portfolios.id", ondelete="CASCADE"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String, nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("market.asset_snapshot.asset_id", ondelete="SET NULL"), nullable=True
    )
    transaction_type: Mapped[str] = mapped_column(String, nullable=False)  # BUY, SELL, BONUS, SPLIT, DIVIDEND
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False)
    price: Mapped[float] = mapped_column(Numeric, nullable=False)
    transaction_date: Mapped[datetime] = mapped_column(nullable=False, index=True)
    fees: Mapped[float] = mapped_column(Numeric, default=0.0)
    taxes: Mapped[float] = mapped_column(Numeric, default=0.0)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    broker: Mapped[str | None] = mapped_column(String, nullable=True)
    broker_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    kind: Mapped[str] = mapped_column(String, default="trade", nullable=False)  # trade, broker_snapshot


class Position(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "positions"
    __table_args__ = (
        Index("idx_positions_portfolio_symbol", "portfolio_id", "symbol", unique=True),
        {"schema": "portfolio"}
    )

    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolio.portfolios.id", ondelete="CASCADE"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("market.asset_snapshot.asset_id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False)
    avg_buy_price: Mapped[float] = mapped_column(Numeric, nullable=False)
    wallet: Mapped[str] = mapped_column(String, nullable=False, default="spot")  # spot, futures_usdm, futures_coinm
    leverage: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    liquidation_price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    unrealized_pnl: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    side: Mapped[str | None] = mapped_column(String, nullable=True)  # LONG, SHORT (futures only)


class PortfolioSnapshot(TimestampMixin, Base):
    __tablename__ = "snapshots"
    __table_args__ = {"schema": "portfolio"}

    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolio.portfolios.id", ondelete="CASCADE"), primary_key=True
    )
    market_value: Mapped[float] = mapped_column(Numeric, nullable=True)
    cash_balance: Mapped[float] = mapped_column(Numeric, nullable=True)
    allocation: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    daily_return: Mapped[float] = mapped_column(Numeric, nullable=True)
    total_return: Mapped[float] = mapped_column(Numeric, nullable=True)
