"""Celery app setup."""

import logging

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

logger = logging.getLogger("celery.config")

broker_url = settings.celery_broker_url
backend_url = settings.celery_result_backend

celery_app = Celery("investment_os")

if broker_url and backend_url:
    celery_app.conf.broker_url = broker_url
    celery_app.conf.result_backend = backend_url
    logger.info("Celery configured in an async mode (broker+backend enabled)")
else:
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    logger.warning("Celery configured in an eager mode (CELERY_BROKER_URL / CELERY_RESULT_BACKEND missing)")

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.timezone,
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,
    task_soft_time_limit=25 * 60,
    imports=[
        "app.tasks.portfolio",
        "app.tasks.signals",
        "app.tasks.news",
        "app.tasks.ai",
        "app.tasks.pipeline",
    ],
    beat_schedule={
        "daily-pipeline": {
            "task": "pipeline.daily",
            "schedule": crontab(hour=9, minute=0, day_of_week="mon-fri"),
        },
        "price-refresh": {
            "task": "portfolio.refresh_prices",
            "schedule": crontab(minute="*/15", hour="9-15", day_of_week="mon-fri"),
        },
        "daily-signals": {
            "task": "signals.daily_batch",
            "schedule": crontab(hour=10, minute=0, day_of_week="mon-fri"),
        },
        "morning-briefing": {
            "task": "ai.global_briefing",
            "schedule": crontab(hour=7, minute=0),
        },
        "seed-price-history": {
            "task": "portfolio.seed_price_history",
            "schedule": crontab(hour=2, minute=0, day_of_week="sun"),
        },
        "fetch-news": {
            "task": "news.fetch",
            "schedule": crontab(hour=8, minute=0),
        },
        "refresh-fundamentals": {
            "task": "portfolio.seed_fundamentals",
            "schedule": crontab(hour=3, minute=0, day_of_week="sun"),
        },
    },
)
