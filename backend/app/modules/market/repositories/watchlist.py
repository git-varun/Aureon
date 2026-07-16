from app.core.repositories.base import BaseRepository
import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.modules.market.entities.market import PriceHistory
from app.modules.market.entities.watchlist import Watchlist, WatchlistSymbol


class WatchlistsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, watchlist_id: uuid.UUID) -> Watchlist | None:
        stmt = select(Watchlist).where(Watchlist.id == watchlist_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_user_and_name(self, user_id: uuid.UUID, name: str) -> Watchlist | None:
        stmt = select(Watchlist).where(Watchlist.user_id == user_id, Watchlist.name == name)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_by_user(self, user_id: uuid.UUID) -> list[Watchlist]:
        stmt = select(Watchlist).where(Watchlist.user_id == user_id)
        return list(self.session.execute(stmt).scalars().all())

    def save(self, watchlist: Watchlist) -> Watchlist:
        self.session.add(watchlist)
        self.session.flush()
        return watchlist

    def delete(self, watchlist: Watchlist) -> None:
        self.session.delete(watchlist)
        self.session.flush()

    def get_symbol(self, watchlist_id: uuid.UUID, symbol: str) -> WatchlistSymbol | None:
        stmt = select(WatchlistSymbol).where(
            WatchlistSymbol.watchlist_id == watchlist_id,
            WatchlistSymbol.symbol == symbol.upper()
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def save_symbol(self, ws: WatchlistSymbol) -> WatchlistSymbol:
        self.session.add(ws)
        self.session.flush()
        return ws

    def delete_symbol(self, ws: WatchlistSymbol) -> None:
        self.session.delete(ws)
        self.session.flush()

    def list_active_alerts_for_symbol(self, symbol: str) -> list[tuple[WatchlistSymbol, uuid.UUID]]:
        """WatchlistSymbol rows with a live alert_price for this symbol, paired with
        their owning watchlist's user_id (needed to address the notification)."""
        stmt = (
            select(WatchlistSymbol, Watchlist.user_id)
            .join(Watchlist, WatchlistSymbol.watchlist_id == Watchlist.id)
            .where(WatchlistSymbol.symbol == symbol, WatchlistSymbol.alert_price.is_not(None))
        )
        return [(ws, user_id) for ws, user_id in self.session.execute(stmt).all()]

    def get_recent_price_history_by_symbols(self, symbols: set[str], limit: int = 30) -> dict[str, list[PriceHistory]]:
        """Batched, single-query fetch of the most recent `limit` price points per symbol."""
        if not symbols:
            return {}

        ranked = (
            select(
                PriceHistory,
                func.row_number()
                .over(partition_by=PriceHistory.symbol, order_by=PriceHistory.timestamp.desc())
                .label("rn"),
            )
            .where(PriceHistory.symbol.in_(symbols))
            .subquery()
        )
        ranked_history = aliased(PriceHistory, ranked)
        stmt = select(ranked_history).where(ranked.c.rn <= limit)
        rows = self.session.execute(stmt).scalars().all()

        by_symbol: dict[str, list[PriceHistory]] = defaultdict(list)
        for row in rows:
            by_symbol[row.symbol].append(row)
        for rows_for_symbol in by_symbol.values():
            rows_for_symbol.sort(key=lambda h: h.timestamp)
        return dict(by_symbol)
