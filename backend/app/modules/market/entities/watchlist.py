import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.entities.base import Base, TimestampMixin, UUIDMixin


class Watchlist(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "watchlists"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_watchlist_user_name"),
        {"schema": "watchlist"}
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("system.users.id", ondelete="CASCADE"), nullable=False, index=True
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
    # Direction the alert fires in ("gte" = notify when price rises to/above
    # alert_price, "lte" = notify when price falls to/below it), derived once
    # at set_alert time from the price then vs. the target, mirroring the
    # frontend's own alertPrice >= price heuristic (Watchlist.jsx). Needed
    # because alert_price alone is a bare threshold with no stored direction.
    alert_direction: Mapped[str | None] = mapped_column(String(3), nullable=True)
    # True once the alert has fired for the current crossing; reset to False
    # when price moves back to the non-triggered side, so a later re-crossing
    # can fire again (fire-once-per-crossing, not once-per-evaluation-tick).
    alert_triggered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    watchlist: Mapped["Watchlist"] = relationship("Watchlist", back_populates="symbols")
