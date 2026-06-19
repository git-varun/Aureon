import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.entities.base import Base, TimestampMixin, UUIDMixin


class Watchlist(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "watchlists"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_watchlist_user_name"),
        {"schema": "watchlist"}
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("system.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("system.organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    symbols: Mapped[list["WatchlistSymbol"]] = relationship(
        "WatchlistSymbol",
        back_populates="watchlist",
        cascade="all, delete-orphan",
        order_by="WatchlistSymbol.created_at"
    )

class WatchlistSymbol(UUIDMixin, Base):
    __tablename__ = "watchlist_symbols"
    __table_args__ = (
        UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_symbol"),
        {"schema": "watchlist"}
    )

    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlist.watchlists.id", ondelete="CASCADE"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String(60), nullable=False)
    alert_price: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    watchlist: Mapped["Watchlist"] = relationship("Watchlist", back_populates="symbols")
