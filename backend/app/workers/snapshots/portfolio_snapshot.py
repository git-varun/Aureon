import uuid
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.redis import invalidate_portfolio_snapshot
from app.domain.entities.portfolio import PortfolioSnapshot
from app.infrastructure.repositories.portfolio_snapshot import (
    PortfolioSnapshotRepository,
)


def process_portfolio_snapshot(portfolio_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        # Portfolio -> Positions -> Latest Quotes -> Aggregate Values
        # Note: Entities might not exist yet, defaulting values for now
        
        snapshot = PortfolioSnapshot(
            portfolio_id=portfolio_id,
            market_value=0.0,
            cash_balance=0.0,
            allocation={},
            daily_return=0.0,
            total_return=0.0,
            updated_at=datetime.now(timezone.utc)
        )
        
        # UPSERT portfolio_snapshot
        repo = PortfolioSnapshotRepository(session)
        repo.upsert(snapshot)
        session.commit()
        
        # Invalidate Redis
        invalidate_portfolio_snapshot(str(portfolio_id))
