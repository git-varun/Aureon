import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.entities.base import Base


class AssetScore(Base):
    __tablename__ = "asset_scores"

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), primary_key=True)
    model_version: Mapped[str] = mapped_column(String, primary_key=True)
    recommendation_score: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    quality_score: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    valuation_score: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    # Names of inputs that were unavailable (None) at scoring time, e.g.
    # "momentum_score", "quality_score" — lets consumers distinguish a real
    # computed value from a partial/unavailable one instead of both looking
    # like a plain float. See EVALUATION_MODULE_AUDIT.md 1a/1b.
    unavailable_inputs: Mapped[list[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list)
    generated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_asset_scores_asset_generated_at", "asset_id", text("generated_at DESC")),
        {"schema": "evaluation"}
    )

class FeatureSnapshot(Base):
    __tablename__ = "feature_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"))
    snapshot_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    model_version: Mapped[str] = mapped_column(String)
    feature_schema_version: Mapped[str] = mapped_column(String)
    features: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"))

    __table_args__ = (
        Index("idx_feature_snapshots_asset_snapshot_at", "asset_id", text("snapshot_at DESC")),
        {"schema": "evaluation"}
    )
