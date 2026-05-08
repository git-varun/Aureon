"""Recommendations domain model."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import validates

from app.core.db import Base

RECOMMENDATION_STATUSES = ("active", "applied", "dismissed")
RECOMMENDATION_STRENGTHS = ("recommended", "consider", "conflict", "hold")
RECOMMENDATION_SCOPES = ("asset", "class", "portfolio")


class Recommendation(Base):
    """A single decision-unit surfaced to the user.

    Lifecycle: active → (applied|dismissed). Undo flips back to active.
    """

    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True)
    ext_id = Column(String(60), unique=True, nullable=False, index=True)  # stable id used by FE / fixtures

    status = Column(String(20), default="active", nullable=False)  # active|applied|dismissed
    strength = Column(String(20), nullable=False)  # recommended|consider|conflict|hold
    action = Column(String(40), nullable=False)  # Reduce|Add|Harvest|Hold|Rebalance|Ladder|...

    scope_kind = Column(String(20), nullable=False)  # asset|class|portfolio
    scope_ref = Column(String(120), nullable=True)  # ticker, class name, or "PORT"

    title = Column(String(255), nullable=False)
    impact_one_line = Column(Text, nullable=True)

    confidence = Column(Integer, nullable=True)  # 0-100
    horizon = Column(String(20), nullable=True)  # Short|Long

    change = Column(JSON, nullable=True)  # {amount, percent}
    impact = Column(JSON, nullable=True)  # {risk, ret, alloc, cash}
    reasoning = Column(JSON, nullable=True)  # {allocation, momentum, ...}
    conflicts_with = Column(JSON, nullable=True)  # list[str ext_id]
    signal_ids = Column(JSON, nullable=True)  # list[str signal ext ids]
    confidence_factors = Column(JSON, nullable=True)  # {dim: weight}

    predicted_impact = Column(String(80), nullable=True)
    realized_impact = Column(String(80), nullable=True)
    dismiss_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    applied_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_rec_status", "status"),
        Index("idx_rec_scope", "scope_kind", "scope_ref"),
    )

    @validates("status")
    def _v_status(self, key, value):
        if value not in RECOMMENDATION_STATUSES:
            raise ValueError(f"Invalid status: {value!r}")
        return value

    @validates("strength")
    def _v_strength(self, key, value):
        if value not in RECOMMENDATION_STRENGTHS:
            raise ValueError(f"Invalid strength: {value!r}")
        return value

    @validates("scope_kind")
    def _v_scope(self, key, value):
        if value not in RECOMMENDATION_SCOPES:
            raise ValueError(f"Invalid scope_kind: {value!r}")
        return value
