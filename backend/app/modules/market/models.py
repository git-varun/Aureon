"""Market module models."""

from sqlalchemy import Column, Float, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.core.db import Base


class MarketTheme(Base):
    __tablename__ = "market_themes"

    id = Column(Integer, primary_key=True)
    theme_id = Column(String(40), unique=True, nullable=False, index=True)
    name = Column(String(80), nullable=False)
    desc = Column(Text, nullable=False)
    symbols = Column(Text, default="[]")  # JSON list of asset symbols in theme
    ret1m = Column(Float, default=0.0)  # updated by MarketEngine.refresh_cache()
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
