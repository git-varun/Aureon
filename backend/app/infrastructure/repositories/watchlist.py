from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.watchlist import Watchlist, WatchlistSymbol


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
