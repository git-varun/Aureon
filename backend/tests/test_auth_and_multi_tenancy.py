from datetime import datetime, timedelta, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.core.exceptions import ConflictError, PermissionDeniedError, ValidationError
from app.domain.entities.base import Base
from app.domain.entities.system import (
    Invitation,
    Organization,
    OrganizationMember,
    User,
    UserSession,
)
from app.domain.services import AuthService, OrganizationService
from app.infrastructure.repositories import (
    InvitationsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
    SessionsRepository,
    UsersRepository,
)

client = TestClient(app)

_APP_SCHEMAS = ["system", "portfolio", "market", "news", "notification", "ai", "evaluation", "config", "recommendation", "watchlist"]

@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    from sqlalchemy import text
    with engine.connect() as conn:
        for schema in _APP_SCHEMAS:
            conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db_session() -> Generator[SessionLocal, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- SERVICE LAYER TESTS ---

def test_organization_creation(clean_db: None, db_session: SessionLocal) -> None:
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    invs_repo = InvitationsRepository(db_session)

    org_service = OrganizationService(orgs_repo, members_repo, invs_repo, users_repo)

    # Create a user first
    owner = User(email="owner@test.com", password_hash="hash", is_active=True)
    users_repo.create(owner)

    # Create org
    org = org_service.create_organization(name="Acme Corp", slug="acme-corp", owner_id=owner.id)
    assert org.id is not None
    assert org.name == "Acme Corp"
    assert org.slug == "acme-corp"

    # Check member record was created as OWNER
    member = members_repo.get_by_org_and_user(org.id, owner.id)
    assert member is not None
    assert member.role == "OWNER"

    # Duplicate slug check
    with pytest.raises(ConflictError):
        org_service.create_organization(name="Duplicate Acme", slug="acme-corp", owner_id=owner.id)

def test_invitation_flow_and_registration(clean_db: None, db_session: SessionLocal) -> None:
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    invs_repo = InvitationsRepository(db_session)
    sessions_repo = SessionsRepository(db_session)

    org_service = OrganizationService(orgs_repo, members_repo, invs_repo, users_repo)
    auth_service = AuthService(users_repo, sessions_repo, invs_repo, orgs_repo, members_repo)

    # Set up owner and org
    owner = User(email="owner@test.com", password_hash="hash", is_active=True)
    users_repo.create(owner)
    org = org_service.create_organization(name="Acme Corp", slug="acme-corp", owner_id=owner.id)

    # 1. Invite a member
    invite = org_service.create_invitation(
        org_id=org.id,
        email="new_member@test.com",
        role="MEMBER",
        invited_by_id=owner.id,
    )
    assert invite.token is not None
    assert invite.status == "PENDING"
    assert invite.email == "new_member@test.com"

    # 2. Register using the invitation token
    session, new_user = auth_service.register_with_invite(
        email="new_member@test.com",
        password="securepassword",
        first_name="New",
        last_name="Member",
        invite_token=invite.token,
    )

    assert new_user.email == "new_member@test.com"
    assert new_user.first_name == "New"
    assert session.session_token is not None

    # Check invitation is consumed (ACCEPTED)
    db_session.refresh(invite)
    assert invite.status == "ACCEPTED"

    # Check new user joined the organization as MEMBER
    member = members_repo.get_by_org_and_user(org.id, new_user.id)
    assert member is not None
    assert member.role == "MEMBER"

    # Test invalid registration (reusing token)
    with pytest.raises(ValidationError):
        auth_service.register_with_invite(
            email="new_member2@test.com",
            password="securepassword",
            first_name="Other",
            last_name="Member",
            invite_token=invite.token,
        )

def test_login_and_session_management(clean_db: None, db_session: SessionLocal) -> None:
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    invs_repo = InvitationsRepository(db_session)
    sessions_repo = SessionsRepository(db_session)

    OrganizationService(orgs_repo, members_repo, invs_repo, users_repo)
    auth_service = AuthService(users_repo, sessions_repo, invs_repo, orgs_repo, members_repo)

    # Create user
    from app.core.security import hash_password
    user = User(email="test@test.com", password_hash=hash_password("mypassword"), is_active=True)
    users_repo.create(user)

    # Login
    session = auth_service.login(email="test@test.com", password="mypassword")
    assert session.session_token is not None
    assert session.user_id == user.id

    # Retrieve session
    fetched_session = sessions_repo.get_by_token(session.session_token)
    assert fetched_session is not None

    # Logout
    auth_service.logout(session.session_token)
    assert sessions_repo.get_by_token(session.session_token) is None

def test_role_enforcement_and_hierarchy(clean_db: None, db_session: SessionLocal) -> None:
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    invs_repo = InvitationsRepository(db_session)

    org_service = OrganizationService(orgs_repo, members_repo, invs_repo, users_repo)

    # Create users
    owner = User(email="owner@test.com", password_hash="hash")
    users_repo.create(owner)
    org = org_service.create_organization(name="Acme Corp", slug="acme", owner_id=owner.id)

    admin = User(email="admin@test.com", password_hash="hash")
    users_repo.create(admin)
    member_rec = OrganizationMember(organization_id=org.id, user_id=admin.id, role="ADMIN")
    members_repo.create(member_rec)

    member = User(email="member@test.com", password_hash="hash")
    users_repo.create(member)
    member_rec2 = OrganizationMember(organization_id=org.id, user_id=member.id, role="MEMBER")
    members_repo.create(member_rec2)

    read_only = User(email="ro@test.com", password_hash="hash")
    users_repo.create(read_only)
    member_rec3 = OrganizationMember(organization_id=org.id, user_id=read_only.id, role="READ_ONLY")
    members_repo.create(member_rec3)

    # 1. Member cannot invite
    with pytest.raises(PermissionDeniedError):
        org_service.create_invitation(org.id, "invited@test.com", "MEMBER", invited_by_id=member.id)

    # 2. Admin can invite member
    invite = org_service.create_invitation(org.id, "invited@test.com", "MEMBER", invited_by_id=admin.id)
    assert invite is not None

    # 3. Admin cannot invite OWNER
    with pytest.raises(PermissionDeniedError):
        org_service.create_invitation(org.id, "invited_owner@test.com", "OWNER", invited_by_id=admin.id)

    # 4. Admin cannot demote OWNER
    with pytest.raises(PermissionDeniedError):
        org_service.update_membership_role(org.id, owner.id, "MEMBER", updated_by_id=admin.id)

    # 5. Owner can demote ADMIN
    updated = org_service.update_membership_role(org.id, admin.id, "MEMBER", updated_by_id=owner.id)
    assert updated.role == "MEMBER"

    # 6. Admin cannot remove other ADMIN (if they were both admin, or owner is needed)
    # Re-promote user admin.id to ADMIN for test
    admin_member = members_repo.get_by_org_and_user(org.id, admin.id)
    admin_member.role = "ADMIN"
    members_repo.update(admin_member)
    
    # Create another admin
    admin2 = User(email="admin2@test.com", password_hash="hash")
    users_repo.create(admin2)
    members_repo.create(OrganizationMember(organization_id=org.id, user_id=admin2.id, role="ADMIN"))

    with pytest.raises(PermissionDeniedError):
        org_service.remove_organization_member(org.id, admin.id, removed_by_id=admin2.id)

    # 7. Cannot remove last OWNER
    with pytest.raises(ValidationError):
        org_service.remove_organization_member(org.id, owner.id, removed_by_id=owner.id)


# --- API LAYER ENDPOINT TESTS ---

def test_api_auth_register_and_login_flow(clean_db: None, monkeypatch: MonkeyPatch) -> None:
    # 1. Seed org & invitation directly
    db = SessionLocal()
    try:
        owner = User(email="owner@test.com", password_hash="hash")
        db.add(owner)
        db.flush()
        org = Organization(name="Acme", slug="acme")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        
        invite = Invitation(
            organization_id=org.id,
            email="invitee@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="valid-token",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        db.add(invite)
        db.commit()
    finally:
        db.close()

    # 2. Test registration API
    reg_payload = {
        "email": "invitee@test.com",
        "password": "mypassword123",
        "first_name": "John",
        "last_name": "Doe",
        "token": "valid-token"
    }
    response = client.post("/api/v1/auth/register", json=reg_payload)
    assert response.status_code == 201
    data = response.json()
    assert "session" in data
    assert "user" in data
    assert data["user"]["email"] == "invitee@test.com"
    token = data["session"]["session_token"]

    # 3. Test GET /auth/me with bearer token
    headers = {"Authorization": f"Bearer {token}"}
    me_resp = client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "invitee@test.com"
    assert me_data["first_name"] == "John"

    # 4. Test login API
    login_payload = {
        "email": "invitee@test.com",
        "password": "mypassword123"
    }
    login_resp = client.post("/api/v1/auth/login", json=login_payload)
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert "session" in login_data
    token2 = login_data["session"]["session_token"]

    # 5. Test logout API
    logout_resp = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token2}"})
    assert logout_resp.status_code == 200
    assert logout_resp.json()["status"] == "success"

def test_api_google_auth(clean_db: None, monkeypatch: MonkeyPatch) -> None:
    # Mock verify_google_token
    monkeypatch.setattr(
        "app.domain.services.auth.verify_google_token",
        lambda id_token: {
            "google_id": "google-12345",
            "email": "google_user@test.com",
            "name": "Google User",
            "picture": "http://pic.com/123",
            "email_verified": True
        }
    )

    # Try Google Login without invitation -> should fail (invite-only)
    resp = client.post("/api/v1/auth/google", json={"id_token": "google-jwt"})
    assert resp.status_code == 400
    assert "Registration is invite-only" in resp.json()["detail"]

    # Create invitation
    db = SessionLocal()
    try:
        owner = User(email="owner@test.com", password_hash="hash")
        db.add(owner)
        db.flush()
        org = Organization(name="Acme", slug="acme")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        
        invite = Invitation(
            organization_id=org.id,
            email="google_user@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="google-invite-token",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        db.add(invite)
        db.commit()
    finally:
        db.close()

    # Try Google Login with invitation -> should succeed!
    resp = client.post("/api/v1/auth/google", json={"id_token": "google-jwt"})
    assert resp.status_code == 200
    data = resp.json()
    assert "session" in data
    assert data["user"]["email"] == "google_user@test.com"
    assert data["user"]["google_id"] == "google-12345"

def test_api_organization_management(clean_db: None) -> None:
    # 1. Create a user and session
    from app.core.security import hash_password
    db = SessionLocal()
    try:
        user = User(email="user@test.com", password_hash=hash_password("pw"), is_active=True, is_verified=True)
        db.add(user)
        db.flush()
        session = UserSession(user_id=user.id, session_token="usertoken", expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        db.add(session)
        db.commit()
    finally:
        db.close()

    headers = {"Authorization": "Bearer usertoken"}

    # 2. Create organization
    org_payload = {
        "name": "Stark Industries",
        "slug": "stark-industries"
    }
    org_resp = client.post("/api/v1/organizations", json=org_payload, headers=headers)
    assert org_resp.status_code == 201
    org_data = org_resp.json()
    assert org_data["name"] == "Stark Industries"
    org_id = org_data["id"]

    # 3. Invite member
    inv_payload = {
        "email": "pepper@stark.com",
        "role": "ADMIN"
    }
    inv_resp = client.post(f"/api/v1/invitations?org_id={org_id}", json=inv_payload, headers=headers)
    assert inv_resp.status_code == 201
    inv_data = inv_resp.json()
    assert inv_data["email"] == "pepper@stark.com"
    assert inv_data["role"] == "ADMIN"
    invite_token = inv_data["token"]
    invite_id = inv_data["id"]

    # 4. Check invitation by token (public endpoint, no header)
    check_resp = client.get(f"/api/v1/invitations/{invite_token}")
    assert check_resp.status_code == 200
    check_data = check_resp.json()
    assert check_data["organization_name"] == "Stark Industries"
    assert check_data["email"] == "pepper@stark.com"

    # 5. List invitations — owner should see all invitations for the org
    list_resp = client.get(f"/api/v1/invitations?org_id={org_id}", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert isinstance(list_data, list)
    assert len(list_data) == 1
    assert list_data[0]["email"] == "pepper@stark.com"

    # 6. List invitations — non-member should be denied
    list_unauth = client.get(f"/api/v1/invitations?org_id={org_id}")
    assert list_unauth.status_code == 401

    # 7. Revoke invitation
    revoke_resp = client.delete(f"/api/v1/invitations/{invite_id}", headers=headers)
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "success"


# --- AUTH HARDENING TESTS ---

def _seed_org_and_invite(email: str, token_str: str, status: str = "PENDING", days: int = 1):
    """Helper: creates owner + org + invitation, returns (owner_id, org_id, invite_id)."""
    db = SessionLocal()
    try:
        owner = User(email=f"owner_{token_str}@test.com", password_hash="hash", is_active=True)
        db.add(owner)
        db.flush()
        org = Organization(name=f"Org-{token_str}", slug=f"org-{token_str}")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        inv = Invitation(
            organization_id=org.id,
            email=email,
            role="MEMBER",
            invited_by_id=owner.id,
            token=token_str,
            status=status,
            expires_at=datetime.now(timezone.utc) + timedelta(days=days),
        )
        db.add(inv)
        db.commit()
    finally:
        db.close()


def test_register_requires_valid_invite_token(clean_db: None) -> None:
    """Registration with a non-existent token is rejected."""
    resp = client.post("/api/v1/auth/register", json={
        "email": "newuser@test.com",
        "password": "Password1!",
        "first_name": "New",
        "last_name": "User",
        "token": "nonexistent-token",
    })
    assert resp.status_code == 404


def test_register_rejects_expired_invite(clean_db: None) -> None:
    """Registration with an expired invitation is rejected."""
    db = SessionLocal()
    try:
        owner = User(email="owner_exp@test.com", password_hash="hash", is_active=True)
        db.add(owner)
        db.flush()
        org = Organization(name="Org-exp", slug="org-exp")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        inv = Invitation(
            organization_id=org.id,
            email="expired@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="expired-token",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(inv)
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/register", json={
        "email": "expired@test.com",
        "password": "Password1!",
        "first_name": "Ex",
        "last_name": "User",
        "token": "expired-token",
    })
    assert resp.status_code == 400


def test_register_rejects_email_mismatch(clean_db: None) -> None:
    """Registration email must match invitation email."""
    _seed_org_and_invite("invited@test.com", "mismatch-tok")
    resp = client.post("/api/v1/auth/register", json={
        "email": "other@test.com",
        "password": "Password1!",
        "first_name": "Wrong",
        "last_name": "User",
        "token": "mismatch-tok",
    })
    assert resp.status_code == 400


def test_register_rejects_reused_invite(clean_db: None) -> None:
    """A consumed invitation cannot be used again."""
    _seed_org_and_invite("reuse@test.com", "reuse-tok")

    # First registration succeeds
    r1 = client.post("/api/v1/auth/register", json={
        "email": "reuse@test.com",
        "password": "Password1!",
        "first_name": "First",
        "last_name": "User",
        "token": "reuse-tok",
    })
    assert r1.status_code == 201

    # Second registration with same token is rejected
    r2 = client.post("/api/v1/auth/register", json={
        "email": "reuse@test.com",
        "password": "Password1!",
        "first_name": "Second",
        "last_name": "User",
        "token": "reuse-tok",
    })
    assert r2.status_code in (400, 409)


def test_compat_register_route_removed(clean_db: None) -> None:
    """/api/auth/register must not exist (was removed to close invite bypass)."""
    resp = client.post("/api/auth/register", json={
        "email": "bypass@test.com",
        "password": "Password1!",
        "first_name": "Bad",
        "last_name": "Actor",
    })
    assert resp.status_code == 404 or resp.status_code == 405


def test_global_logout_invalidates_all_sessions(clean_db: None) -> None:
    """POST /logout/all terminates every session for the user."""
    from app.core.security import hash_password as _hp
    db = SessionLocal()
    try:
        user = User(email="multi@test.com", password_hash=_hp("pw"), is_active=True, is_verified=True)
        db.add(user)
        db.flush()
        sess1 = UserSession(user_id=user.id, session_token="tok-session-1",
                            expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        sess2 = UserSession(user_id=user.id, session_token="tok-session-2",
                            expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        db.add(sess1)
        db.add(sess2)
        db.commit()
    finally:
        db.close()

    # Call logout/all with session-1 credential
    resp = client.post("/api/v1/auth/logout/all",
                       headers={"Authorization": "Bearer tok-session-1"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Both sessions should be gone
    db = SessionLocal()
    try:
        sessions_repo = SessionsRepository(db)
        assert sessions_repo.get_by_token("tok-session-1") is None
        assert sessions_repo.get_by_token("tok-session-2") is None
    finally:
        db.close()


def test_register_rejects_revoked_invite(clean_db: None) -> None:
    """Revoked invitation must persist across session boundary and block registration.

    This test crosses a real session boundary to catch the flush-without-commit bug:
    revoke via HTTP (session closes after response), then verify DB in a fresh session,
    then attempt registration (must be rejected).
    """
    from app.core.security import hash_password as _hp
    # Seed: owner + org + PENDING invitation + owner session
    db = SessionLocal()
    invite_id = None
    invite_token = None
    try:
        owner = User(email="owner_revoke@test.com", password_hash=_hp("pw"), is_active=True, is_verified=True)
        db.add(owner)
        db.flush()
        org = Organization(name="Revoke Org", slug="revoke-org")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        sess = UserSession(user_id=owner.id, session_token="revoke-owner-tok",
                           expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        db.add(sess)
        inv = Invitation(
            organization_id=org.id,
            email="revokeme@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="revoke-invite-tok",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(inv)
        db.commit()
        invite_id = str(inv.id)
        invite_token = inv.token
    finally:
        db.close()

    headers = {"Authorization": "Bearer revoke-owner-tok"}

    # Revoke the invitation via the API (real request; session closes after response)
    revoke_resp = client.delete(f"/api/v1/invitations/{invite_id}", headers=headers)
    assert revoke_resp.status_code == 200, revoke_resp.text

    # Open a FRESH session and verify the status persisted to the DB
    fresh_db = SessionLocal()
    try:
        from app.infrastructure.repositories import InvitationsRepository as _IR
        fresh_inv = _IR(fresh_db).get_by_token(invite_token)
        assert fresh_inv is not None
        assert fresh_inv.status == "REVOKED", (
            f"Expected REVOKED in DB but got {fresh_inv.status} — "
            "revoke did not commit (flush-without-commit bug)"
        )
    finally:
        fresh_db.close()

    # Attempt registration with the revoked token — must be rejected
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "revokeme@test.com",
        "password": "Password1!",
        "first_name": "Bad",
        "last_name": "Actor",
        "token": invite_token,
    })
    assert reg_resp.status_code in (400, 403), (
        f"Expected 400/403 for revoked invite but got {reg_resp.status_code}: {reg_resp.text}"
    )

    # Confirm no user was created
    fresh_db2 = SessionLocal()
    try:
        user_row = UsersRepository(fresh_db2).get_by_email("revokeme@test.com")
        assert user_row is None, "User was created despite revoked invitation — security defect"
    finally:
        fresh_db2.close()


def test_invite_token_lookup_rejects_non_pending(clean_db: None) -> None:
    """GET /invitations/{token} must return 410 for accepted/revoked tokens."""
    from app.core.security import hash_password as _hp
    db = SessionLocal()
    try:
        owner = User(email="owner_lookup@test.com", password_hash=_hp("pw"), is_active=True)
        db.add(owner)
        db.flush()
        org = Organization(name="Lookup Org", slug="lookup-org")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, role="OWNER"))
        sess = UserSession(user_id=owner.id, session_token="lookup-owner-tok",
                           expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        db.add(sess)
        accepted_inv = Invitation(
            organization_id=org.id,
            email="accepted@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="accepted-lookup-tok",
            status="ACCEPTED",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        revoked_inv = Invitation(
            organization_id=org.id,
            email="revoked@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="revoked-lookup-tok",
            status="REVOKED",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        expired_inv = Invitation(
            organization_id=org.id,
            email="expired2@test.com",
            role="MEMBER",
            invited_by_id=owner.id,
            token="expired-lookup-tok",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add_all([accepted_inv, revoked_inv, expired_inv])
        db.commit()
    finally:
        db.close()

    # ACCEPTED → 410
    r = client.get("/api/v1/invitations/accepted-lookup-tok")
    assert r.status_code == 410, f"Expected 410 for accepted invite, got {r.status_code}"

    # REVOKED → 410
    r = client.get("/api/v1/invitations/revoked-lookup-tok")
    assert r.status_code == 410, f"Expected 410 for revoked invite, got {r.status_code}"

    # EXPIRED (still PENDING in DB but past expires_at) → 410
    r = client.get("/api/v1/invitations/expired-lookup-tok")
    assert r.status_code == 410, f"Expected 410 for expired invite, got {r.status_code}"

    # INVALID → 404
    r = client.get("/api/v1/invitations/nonexistent-tok")
    assert r.status_code == 404, f"Expected 404 for invalid token, got {r.status_code}"


def test_rate_limiter_logic() -> None:
    """check_auth_rate_limit raises 429 after max_attempts; fails open on Redis error."""
    from unittest.mock import MagicMock, patch
    import redis as redis_lib
    from fastapi import HTTPException
    from app.core.rate_limit import check_auth_rate_limit

    # Simulate Redis incr returning over-limit
    mock_client = MagicMock()
    mock_client.incr.return_value = 6  # > max_attempts=5
    with patch("app.core.rate_limit.get_redis_client", return_value=mock_client):
        try:
            check_auth_rate_limit("test-key", max_attempts=5, window_seconds=60)
            assert False, "Expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 429
            assert "Retry-After" in e.headers

    # Fail open: Redis error should not block the request
    mock_err = MagicMock()
    mock_err.incr.side_effect = redis_lib.RedisError("connection refused")
    with patch("app.core.rate_limit.get_redis_client", return_value=mock_err):
        check_auth_rate_limit("test-key-2", max_attempts=5, window_seconds=60)  # must not raise
