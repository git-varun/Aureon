import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import cache_asset_snapshot
from app.domain.entities.market import AssetSnapshot, LatestQuote
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository
from app.workers.evaluation.signals import compute_indicators


def process_asset_snapshot(asset_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        # Load Market Facts
        quote = session.scalar(select(LatestQuote).filter_by(asset_id=asset_id))
        price = float(quote.price) if quote and quote.price is not None else None
        symbol = quote.symbol if quote else None
        
        # Default indicators
        rsi_val = None
        momentum_val = None
        volatility_val = None
        sentiment_val = None
        payload_dict = {}

        if symbol:
            indicators = compute_indicators(symbol)
            rsi_val = indicators.get("rsi")
            momentum_val = rsi_val / 100.0 if rsi_val is not None else None
            volatility_val = indicators.get("volatility")
            sentiment_val = indicators.get("sentiment")
            payload_dict = indicators
        
        # Build Snapshot
        snapshot = AssetSnapshot(
            asset_id=asset_id,
            price=price,
            market_cap=None,
            pe_ratio=None,
            rsi=rsi_val,
            momentum_score=momentum_val,
            volatility_score=volatility_val,
            sentiment_score=sentiment_val,
            payload=payload_dict,
            updated_at=datetime.now(timezone.utc)
        )
        
        # UPSERT asset_snapshot
        repo = AssetSnapshotRepository(session)
        updated_snapshot = repo.upsert(snapshot)
        session.commit()
        
        # Update Redis
        cache_data = {
            "asset_id": str(updated_snapshot.asset_id),
            "price": float(updated_snapshot.price) if updated_snapshot.price is not None else None,
            "market_cap": float(updated_snapshot.market_cap) if updated_snapshot.market_cap is not None else None,
            "pe_ratio": float(updated_snapshot.pe_ratio) if updated_snapshot.pe_ratio is not None else None,
            "rsi": float(updated_snapshot.rsi) if updated_snapshot.rsi is not None else None,
            "momentum_score": float(updated_snapshot.momentum_score) if updated_snapshot.momentum_score is not None else None,
            "volatility_score": float(updated_snapshot.volatility_score) if updated_snapshot.volatility_score is not None else None,
            "sentiment_score": float(updated_snapshot.sentiment_score) if updated_snapshot.sentiment_score is not None else None,
            "payload": updated_snapshot.payload,
            "updated_at": updated_snapshot.updated_at.isoformat() if updated_snapshot.updated_at else None
        }
        cache_asset_snapshot(str(asset_id), cache_data)

        # Trigger downstream feature generation
        from app.workers.evaluation.features import generate_features
        generate_features(asset_id)
