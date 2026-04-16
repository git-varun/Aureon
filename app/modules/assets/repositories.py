"""Assets repositories — SQLAlchemy query helpers for Asset and PriceHistory."""

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, PriceHistory
from app.shared.constants import AssetType


class AssetRepository:
    """Query helpers scoped to the assets table."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_symbol(self, symbol: str) -> Optional[Asset]:
        return self.db.query(Asset).filter(Asset.symbol == symbol).first()

    def get_by_type(self, asset_type: AssetType) -> List[Asset]:
        return self.db.query(Asset).filter(Asset.asset_type == asset_type).all()

    def get_by_exchange(self, exchange: str) -> List[Asset]:
        return (
            self.db.query(Asset)
            .filter(func.upper(Asset.exchange) == exchange.upper())
            .all()
        )

    def list_all(
        self,
        asset_type: Optional[AssetType] = None,
        exchange: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Asset]:
        query = self.db.query(Asset)
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)
        if exchange:
            query = query.filter(func.upper(Asset.exchange) == exchange.upper())
        if search:
            like = f"%{search.upper()}%"
            query = query.filter(
                func.upper(Asset.symbol).like(like)
                | func.upper(Asset.name).like(like)
            )
        return query.order_by(Asset.symbol).all()

    def upsert(
        self,
        symbol: str,
        name: str,
        asset_type: AssetType,
        exchange: Optional[str] = None,
    ) -> Asset:
        asset = self.get_by_symbol(symbol)
        if asset:
            asset.name = name
            asset.asset_type = asset_type
            asset.exchange = exchange
        else:
            asset = Asset(symbol=symbol, name=name, asset_type=asset_type, exchange=exchange)
            self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset


class PriceHistoryRepository:
    """Query helpers scoped to the price_history table."""

    def __init__(self, db: Session):
        self.db = db

    def get_range(
        self,
        asset_id: int,
        start: datetime,
        end: datetime,
    ) -> List[PriceHistory]:
        return (
            self.db.query(PriceHistory)
            .filter(
                PriceHistory.asset_id == asset_id,
                PriceHistory.date >= start,
                PriceHistory.date <= end,
            )
            .order_by(PriceHistory.date)
            .all()
        )

    def get_last_n_days(self, asset_id: int, days: int = 30) -> List[PriceHistory]:
        start = datetime.utcnow() - timedelta(days=days)
        return self.get_range(asset_id, start, datetime.utcnow())

    def save_snapshot(
        self,
        asset_id: int,
        date: datetime,
        close: float,
        open_price: Optional[float] = None,
        high: Optional[float] = None,
        low: Optional[float] = None,
        volume: Optional[float] = None,
    ) -> PriceHistory:
        """Insert or update a single OHLCV candle for the given date (day-level dedup)."""
        existing = self.db.query(PriceHistory).filter(
            PriceHistory.asset_id == asset_id,
            func.date(PriceHistory.date) == date.date(),
        ).first()

        if existing:
            existing.close = close
            existing.open_price = open_price
            existing.high = high
            existing.low = low
            existing.volume = volume
            record = existing
        else:
            record = PriceHistory(
                asset_id=asset_id,
                date=date,
                close=close,
                open_price=open_price,
                high=high,
                low=low,
                volume=volume,
            )
            self.db.add(record)

        self.db.commit()
        return record
