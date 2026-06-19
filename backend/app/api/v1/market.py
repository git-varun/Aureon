import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import get_cached_asset_features, get_cached_asset_snapshot
from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository

router = APIRouter()

@router.get("/assets/{asset_id}/snapshot")
def get_asset_snapshot(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_snapshot(str(asset_id))
    if cached:
        return cached
        
    repo = AssetSnapshotRepository(db)
    snapshot = repo.get(asset_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Asset snapshot not found")
        
    return {
        "asset_id": str(snapshot.asset_id),
        "price": snapshot.price,
        "market_cap": snapshot.market_cap,
        "pe_ratio": snapshot.pe_ratio,
        "rsi": snapshot.rsi,
        "momentum_score": snapshot.momentum_score,
        "volatility_score": snapshot.volatility_score,
        "sentiment_score": snapshot.sentiment_score,
        "payload": snapshot.payload,
        "updated_at": snapshot.updated_at
    }

@router.get("/assets/{asset_id}/features")
def get_asset_features(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_features(str(asset_id))
    if cached:
        return cached

    repo = AssetFeaturesRepository(db)
    features = repo.get(asset_id)
    if not features:
        raise HTTPException(status_code=404, detail="Asset features not found")

    return {
        "asset_id": str(features.asset_id),
        "price": features.price,
        "market_cap": features.market_cap,
        "momentum_score": features.momentum_score,
        "volatility_score": features.volatility_score,
        "sentiment_score": features.sentiment_score,
        "updated_at": features.updated_at
    }
