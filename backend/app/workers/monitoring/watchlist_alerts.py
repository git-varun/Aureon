from celery import shared_task

from app.core.database import SessionLocal


@shared_task(name="app.workers.monitoring.watchlist_alerts.evaluate_watchlist_alerts")
def evaluate_watchlist_alerts(symbol: str) -> None:
    from app.core.repositories.notification import WebNotificationsRepository
    from app.core.services.notification import NotificationService
    from app.modules.market.entities.market import LatestQuote
    from app.modules.market.repositories.watchlist import WatchlistsRepository
    from app.modules.market.services.watchlist import WatchlistService

    with SessionLocal() as session:
        quote = session.query(LatestQuote).filter(LatestQuote.symbol == symbol).one_or_none()
        if quote is None or quote.price is None:
            return

        fired = WatchlistService(WatchlistsRepository(session)).evaluate_alerts(symbol, float(quote.price))

        if fired:
            notifications = NotificationService(WebNotificationsRepository(session))
            for payload in fired:
                notifications.create_notification(payload)
