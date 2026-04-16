"""Portfolio repositories."""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, Position
from app.shared.constants import AssetType


class AssetRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_symbol(self, symbol: str) -> Optional[Asset]:
        return self.db.query(Asset).filter(Asset.symbol == symbol).first()

    def upsert(self, symbol: str, name: str, asset_type: AssetType, exchange: str | None = None) -> Asset:
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

    def list_all(self) -> List[Asset]:
        return self.db.query(Asset).all()


class PositionRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_by_asset(self, asset_id: int) -> Optional[Position]:
        return self.db.query(Position).filter(Position.asset_id == asset_id).first()

    def create(self, asset_id: int, quantity: float, avg_buy_price: float) -> Position:
        current_value = quantity * avg_buy_price
        pnl = current_value - (quantity * avg_buy_price)
        pnl_percent = 0.0 if avg_buy_price == 0 else (pnl / (quantity * avg_buy_price) * 100)

        position = Position(
            asset_id=asset_id,
            quantity=quantity,
            avg_buy_price=avg_buy_price,
            current_value=current_value,
            pnl=pnl,
            pnl_percent=pnl_percent,
        )
        self.db.add(position)
        self.db.commit()
        self.db.refresh(position)
        return position

    def delete_by_asset(self, asset_id: int) -> None:
        self.db.query(Position).filter(Position.asset_id == asset_id).delete()
        self.db.commit()




