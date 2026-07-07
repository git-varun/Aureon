import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.exceptions import NotFoundError
from app.core.redis import get_cached_asset_scores
from app.modules.market.entities.market import AssetFeatures
from app.core.services.base import BaseService
from app.modules.market.repositories.asset_features import AssetFeaturesRepository
from app.modules.market.repositories.asset_scores import AssetScoresRepository
from app.modules.market.repositories.asset_snapshot import AssetSnapshotRepository


class FeatureValidationError(Exception):
    pass


def _check_missing_values(features: dict[str, Any]) -> bool:
    return features.get("price") is not None


def _check_numeric_ranges(features: dict[str, Any]) -> bool:
    price = features.get("price")
    return price is None or price >= 0


def _check_outliers(features: dict[str, Any]) -> bool:
    price = features.get("price")
    return price is None or price <= 1_000_000_000


def validate_features(features: dict[str, Any]) -> None:
    if not isinstance(features, dict):
        raise FeatureValidationError("Invalid feature vector format")
    if not _check_missing_values(features):
        raise FeatureValidationError("Missing required values")
    if not _check_numeric_ranges(features):
        raise FeatureValidationError("Values out of numeric bounds")
    if not _check_outliers(features):
        raise FeatureValidationError("Outliers detected")


class FeatureGenerationService(BaseService):
    def __init__(self, features_repo: AssetFeaturesRepository, snapshot_repo: AssetSnapshotRepository):
        self.features_repo = features_repo
        self.snapshot_repo = snapshot_repo

    def generate(self, asset_id: uuid.UUID) -> dict[str, Any] | None:
        """Builds AssetFeatures from the latest AssetSnapshot. Returns the Redis cache
        payload, or None if there is no snapshot yet."""
        snapshot = self.snapshot_repo.get(asset_id)
        if not snapshot:
            return None

        features_dict = {
            "price": float(snapshot.price) if snapshot.price is not None else None,
            "market_cap": float(snapshot.market_cap) if snapshot.market_cap is not None else None,
            "momentum_score": float(snapshot.momentum_score) if snapshot.momentum_score is not None else None,
            "volatility_score": float(snapshot.volatility_score) if snapshot.volatility_score is not None else None,
            "sentiment_score": float(snapshot.sentiment_score) if snapshot.sentiment_score is not None else None,
        }
        validate_features(features_dict)

        asset_features = AssetFeatures(
            asset_id=asset_id,
            price=features_dict["price"],
            market_cap=features_dict["market_cap"],
            momentum_score=features_dict["momentum_score"],
            volatility_score=features_dict["volatility_score"],
            sentiment_score=features_dict["sentiment_score"],
            updated_at=datetime.now(timezone.utc)
        )
        updated_features = self.features_repo.upsert(asset_features)
        self.features_repo.session.commit()

        return {
            "asset_id": str(updated_features.asset_id),
            "price": float(updated_features.price) if updated_features.price is not None else None,
            "market_cap": float(updated_features.market_cap) if updated_features.market_cap is not None else None,
            "momentum_score": float(updated_features.momentum_score) if updated_features.momentum_score is not None else None,
            "volatility_score": float(updated_features.volatility_score) if updated_features.volatility_score is not None else None,
            "sentiment_score": float(updated_features.sentiment_score) if updated_features.sentiment_score is not None else None,
            "updated_at": updated_features.updated_at.isoformat() if updated_features.updated_at else None
        }


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
