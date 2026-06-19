import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class Recommendation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        Index("idx_recommendations_org_status", "organization_id", "status"),
        Index("idx_recommendations_asset", "asset_id"),
        {"schema": "recommendation"}
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("system.organizations.id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), nullable=False
    )
    recommendation_state: Mapped[str] = mapped_column(String(20), nullable=False)  # BUY, HOLD, REDUCE, AVOID
    confidence_score: Mapped[float] = mapped_column(Numeric, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active, applied, dismissed
    version: Mapped[str] = mapped_column(String(20), default="v2.0.0", nullable=False)

class RecommendationExplanation(Base):
    __tablename__ = "recommendation_explanations"
    __table_args__ = {"schema": "recommendation"}

    recommendation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recommendation.recommendations.id", ondelete="CASCADE"), primary_key=True
    )
    rules_matched: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    reasoning: Mapped[str] = mapped_column(String, nullable=False)
    confidence_factors: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)

class RecommendationOutcome(Base):
    __tablename__ = "recommendation_outcomes"
    __table_args__ = {"schema": "recommendation"}

    recommendation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recommendation.recommendations.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # active, applied, dismissed
    action_taken_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), nullable=False)
    dismiss_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    ledger_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("portfolio.transactions.id", ondelete="SET NULL"), nullable=True
    )
    predicted_impact: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    realized_impact: Mapped[float | None] = mapped_column(Numeric, nullable=True)
