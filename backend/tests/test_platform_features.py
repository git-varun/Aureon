import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.core.exceptions import NotFoundError
from app.domain.entities.base import Base
from app.domain.entities.market import Asset, AssetSnapshot, LatestQuote
from app.domain.entities.news import News
from app.domain.entities.system import Organization, OrganizationMember, User
from app.domain.services import (
    ConfigService,
    NewsService,
    NotificationService,
    WatchlistService,
)
from app.infrastructure.repositories import (
    ConfigRepository,
    NewsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
    UsersRepository,
    WatchlistsRepository,
    WebNotificationsRepository,
)

client = TestClient(app)

@pytest.fixture
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- HELPER TO GET AUTH HEADERS ---
def get_auth_headers(db_session, email="admin@test.com", role="OWNER"):
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    
    # Create user
    user = users_repo.get_by_email(email)
    if not user:
        from app.core.security import hash_password
        user = User(email=email, password_hash=hash_password("password123"), is_active=True, is_verified=True)
        users_repo.create(user)
    
    # Create org
    org = db_session.scalar(select(Organization).filter_by(slug="test-org"))
    if not org:
        org = Organization(name="Test Org", slug="test-org")
        orgs_repo.create(org)
        db_session.flush()
        
    # Make member
    member = members_repo.get_by_org_and_user(org.id, user.id)
    if not member:
        member = OrganizationMember(organization_id=org.id, user_id=user.id, role=role)
        members_repo.create(member)
        db_session.flush()
        
    db_session.commit()
    
    # Create session
    from app.domain.entities.system import UserSession
    from app.infrastructure.repositories import SessionsRepository
    sessions_repo = SessionsRepository(db_session)
    sess_token = f"token-{uuid.uuid4()}"
    user_sess = UserSession(
        user_id=user.id,
        session_token=sess_token,
        expires_at=datetime_now_plus_hour()
    )
    sessions_repo.create(user_sess)
    db_session.commit()
    
    return {"Authorization": f"Bearer {sess_token}"}, user, org

def datetime_now_plus_hour():
    from datetime import datetime, timedelta, timezone
    return datetime.now(timezone.utc) + timedelta(hours=1)


# ── Watchlist Tests ───────────────────────────────────────────────────────────

def test_watchlist_service_crud_and_alerts(clean_db, db_session):
    # Setup test user and repositories
    headers, user, org = get_auth_headers(db_session)
    
    wl_repo = WatchlistsRepository(db_session)
    wl_svc = WatchlistService(wl_repo)
    
    # 1. Create Watchlist
    wl_dict = wl_svc.create_watchlist(user.id, "My Favorites", org.id)
    assert wl_dict["name"] == "My Favorites"
    assert len(wl_dict["symbols"]) == 0
    
    # 2. Rename Watchlist
    wl_id = uuid.UUID(wl_dict["id"])
    renamed = wl_svc.rename_watchlist(wl_id, user.id, "High growth")
    assert renamed["name"] == "High growth"
    
    # 3. Add Symbol
    # Add a mock quote first
    quote = LatestQuote(symbol="AAPL", price=175.5, volume=1000)
    db_session.add(quote)
    db_session.commit()
    
    enriched = wl_svc.add_symbol(wl_id, user.id, "AAPL")
    assert len(enriched["symbols"]) == 1
    assert enriched["symbols"][0]["symbol"] == "AAPL"
    assert enriched["symbols"][0]["currentPrice"] == 175.5
    
    # 4. Set alert
    alerted = wl_svc.set_alert(wl_id, user.id, "AAPL", 180.0)
    assert alerted["symbols"][0]["alertPrice"] == 180.0
    
    # 5. Clear alert
    cleared = wl_svc.clear_alert(wl_id, user.id, "AAPL")
    assert cleared["symbols"][0]["alertPrice"] is None
    
    # 6. Remove Symbol
    removed = wl_svc.remove_symbol(wl_id, user.id, "AAPL")
    assert len(removed["symbols"]) == 0
    
    # 7. Delete watchlist
    wl_svc.delete_watchlist(wl_id, user.id)
    with pytest.raises(NotFoundError):
        wl_svc._get_or_404(wl_id, user.id)


# ── Config Tests ──────────────────────────────────────────────────────────────

def test_config_service_encryption_and_seeding(clean_db, db_session):
    cfg_repo = ConfigRepository(db_session)
    cfg_svc = ConfigService(cfg_repo)
    
    # 1. Seed defaults
    ConfigService.seed_defaults(db_session)
    
    # 2. Check defaults loaded
    providers = cfg_svc.get_all_providers()
    assert len(providers) > 0
    assert any(p["provider_name"] == "finnhub" for p in providers)
    
    # 3. Test API Key Encryption and Decryption
    cfg_svc.set_provider_key("finnhub", "api_key", "secret_token_123")
    
    # Key status should show set (True)
    p_dict = cfg_svc.get_provider_dict("finnhub")
    assert p_dict["keys_status"]["api_key"] is True
    
    # Decryption should return original value
    decrypted = cfg_svc.get_decrypted_key("finnhub", "api_key")
    assert decrypted == "secret_token_123"


# ── Notification Tests ────────────────────────────────────────────────────────

