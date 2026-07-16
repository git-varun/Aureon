import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.repositories.base import BaseRepository
from app.modules.market.entities.market import AssetFundamentals


class AssetFundamentalsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, asset_id: uuid.UUID) -> AssetFundamentals | None:
        stmt = select(AssetFundamentals).where(AssetFundamentals.asset_id == asset_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, asset_id: uuid.UUID, fundamentals: dict) -> AssetFundamentals:
        now = datetime.now(timezone.utc)
        stmt = insert(AssetFundamentals).values(
            asset_id=asset_id,
            trailing_pe=fundamentals.get("trailing_pe"),
            price_to_book=fundamentals.get("price_to_book"),
            roe=fundamentals.get("roe"),
            debt_to_equity=fundamentals.get("debt_to_equity"),
            profit_margin=fundamentals.get("profit_margin"),
            revenue_growth=fundamentals.get("revenue_growth"),
            dividend_yield=fundamentals.get("dividend_yield"),
            created_at=now,
            updated_at=now,
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=["asset_id"],
            set_=dict(
                trailing_pe=stmt.excluded.trailing_pe,
                price_to_book=stmt.excluded.price_to_book,
                roe=stmt.excluded.roe,
                debt_to_equity=stmt.excluded.debt_to_equity,
                profit_margin=stmt.excluded.profit_margin,
                revenue_growth=stmt.excluded.revenue_growth,
                dividend_yield=stmt.excluded.dividend_yield,
                updated_at=stmt.excluded.updated_at,
            )
        ).returning(AssetFundamentals)

        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result
