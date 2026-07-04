import uuid
from datetime import datetime, timezone
from typing import Any

from app.domain.entities.market import AssetSnapshot, PriceHistory
from app.domain.services.base import BaseService
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository
from app.infrastructure.repositories.market import MarketRepository


class SnapshotService(BaseService):
    def __init__(self, snapshot_repo: AssetSnapshotRepository, market_repo: MarketRepository):
        self.snapshot_repo = snapshot_repo
        self.market_repo = market_repo

    def build_snapshot(self, asset_id: uuid.UUID, indicators: dict[str, Any]) -> dict[str, Any] | None:
        """Persists an AssetSnapshot + PriceHistory point from the latest quote and
        pre-computed technical indicators. Returns the Redis cache payload, or None
        if there is no quote to snapshot yet."""
        quote = self.market_repo.get_quote_by_asset_id(asset_id)
        price = float(quote.price) if quote and quote.price is not None else None
        volume = float(quote.volume) if quote and quote.volume is not None else None
        symbol = quote.symbol if quote else None

        rsi_val = indicators.get("rsi")
        momentum_val = rsi_val / 100.0 if rsi_val is not None else None
        volatility_val = indicators.get("volatility")
        sentiment_val = indicators.get("sentiment")

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
        updated_snapshot = self.snapshot_repo.upsert(snapshot)

        if price is not None and symbol is not None:
            self.market_repo.add_price_history(PriceHistory(
                id=uuid.uuid4(),
                asset_id=asset_id,
                symbol=symbol,
                price=price,
                volume=volume,
                timestamp=datetime.now(timezone.utc)
            ))

        self.snapshot_repo.session.commit()

        return {
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
