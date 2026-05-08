"""Tests for app/core/celery_app.py — Celery configuration correctness."""

import pytest


class TestCeleryEagerMode:
    """When broker/backend are absent the app must run in eager (synchronous) mode."""

    def test_eager_mode_when_no_broker_configured(self):
        from app.core.celery_app import celery_app, broker_url, backend_url
        if not (broker_url and backend_url):
            assert celery_app.conf.task_always_eager is True

    def test_eager_propagates_exceptions(self):
        from app.core.celery_app import celery_app, broker_url, backend_url
        if not (broker_url and backend_url):
            assert celery_app.conf.task_eager_propagates is True


class TestCelerySerialisation:
    def test_task_serializer_is_json(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.task_serializer == "json"

    def test_result_serializer_is_json(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.result_serializer == "json"

    def test_accepts_only_json(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.accept_content == ["json"]


class TestCeleryTimeLimits:
    def test_task_time_limit_is_30_minutes(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.task_time_limit == 30 * 60

    def test_task_soft_time_limit_is_25_minutes(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.task_soft_time_limit == 25 * 60


class TestCeleryBeatSchedule:
    def test_beat_schedule_has_required_tasks(self):
        from app.core.celery_app import celery_app
        schedule = celery_app.conf.beat_schedule
        assert "daily-pipeline" in schedule
        assert "price-refresh" in schedule
        assert "morning-briefing" in schedule

    def test_daily_pipeline_task_name(self):
        from app.core.celery_app import celery_app
        task = celery_app.conf.beat_schedule["daily-pipeline"]["task"]
        assert task == "pipeline.daily"

    def test_price_refresh_task_name(self):
        from app.core.celery_app import celery_app
        task = celery_app.conf.beat_schedule["price-refresh"]["task"]
        assert task == "portfolio.refresh_prices"


class TestCeleryTimezone:
    def test_utc_enabled(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.enable_utc is True

    def test_timezone_matches_settings(self):
        from app.core.celery_app import celery_app
        from app.core.config import settings
        assert celery_app.conf.timezone == settings.timezone


class TestCeleryTaskTracking:
    def test_task_track_started_is_true(self):
        from app.core.celery_app import celery_app
        assert celery_app.conf.task_track_started is True
