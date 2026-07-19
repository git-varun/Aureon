from datetime import datetime

from sqlalchemy import text

from app.modules.market.entities.market import LatestQuote
from app.modules.portfolio.entities.portfolio import Position, Transaction
from app.core.entities.system import AuditLog, FailedIngestion, Provider
from app.core.repositories.base import BaseRepository


class MonitoringRepository(BaseRepository):
    def list_providers(self) -> list[Provider]:
        return self.session.query(Provider).all()

    def list_audit_logs(
        self,
        action: str | None = None,
        entity_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AuditLog]:
        query = self.session.query(AuditLog).order_by(AuditLog.created_at.desc())
        if action is not None:
            query = query.filter(AuditLog.action == action)
        if entity_type is not None:
            query = query.filter(AuditLog.entity_type == entity_type)
        if since is not None:
            query = query.filter(AuditLog.created_at >= since)
        if until is not None:
            query = query.filter(AuditLog.created_at <= until)
        return query.limit(limit).offset(offset).all()

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
