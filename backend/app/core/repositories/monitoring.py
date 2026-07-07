from sqlalchemy import text

from app.modules.market.entities.market import LatestQuote
from app.modules.portfolio.entities.portfolio import Position, Transaction
from app.core.entities.system import FailedIngestion, Provider
from app.core.repositories.base import BaseRepository


class MonitoringRepository(BaseRepository):
    def list_providers(self) -> list[Provider]:
        return self.session.query(Provider).all()

    def list_all_quotes(self) -> list[LatestQuote]:
        return self.session.query(LatestQuote).all()

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

    def get_migration_version(self) -> str | None:
        return self.session.execute(text("SELECT version_num FROM alembic_version")).scalar()
