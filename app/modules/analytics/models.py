"""Analytics models."""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.db import Base


class AnalyticsResult(Base):
    __tablename__ = "analytics_results"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False)
    analysis_type = Column(String, nullable=False)  # fundamentals, technical, quant, macro
    data = Column(Text)  # JSON string of analysis data
    score = Column(Float)
    recommendation = Column(String)  # BUY, SELL, HOLD
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Fundamentals(Base):
    __tablename__ = "fundamentals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False)
    pe_ratio = Column(Float)
    eps = Column(Float)
    market_cap = Column(Float)
    high_52w = Column(Float)
    low_52w = Column(Float)
    health_score = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TechnicalIndicators(Base):
    __tablename__ = "technical_indicators"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False)
    rsi = Column(Float)
    macd = Column(Float)
    bollinger_upper = Column(Float)
    bollinger_lower = Column(Float)
    vwap = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AIBriefing(Base):
    __tablename__ = "ai_briefings"

    id = Column(Integer, primary_key=True, index=True)
    briefing_type = Column(String, nullable=False)  # global / single / news
    symbol = Column(String, nullable=True)
    content = Column(Text)  # JSON string of AI response
    model_used = Column(String, nullable=False)
    prompt_tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())