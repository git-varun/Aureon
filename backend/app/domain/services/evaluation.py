import uuid
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.redis import get_cached_asset_scores
from app.domain.services.base import BaseService
from app.infrastructure.repositories.asset_scores import AssetScoresRepository


class EvaluationService(BaseService):
    def __init__(self, repo: AssetScoresRepository):
        self.repo = repo

    def get_asset_scores(self, asset_id: uuid.UUID, model_version: str = "v1.0.0") -> dict[str, Any]:
        cached = get_cached_asset_scores(str(asset_id))
        if cached and cached.get("model_version") == model_version:
            return cached

        scores = self.repo.get(asset_id, model_version)
        if not scores:
            raise NotFoundError("Asset scores not found")

        return {
            "asset_id": str(scores.asset_id),
            "model_version": scores.model_version,
            "recommendation_score": float(scores.recommendation_score),
            "quality_score": float(scores.quality_score),
            "valuation_score": float(scores.valuation_score),
            "generated_at": scores.generated_at
        }
