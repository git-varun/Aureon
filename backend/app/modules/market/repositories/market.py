import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import or_

from app.modules.market.entities.market import Asset, AssetSnapshot, LatestQuote, MarketTheme, PriceHistory, ThemeWeight
from app.core.repositories.base import BaseRepository


class MarketRepository(BaseRepository):
    def get_quote_by_symbol(self, symbol: str) -> LatestQuote | None:
        return self.session.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()

    def get_quote_by_asset_id(self, asset_id: uuid.UUID) -> LatestQuote | None:
        return self.session.query(LatestQuote).filter(LatestQuote.asset_id == asset_id).first()

    def add_price_history(self, price_history: PriceHistory) -> None:
        self.session.add(price_history)

    def bulk_insert_price_history(self, rows: list[dict]) -> None:
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        stmt = pg_insert(PriceHistory).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
        self.session.execute(stmt)

    def get_asset_by_symbol(self, symbol: str) -> Asset | None:
        return self.session.query(Asset).filter(Asset.symbol == symbol).first()

    def get_snapshot(self, asset_id: Optional[uuid.UUID]) -> AssetSnapshot | None:
        if not asset_id:
            return None
        return self.session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()

    def list_assets(self, search: Optional[str] = None, limit: int = 50) -> list[Asset]:
        query = self.session.query(Asset)
        if search:
            query = query.filter(or_(Asset.symbol.contains(search.upper()), Asset.name.contains(search)))
        return query.limit(limit).all()

    def search_assets(self, q_clean: str, q_raw: str, limit: int = 10) -> list[Asset]:
        return (
            self.session.query(Asset)
            .filter(or_(Asset.symbol.contains(q_clean), Asset.name.contains(q_raw)))
            .order_by(Asset.symbol != q_clean)
            .limit(limit)
            .all()
        )

    def list_all_assets(self) -> list[Asset]:
        return self.session.query(Asset).all()

    def list_assets_with_latest_quote(self, exclude_asset_class: Optional[str] = None) -> list[tuple[Asset, LatestQuote]]:
        query = self.session.query(Asset, LatestQuote).join(LatestQuote, LatestQuote.asset_id == Asset.id)
        if exclude_asset_class:
            query = query.filter(Asset.asset_class != exclude_asset_class)
        return query.all()

    def get_latest_price_history(self, asset_id: uuid.UUID) -> PriceHistory | None:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id)
            .order_by(PriceHistory.timestamp.desc())
            .first()
        )

    def get_price_history_before(self, asset_id: uuid.UUID, cutoff: datetime) -> PriceHistory | None:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id, PriceHistory.timestamp <= cutoff)
            .order_by(PriceHistory.timestamp.desc())
            .first()
        )

    def get_earliest_price_history(self, asset_id: uuid.UUID) -> PriceHistory | None:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id)
            .order_by(PriceHistory.timestamp.asc())
            .first()
        )

    def get_price_history_since(self, asset_id: uuid.UUID, cutoff: datetime) -> list[PriceHistory]:
        return (
            self.session.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id, PriceHistory.timestamp >= cutoff)
            .order_by(PriceHistory.timestamp.asc())
            .all()
        )

    def get_user_theme(self, theme_id: str, owner_id: uuid.UUID) -> MarketTheme | None:
        return (
            self.session.query(MarketTheme)
            .filter(MarketTheme.theme_id == theme_id, MarketTheme.owner_id == owner_id)
            .first()
        )

    def add_theme(self, theme: MarketTheme) -> MarketTheme:
        self.session.add(theme)
        self.session.flush()
        return theme

    def add_theme_weight(self, weight: ThemeWeight) -> None:
        self.session.add(weight)

    def delete_theme_weights(self, theme_id: str) -> None:
        self.session.query(ThemeWeight).filter(ThemeWeight.theme_id == theme_id).delete()

    def delete_theme(self, theme: MarketTheme) -> None:
        self.session.delete(theme)

    def commit(self) -> None:
        self.session.commit()
