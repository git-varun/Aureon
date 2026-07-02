import uuid
from datetime import datetime, timedelta, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.market import AssetHealth, AssetSnapshot
from app.domain.entities.system import FailedIngestion, Provider
from app.workers.monitoring.asset_health import compute_asset_health
from app.workers.monitoring.providers import monitor_providers
from app.workers.monitoring.recovery import retry_failed_ingestion
from app.workers.monitoring.slas import evaluate_asset_health, evaluate_quote_sla

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_monitoring_data() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_sla_evaluation() -> None:
    assert evaluate_quote_sla(100) is True
    assert evaluate_quote_sla(500) is False
    assert evaluate_quote_sla(None) is False
    
    assert evaluate_asset_health(100, 100, 100) == "HEALTHY"
    assert evaluate_asset_health(500, 100, 100) == "STALE"
    assert evaluate_asset_health(1500, 100, 100) == "DEGRADED"
    assert evaluate_asset_health(None, None, None) == "UNKNOWN"

def test_asset_health_computation(setup_monitoring_data: None) -> None:
    asset_id = uuid.uuid4()

    # AssetHealth.asset_id FKs to asset_snapshot.asset_id, so a snapshot must exist first.
    session = SessionLocal()
    try:
        session.add(AssetSnapshot(asset_id=asset_id, price=None))
        session.commit()
    finally:
        session.close()

    compute_asset_health(asset_id)

    session = SessionLocal()
    try:
        health = session.query(AssetHealth).filter_by(asset_id=asset_id).first()
        assert health is not None
        # No LatestQuote exists, so quote_age is None; the snapshot's fresh updated_at
        # makes signal_age ~0 — quote missing + signal present computes to DEGRADED.
        assert health.status == "DEGRADED"
    finally:
        session.close()

def test_provider_monitoring(setup_monitoring_data: None) -> None:
    session = SessionLocal()
    try:
        provider = Provider(name="test_prov", is_enabled=True)
        session.add(provider)
        session.commit()

        # Add failures
        now = datetime.now(timezone.utc)
        for _ in range(15):
            failure = FailedIngestion(
                provider="test_prov",
                payload={"test": "data"},
                error="test error",
                created_at=now,
                updated_at=now
            )
            session.add(failure)
        session.commit()

        monitor_providers()

        fetched_provider = session.query(Provider).filter_by(name="test_prov").first()
        assert fetched_provider is not None
        assert fetched_provider.health_status == "DEGRADED"
    finally:
        session.close()

def test_failed_ingestion_recovery(setup_monitoring_data: None) -> None:
    session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        failure = FailedIngestion(
            provider="test_prov",
            payload={"test": "data"},
            error="test error",
            created_at=now - timedelta(seconds=60), # 60s ago
            updated_at=now - timedelta(seconds=60),
            attempts=1
        )
        session.add(failure)
        session.commit()
        failure_id = failure.id
    finally:
        session.close()

    retry_failed_ingestion(failure_id)

    session = SessionLocal()
    try:
        updated_failure = session.query(FailedIngestion).filter_by(id=failure_id).first()
        assert updated_failure is not None
        assert updated_failure.attempts == 2
    finally:
        session.close()

def test_monitoring_api(setup_monitoring_data: None) -> None:
    resp = client.get("/api/v1/monitoring/providers")
    assert resp.status_code == 200
    
    resp = client.get("/api/v1/monitoring/failed-ingestions")
    assert resp.status_code == 200
