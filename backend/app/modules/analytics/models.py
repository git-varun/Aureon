"""Analytics models."""
from sqlalchemy import Boolean, Column, Index, Integer, String, Float, DateTime, JSON, Text, ForeignKey
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


class AIRecommendation(Base):
    """Structured per-asset recommendation parsed from an AI briefing."""

    __tablename__ = "ai_recommendations"

    id = Column(Integer, primary_key=True)
    briefing_id = Column(Integer, ForeignKey("ai_briefings.id"), nullable=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)  # NULL = global rec
    action = Column(String(30), nullable=False)  # BUY/SELL/HOLD/AVG_DOWN/PARTIAL_PROFIT
    conviction = Column(Integer, nullable=True)  # 1–5
    confidence = Column(Float, nullable=True)  # 0.0–1.0
    risk_level = Column(String(20), nullable=True)
    time_horizon = Column(String(30), nullable=True)
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    analysis_detail = Column(JSON, nullable=True)  # rationale, technicals, sentiment, sizing
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_ai_rec_asset_id", "asset_id"),
        Index("idx_ai_rec_active_expires", "is_active", "expires_at"),
        Index("idx_ai_rec_briefing_id", "briefing_id"),
    )


class PortfolioOptimization(Base):
    """Async optimizer run — created on POST /optimizer/run, updated by Celery task."""

    __tablename__ = "portfolio_optimizations"

    id = Column(Integer, primary_key=True)
    task_id = Column(String(128), nullable=True)  # Celery task ID
    status = Column(String(20), nullable=False, default="pending")  # pending/running/completed/failed
    optimization_type = Column(String(30), nullable=True)  # 'ai_driven'/'risk_parity'
    input_snapshot = Column(JSON, nullable=True)  # portfolio state at run time
    target_allocation = Column(JSON, nullable=True)  # {"equity": 45.0, ...}
    rebalance_actions = Column(JSON, nullable=True)  # [{symbol, action, current_pct, target_pct}]
    risk_metrics = Column(JSON, nullable=True)  # beta, sharpe, max_drawdown, volatility
    confidence_score = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("idx_portfolio_opt_status", "status", "created_at"),)
