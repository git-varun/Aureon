import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.entities.base import Base, TimestampMixin


class LatestQuote(TimestampMixin, Base):
    __tablename__ = "latest_quotes"
    __table_args__ = {"schema": "market"}

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, unique=True, index=True)
    price: Mapped[float] = mapped_column(Numeric, nullable=False)
    volume: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    provider: Mapped[str | None] = mapped_column(String, nullable=True)

class AssetSnapshot(TimestampMixin, Base):
    __tablename__ = "asset_snapshot"
    __table_args__ = {"schema": "market"}

    asset_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    market_cap: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    pe_ratio: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    rsi: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    momentum_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    volatility_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

class AssetFeatures(TimestampMixin, Base):
    __tablename__ = "asset_features"
    __table_args__ = {"schema": "market"}

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), primary_key=True)
    price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    market_cap: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    momentum_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    volatility_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)

class AssetFundamentals(TimestampMixin, Base):
    __tablename__ = "asset_fundamentals"
    __table_args__ = {"schema": "market"}

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), primary_key=True)
    trailing_pe: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    price_to_book: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    roe: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    debt_to_equity: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    profit_margin: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    revenue_growth: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    dividend_yield: Mapped[float | None] = mapped_column(Numeric, nullable=True)


class AssetHealth(TimestampMixin, Base):
    __tablename__ = "asset_health"

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), primary_key=True)
    provider_name: Mapped[str] = mapped_column(String, primary_key=True)
    last_successful_ingestion: Mapped[datetime | None] = mapped_column(nullable=True)
    quote_age_seconds: Mapped[int | None] = mapped_column(nullable=True)
    fundamentals_age_seconds: Mapped[int | None] = mapped_column(nullable=True)
    signal_age_seconds: Mapped[int | None] = mapped_column(nullable=True)
    news_age_seconds: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String, default="UNKNOWN")

    __table_args__ = (
        Index("idx_asset_health_status", "status"),
        Index("idx_asset_health_updated_at", text("updated_at DESC")),
        {"schema": "market"}
    )


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        Index("idx_assets_symbol", "symbol", unique=True),
        {"schema": "market"}
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    asset_class: Mapped[str] = mapped_column(String, nullable=False)  # equity, bond, crypto, fx
    tier: Mapped[int | None] = mapped_column(nullable=True)  # NPS sub-account tier (1 or 2)
    # Set whenever fetch_news_task actually attempts this symbol, regardless of
    # whether any article was found — distinct from "has linked News", since a
    # symbol Yahoo has no coverage for (e.g. a synthetic staking-product ticker)
    # would otherwise tie for "never fetched" forever and starve rotation for
    # every other symbol behind it. See CRYPTO_SENTIMENT_GAP §1.
    last_news_fetch_at: Mapped[datetime | None] = mapped_column(nullable=True)
    metadata_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), name="metadata", nullable=True)
    classification: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))


class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (
        Index("idx_price_history_asset_time", "asset_id", "timestamp"),
        {"schema": "market"}
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.assets.id", ondelete="CASCADE"), nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float] = mapped_column(Numeric, nullable=False)
    volume: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)


class MarketTheme(Base):
    __tablename__ = "market_themes"
    __table_args__ = {"schema": "market"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    theme_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    desc: Mapped[str] = mapped_column(String, nullable=False)
    symbols: Mapped[list[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list)
    ret1m: Mapped[float] = mapped_column(Numeric, nullable=False, default=0.0)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("system.users.id", ondelete="CASCADE"), nullable=True, index=True)
    forked_from: Mapped[str | None] = mapped_column(String(40), nullable=True)
    inception_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))


class ThemeWeight(Base):
    __tablename__ = "theme_weights"
    __table_args__ = (
        Index("idx_theme_weight_theme_date", "theme_id", "effective_date"),
        {"schema": "market"}
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    theme_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(40), nullable=False)
    weight: Mapped[float] = mapped_column(Numeric, nullable=False)
    effective_date: Mapped[str] = mapped_column(String(20), nullable=False)
    mcap_at_set: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=lambda: datetime.now(timezone.utc))