def test_notification_service_flow(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    notif_repo = WebNotificationsRepository(db_session)
    notif_svc = NotificationService(notif_repo)
    
    # 1. Create Notification
    notif_data = {
        "user_id": user.id,
        "title": "Welcome!",
        "message": "Welcome to Aureon Platform features.",
        "type": "info"
    }
    notif = notif_svc.create_notification(notif_data)
    assert notif["title"] == "Welcome!"
    assert notif["read"] is False
    
    # 2. List notifications
    notifs = notif_svc.get_notifications_by_user(user.id)
    assert len(notifs) == 1
    
    # 3. Mark read
    notif_id = uuid.UUID(notif["id"])
    notif_svc.mark_as_read(notif_id, user.id)
    
    # Verify read status updated
    notifs_after = notif_svc.get_notifications_by_user(user.id)
    assert notifs_after[0]["read"] is True


# ── News Tests ────────────────────────────────────────────────────────────────

def test_news_ingestion_and_linking(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    # Add a mock asset latest quote to link news to
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, "AAPL")
    db_session.add(Asset(id=asset_id, symbol="AAPL", name="AAPL", asset_class="equity"))
    quote = LatestQuote(symbol="AAPL", asset_id=asset_id, price=175.5, volume=1000)
    db_session.add(quote)
    # Also add the asset snapshot to satisfy foreign key
    snapshot = AssetSnapshot(asset_id=asset_id, price=175.5, payload={})
    db_session.add(snapshot)
    db_session.commit()
    
    news_repo = NewsRepository(db_session)
    news_svc = NewsService(news_repo)
    
    # 1. Manually add news item
    news_item = News(
        title="Apple releases new device",
        source="yahoo",
        url="https://finance.yahoo.com/news/apple-12345",
        symbols="AAPL"
    )
    news_repo.save_news(news_item)
    db_session.commit()
    
    # 2. Link news assets
    news_svc._link_news_assets("AAPL")
    db_session.commit()
    
    # Check junction table
    na = news_repo.get_news_asset(news_item.id, asset_id)
    assert na is not None
    assert na.news_id == news_item.id
    assert na.asset_id == asset_id


# ── REST API Endpoint Tests ───────────────────────────────────────────────────

def test_api_watchlist_endpoints(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    # Create watchlist
    res = client.post("/api/v1/watchlist/", json={"name": "Tech Stocks"}, headers=headers)
    assert res.status_code == 201
    wl_data = res.json()
    wl_id = wl_data["id"]
    assert wl_data["name"] == "Tech Stocks"
    
    # List watchlists
    res = client.get("/api/v1/watchlist/", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    
    # Rename watchlist
    res = client.put(f"/api/v1/watchlist/{wl_id}", json={"name": "Big Tech"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Big Tech"
    
    # Add symbol
    res = client.post(f"/api/v1/watchlist/{wl_id}/symbols", json={"symbol": "AAPL"}, headers=headers)
    assert res.status_code == 200
    
    # Remove symbol
    res = client.delete(f"/api/v1/watchlist/{wl_id}/symbols/AAPL", headers=headers)
    assert res.status_code == 200
    
    # Delete watchlist
    res = client.delete(f"/api/v1/watchlist/{wl_id}", headers=headers)
    assert res.status_code == 204


def test_api_config_endpoints(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    ConfigService.seed_defaults(db_session)
    
    # 1. Get providers
    res = client.get("/api/v1/config/providers", headers=headers)
    assert res.status_code == 200
    assert "providers" in res.json()
    
    # 2. Toggle provider enabled status
    res = client.put("/api/v1/config/providers/finnhub", json={"enabled": False}, headers=headers)
    assert res.status_code == 200
    providers = res.json()["providers"]
    finnhub_p = next(p for p in providers if p["provider_name"] == "finnhub")
    assert finnhub_p["enabled"] is False
    
    # 3. Set provider key
    res = client.put("/api/v1/config/providers/finnhub/keys", json={"key_name": "api_key", "value": "test-key-abc"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["provider"]["keys_status"]["api_key"] is True
    
    # 4. Get jobs
    res = client.get("/api/v1/config/jobs", headers=headers)
    assert res.status_code == 200
    assert "jobs" in res.json()
    
    # 5. Update job schedule
    res = client.put("/api/v1/config/jobs/refresh_prices", json={"enabled": True, "cron_schedule": "*/5 * * * *"}, headers=headers)
    assert res.status_code == 200
    
    # 6. Trigger job run
    res = client.post("/api/v1/config/jobs/refresh_prices/run", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "triggered"
    assert res.json()["task_id"] is not None
    
    # 7. Get job logs
    res = client.get("/api/v1/config/jobs/refresh_prices/logs", headers=headers)
    assert res.status_code == 200
    assert len(res.json()["logs"]) > 0


def test_api_notification_endpoints(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    # Create a notification
    res = client.post("/api/v1/notifications/", json={"title": "Alert", "message": "High priority alert", "type": "warning"}, headers=headers)
    assert res.status_code == 200
    notif_data = res.json()
    notif_id = notif_data["id"]
    
    # Get list
    res = client.get("/api/v1/notifications/", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    
    # Mark read
    res = client.put(f"/api/v1/notifications/{notif_id}/read", headers=headers)
    assert res.status_code == 200
