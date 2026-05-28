"""Celery tasks: notification jobs."""

import logging

from app.core.celery_app import celery_app
from app.core.db import SessionLocal

logger = logging.getLogger("tasks.notification")


@celery_app.task(name="notification.daily_summary", bind=True)
def daily_summary_task(self):
    """Send a daily portfolio summary notification to every active user.

    For each user with at least one position, computes day P&L and open signal
    count, then inserts a Notification row they'll see on next login.
    """
    from app.modules.notification.models import Notification
    from app.modules.portfolio.models import Asset, Position
    from app.modules.signals.models import Signal
    from app.modules.users.models import User
    from sqlalchemy import func

    session = None
    try:
        session = SessionLocal()

        user_ids = [
            uid for (uid,) in
            session.query(Position.user_id)
            .filter(Position.user_id.isnot(None))
            .distinct()
            .all()
        ]
        if not user_ids:
            logger.info("daily_summary_task: no users with positions")
            return {"status": "success", "users": 0}

        notified = 0
        for uid in user_ids:
            positions = (
                session.query(Position)
                .filter(Position.user_id == uid, Position.quantity > 0)
                .all()
            )

            day_pnl = 0.0
            total_value = 0.0
            for pos in positions:
                asset = session.get(Asset, pos.asset_id)
                if not asset or not asset.current_price:
                    continue
                price = float(asset.current_price)
                prev = float(asset.previous_close or price)
                qty = float(pos.quantity)
                total_value += price * qty
                day_pnl += (price - prev) * qty

            open_signals = (
                session.query(func.count(Signal.id))
                .filter(Signal.user_id == uid, Signal.status == "active")
                .scalar()
            ) or 0

            direction = "▲" if day_pnl >= 0 else "▼"
            pnl_str = f"{direction} ₹{abs(day_pnl):,.0f}"
            message = (
                f"Portfolio value: ₹{total_value:,.0f} | "
                f"Day P&L: {pnl_str} | "
                f"Open signals: {open_signals}"
            )

            session.add(Notification(
                user_id=uid,
                title="Daily Portfolio Summary",
                message=message,
                type="info",
            ))
            notified += 1

        session.commit()
        logger.info("daily_summary_task: notified %d users", notified)
        return {"status": "success", "users": notified}
    except Exception as exc:
        logger.exception("daily_summary_task failed: %s", exc)
        if session:
            session.rollback()
        raise
    finally:
        if session:
            session.close()
