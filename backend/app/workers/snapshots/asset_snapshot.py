import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import cache_asset_snapshot
from app.domain.entities.market import AssetSnapshot, LatestQuote, PriceHistory
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository
from app.workers.evaluation.signals import compute_indicators


def process_asset_snapshot(asset_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        # Load Market Facts
        quote = session.scalar(select(LatestQuote).filter_by(asset_id=asset_id))
        price = float(quote.price) if quote and quote.price is not None else None
        volume = float(quote.volume) if quote and quote.volume is not None else None
        symbol = quote.symbol if quote else None

        # Compute real indicators (returns None values when unavailable)
        indicators: dict = {}
        if symbol:
            indicators = compute_indicators(symbol)

        rsi_val = indicators.get("rsi")
        momentum_val = rsi_val / 100.0 if rsi_val is not None else None
        volatility_val = indicators.get("volatility")
        sentiment_val = indicators.get("sentiment")

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
            payload=indicators or {},
            updated_at=datetime.now(timezone.utc)
        )

        # UPSERT asset_snapshot
        repo = AssetSnapshotRepository(session)
        updated_snapshot = repo.upsert(snapshot)

        # Log a price history point now that asset_snapshot exists (FK satisfied)
        if price is not None and symbol is not None:
            session.add(PriceHistory(
                id=uuid.uuid4(),
                asset_id=asset_id,
                symbol=symbol,
                price=price,
                volume=volume,
                timestamp=datetime.now(timezone.utc)
            ))

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
