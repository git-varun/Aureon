import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import get_cached_asset_scores
from app.infrastructure.repositories.asset_scores import AssetScoresRepository

router = APIRouter()

@router.get("/assets/{asset_id}/scores")
def get_asset_scores(asset_id: uuid.UUID, model_version: str = "v1.0.0", db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_scores(str(asset_id))
    if cached and cached.get("model_version") == model_version:
        return cached

    repo = AssetScoresRepository(db)
    scores = repo.get(asset_id, model_version)
    if not scores:
        raise HTTPException(status_code=404, detail="Asset scores not found")

    return {
        "asset_id": str(scores.asset_id),
        "model_version": scores.model_version,
        "recommendation_score": float(scores.recommendation_score),
        "quality_score": float(scores.quality_score),
        "valuation_score": float(scores.valuation_score),
        "generated_at": scores.generated_at
    }
