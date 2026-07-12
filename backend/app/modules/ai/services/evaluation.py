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
from app.modules.news.repositories.asset_sentiment import AssetSentimentSnapshotRepository


class FeatureValidationError(Exception):
    pass


def _check_price_present(features: dict[str, Any]) -> bool:
    return features.get("price") is not None


def _check_price_numeric_range(features: dict[str, Any]) -> bool:
    price = features.get("price")
    return price is None or price >= 0


def _check_price_outliers(features: dict[str, Any]) -> bool:
    price = features.get("price")
    return price is None or price <= 1_000_000_000


def validate_features(features: dict[str, Any]) -> None:
    """Validates price only — market_cap/momentum_score/volatility_score/
    sentiment_score are allowed to be None and are handled downstream as
    partial/unavailable, not rejected here. See EVALUATION_MODULE_AUDIT.md 3.3."""
    if not isinstance(features, dict):
        raise FeatureValidationError("Invalid feature vector format")
    if not _check_price_present(features):
        raise FeatureValidationError("Missing required values")
    if not _check_price_numeric_range(features):
        raise FeatureValidationError("Values out of numeric bounds")
    if not _check_price_outliers(features):
        raise FeatureValidationError("Outliers detected")


class FeatureGenerationService(BaseService):
    def __init__(
        self,
        features_repo: AssetFeaturesRepository,
        snapshot_repo: AssetSnapshotRepository,
        sentiment_repo: AssetSentimentSnapshotRepository,
    ):
        self.features_repo = features_repo
        self.snapshot_repo = snapshot_repo
        self.sentiment_repo = sentiment_repo

    def generate(self, asset_id: uuid.UUID) -> dict[str, Any] | None:
        """Builds AssetFeatures from the latest AssetSnapshot plus the rolling
        AssetSentimentSnapshot aggregate. Returns the Redis cache payload, or
        None if there is no snapshot yet."""
        snapshot = self.snapshot_repo.get(asset_id)
        if not snapshot:
            return None

        sentiment_snapshot = self.sentiment_repo.get_latest(asset_id)
        # AssetSentimentSnapshot.avg_sentiment_7d is on the -1..1 per-article
        # scale; AssetFeatures.sentiment_score (and the recommendation rule
        # engine) assume 0..1 — convert once, here, at the aggregation boundary.
        sentiment_score = (
            (sentiment_snapshot.avg_sentiment_7d + 1.0) / 2.0
            if sentiment_snapshot and sentiment_snapshot.avg_sentiment_7d is not None
            else None
        )

        features_dict = {
            "price": float(snapshot.price) if snapshot.price is not None else None,
            "market_cap": float(snapshot.market_cap) if snapshot.market_cap is not None else None,
            "momentum_score": float(snapshot.momentum_score) if snapshot.momentum_score is not None else None,
            "volatility_score": float(snapshot.volatility_score) if snapshot.volatility_score is not None else None,
            "sentiment_score": sentiment_score,
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
            "recommendation_score": float(scores.recommendation_score) if scores.recommendation_score is not None else None,
            "quality_score": float(scores.quality_score) if scores.quality_score is not None else None,
            "valuation_score": float(scores.valuation_score) if scores.valuation_score is not None else None,
            "unavailable_inputs": scores.unavailable_inputs or [],
            "generated_at": scores.generated_at
        }
