import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.entities.base import Base


class AssetScore(Base):
    __tablename__ = "asset_scores"

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market.asset_snapshot.asset_id", ondelete="CASCADE"), primary_key=True)
    model_version: Mapped[str] = mapped_column(String, primary_key=True)
    recommendation_score: Mapped[float] = mapped_column(Numeric)
    quality_score: Mapped[float] = mapped_column(Numeric)
    valuation_score: Mapped[float] = mapped_column(Numeric)
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
