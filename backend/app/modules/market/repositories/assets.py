from datetime import datetime
from typing import Optional

from app.modules.market.entities.market import Asset, AssetSnapshot, LatestQuote, PriceHistory
from app.modules.portfolio.entities.portfolio import Position
from app.core.repositories.base import BaseRepository


class AssetsRepository(BaseRepository):
    def get_quote(self, symbol: str) -> Optional[LatestQuote]:
        return self.session.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()

    def get_asset(self, symbol: str) -> Optional[Asset]:
        return self.session.query(Asset).filter(Asset.symbol == symbol).first()

    def get_snapshot(self, asset_id) -> Optional[AssetSnapshot]:
        if asset_id is None:
            return None
        return self.session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()

    def get_price_history_since(self, asset_id, cutoff: datetime) -> list[PriceHistory]:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id, PriceHistory.timestamp >= cutoff)
            .order_by(PriceHistory.timestamp.asc())
            .all()
        )

    def get_recent_price_history(self, asset_id, limit: int = 30) -> list[PriceHistory]:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id)
            .order_by(PriceHistory.timestamp.desc())
            .limit(limit)
            .all()
        )

    def get_position(self, portfolio_id, symbol: str) -> Optional[Position]:
        return (
            self.session.query(Position)
            .filter(Position.portfolio_id == portfolio_id, Position.symbol == symbol)
            .first()
        )
