"""News models."""
from sqlalchemy import Column, Date, ForeignKey, Index, Integer, String, Text, DateTime, Float, UniqueConstraint
from sqlalchemy.sql import func
from app.core.db import Base


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text)
    summary = Column(Text)
    source = Column(String, nullable=False)
    url = Column(String)
    published_at = Column(DateTime(timezone=True))
    sentiment_score = Column(Float)  # -1 to 1
    relevance_score = Column(Float)  # 0 to 1
    symbols = Column(String)  # DEPRECATED: use news_assets junction; removed in Phase 6
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NewsAsset(Base):
    """Junction table linking news articles to assets (replaces news.symbols string)."""

    __tablename__ = "news_assets"

    news_id = Column(Integer, ForeignKey("news.id", ondelete="CASCADE"), primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True)

    __table_args__ = (Index("idx_news_assets_asset", "asset_id"),)


class AssetSentimentSnapshot(Base):
    """Aggregated sentiment per asset per day — owned by news module."""

    __tablename__ = "asset_sentiment_snapshots"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    avg_sentiment_7d = Column(Float, nullable=True)  # -1 to 1
    avg_sentiment_30d = Column(Float, nullable=True)
    article_count_7d = Column(Integer, nullable=True)
    trend = Column(String(20), nullable=True)  # IMPROVING/DETERIORATING/STABLE
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("asset_id", "snapshot_date", name="uq_sentiment_asset_date"),
    )
