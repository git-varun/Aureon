"""Market module models."""

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.core.db import Base


class MarketTheme(Base):
    __tablename__ = "market_themes"

    id = Column(Integer, primary_key=True)
    theme_id = Column(String(40), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    desc = Column(Text, nullable=False)
    symbols = Column(Text, default="[]")  # JSON list — kept for legacy reads
    ret1m = Column(Float, default=0.0)  # updated by MarketEngine.refresh_cache()
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # owner_id = NULL → system/AI-curated theme
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    forked_from = Column(String(40), nullable=True)   # theme_id of parent system theme
    inception_date = Column(Date, nullable=True)       # date of ₹100 base for NAV
    is_public = Column(Boolean, default=False)         # reserved for future sharing


class ThemeWeight(Base):
    __tablename__ = "theme_weights"

    id = Column(Integer, primary_key=True)
    theme_id = Column(String(40), nullable=False, index=True)
    symbol = Column(String(40), nullable=False)
    weight = Column(Float, nullable=False)             # 0.0–1.0; all weights for a theme+date must sum to 1.0
    effective_date = Column(Date, nullable=False)
    mcap_at_set = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("theme_id", "symbol", "effective_date", name="uq_theme_weight_snapshot"),
        Index("idx_theme_weight_theme_date", "theme_id", "effective_date"),
    )
