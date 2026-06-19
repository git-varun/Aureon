import uuid
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.redis import cache_asset_features
from app.domain.entities.market import AssetFeatures
from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository
from app.workers.evaluation.validation import validate_features


def generate_features(asset_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        snapshot_repo = AssetSnapshotRepository(session)
        snapshot = snapshot_repo.get(asset_id)
        if not snapshot:
            return

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

        repo = AssetFeaturesRepository(session)
        updated_features = repo.upsert(asset_features)
        session.commit()

        cache_data = {
            "asset_id": str(updated_features.asset_id),
            "price": float(updated_features.price) if updated_features.price is not None else None,
            "market_cap": float(updated_features.market_cap) if updated_features.market_cap is not None else None,
            "momentum_score": float(updated_features.momentum_score) if updated_features.momentum_score is not None else None,
            "volatility_score": float(updated_features.volatility_score) if updated_features.volatility_score is not None else None,
            "sentiment_score": float(updated_features.sentiment_score) if updated_features.sentiment_score is not None else None,
            "updated_at": updated_features.updated_at.isoformat() if updated_features.updated_at else None
        }
        cache_asset_features(str(asset_id), cache_data)
        
        # Trigger signals
        from app.workers.evaluation.signals import generate_signals
        generate_signals(asset_id)

