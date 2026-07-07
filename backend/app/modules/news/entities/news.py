import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.entities.base import Base


class News(Base):
    __tablename__ = "news"
    __table_args__ = {"schema": "news"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # -1 to 1
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0 to 1
    symbols: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class NewsAsset(Base):
    __tablename__ = "news_assets"
    __table_args__ = (
        Index("idx_news_assets_asset", "asset_id"),
        {"schema": "news"}
    )

    news_id: Mapped[int] = mapped_column(
        ForeignKey("news.news.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market.assets.id", ondelete="CASCADE"), primary_key=True
    )

class AssetSentimentSnapshot(Base):
    __tablename__ = "asset_sentiment_snapshots"
    __table_args__ = (
        UniqueConstraint("asset_id", "snapshot_date", name="uq_sentiment_asset_date"),
        {"schema": "news"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market.assets.id"), nullable=False
    )
    snapshot_date: Mapped[datetime] = mapped_column(nullable=False)
    avg_sentiment_7d: Mapped[float | None] = mapped_column(Float, nullable=True)  # -1 to 1
    avg_sentiment_30d: Mapped[float | None] = mapped_column(Float, nullable=True)
    article_count_7d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trend: Mapped[str | None] = mapped_column(String(20), nullable=True)  # IMPROVING/DETERIORATING/STABLE
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
