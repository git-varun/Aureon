"""Pydantic schemas for recommendations."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class RecommendationOut(BaseModel):
    id: int
    ext_id: str
    status: str
    strength: str
    action: str
    scope: dict[str, Any]  # {kind, ref}
    title: str
    impact_one_line: Optional[str] = None
    confidence: Optional[int] = None
    horizon: Optional[str] = None
    change: Optional[dict[str, Any]] = None
    impact: Optional[dict[str, Any]] = None
    reasoning: Optional[dict[str, Any]] = None
    conflicts_with: Optional[list[str]] = None
    signal_ids: Optional[list[str]] = None
    confidence_factors: Optional[dict[str, Any]] = None
    predicted_impact: Optional[str] = None
    realized_impact: Optional[str] = None
    created_at: datetime
    applied_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RecommendationDismissIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class SeedResult(BaseModel):
    inserted: int
    skipped: int
