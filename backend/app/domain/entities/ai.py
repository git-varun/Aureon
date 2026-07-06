import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class AIBriefing(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_briefings"
    __table_args__ = (
        Index("idx_ai_briefings_type", "briefing_type"),
        {"schema": "ai"}
    )

    briefing_type: Mapped[str] = mapped_column(String(30), nullable=False)  # global, weekly, monthly, single
    symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

class AIGeneration(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_generations"
    __table_args__ = (
        Index("idx_ai_generations_user_feature", "user_id", "feature_name"),
        {"schema": "ai"}
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("system.users.id", ondelete="SET NULL"), nullable=True
    )
    feature_name: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    context_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    retrieval_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_trace: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation_parameters: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False)
    prompt_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data_classification: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload_retention_state: Mapped[str] = mapped_column(String(32), default="full", nullable=False)

class AIEvaluation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_evaluations"
    __table_args__ = {"schema": "ai"}

    generation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai.ai_generations.id", ondelete="CASCADE"), nullable=False
    )
    faithfulness_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    relevance_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    data_reference_validated: Mapped[bool] = mapped_column(default=True, nullable=False)
    validation_details: Mapped[dict[str, Any] | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

class AIFeedback(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_feedback"
    __table_args__ = {"schema": "ai"}

    generation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai.ai_generations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("system.users.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 (thumbs up), -1 (thumbs down)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
