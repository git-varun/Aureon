from sqlalchemy import text

from app.domain.entities.market import LatestQuote
from app.domain.entities.portfolio import Position, Transaction
from app.domain.entities.system import FailedIngestion, Provider
from app.infrastructure.repositories.base import BaseRepository


class MonitoringRepository(BaseRepository):
    def list_providers(self) -> list[Provider]:
        return self.session.query(Provider).all()

    def list_failed_ingestions(self, limit: int, offset: int) -> list[FailedIngestion]:
        return (
            self.session.query(FailedIngestion)
            .order_by(FailedIngestion.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def ping_postgres(self) -> None:
        self.session.execute(text("SELECT 1")).scalar()

    def count_transactions(self) -> int:
        return self.session.query(Transaction).count()

    def list_positions(self) -> list[Position]:
        return self.session.query(Position).all()

    def get_quote_by_symbol(self, symbol: str) -> LatestQuote | None:
        return self.session.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()
