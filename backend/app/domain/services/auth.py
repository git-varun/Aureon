from app.domain.services.base import BaseService
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.core.exceptions import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.google_auth import verify_google_token
from app.core.security import hash_password, verify_password
from app.domain.entities.system import OrganizationMember, User, UserSession
from app.infrastructure.repositories import (
    InvitationsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
    SessionsRepository,
    UsersRepository,
)


class AuthService(BaseService):
    def __init__(
        self,
        users_repo: UsersRepository,
        sessions_repo: SessionsRepository,
        invitations_repo: InvitationsRepository,
        orgs_repo: OrganizationsRepository,
        members_repo: OrganizationMembersRepository,
    ):
        self.users_repo = users_repo
        self.sessions_repo = sessions_repo
        self.invitations_repo = invitations_repo
        self.orgs_repo = orgs_repo
        self.members_repo = members_repo

    def register_with_invite(
        self,
        email: str,
        password: str,
        first_name: str | None,
        last_name: str | None,
        invite_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[UserSession, User]:
        # 1. Retrieve and validate invitation
        inv = self.invitations_repo.get_by_token(invite_token)
        if not inv:
            raise NotFoundError("Invitation token not found")
        
        if inv.status != "PENDING":
            raise ValidationError(f"Invitation has already been {inv.status.lower()}")
        
        if inv.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            inv.status = "EXPIRED"
            self.invitations_repo.update(inv)
            self.users_repo.session.commit()
            raise ValidationError("Invitation has expired")

        if inv.email.lower() != email.lower():
            raise ValidationError("Email does not match the invitation email")

        # 2. Check if user already exists
        existing_user = self.users_repo.get_by_email(email)
        if existing_user:
            raise ConflictError("User with this email already exists")

        # 3. Create user
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            first_name=first_name,
            last_name=last_name,
            is_active=True,
            is_verified=True,
        )
        self.users_repo.create(user)

        # 4. Mark invitation accepted
        inv.status = "ACCEPTED"
        self.invitations_repo.update(inv)

        # 5. Create membership in organization
        member = OrganizationMember(
            organization_id=inv.organization_id,
            user_id=user.id,
            role=inv.role,
        )
        self.members_repo.create(member)

        # 6. Create session
        session = self.create_session_in_tx(user.id, ip_address, user_agent)
        
        # Commit transaction
        self.users_repo.session.commit()
        self.users_repo.session.refresh(user)
        self.users_repo.session.refresh(session)
        
        return session, user

    def login(
        self,
        email: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> UserSession:
        user = self.users_repo.get_by_email(email.lower())
        if not user or not user.password_hash or not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AuthenticationError("Account is inactive")

        # Create session and commit
        session = self.create_session_in_tx(user.id, ip_address, user_agent)
        self.sessions_repo.session.commit()
        self.sessions_repo.session.refresh(session)
        return session

    def login_google(
        self,
        id_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[UserSession, User]:
        profile = verify_google_token(id_token)
        email = profile["email"].lower()
        google_id = profile["google_id"]

        # 1. Look for user by google_id, then by email
        user = self.users_repo.get_by_google_id(google_id)
        if not user:
            user = self.users_repo.get_by_email(email)
            if user:
                # Link google_id to existing account
                user.google_id = google_id
                if not user.profile_picture and profile.get("picture"):
                    user.profile_picture = profile["picture"]
                self.users_repo.update(user)
            else:
                # This is a registration attempt via Google OAuth. Check invitation since it's invite-only.
                pending_invs = self.invitations_repo.get_pending_by_email(email)
                if not pending_invs:
                    raise ValidationError("Registration is invite-only. No pending invitation found for this email.")
                
                # Use the first pending invitation
                inv = pending_invs[0]
                if inv.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
                    inv.status = "EXPIRED"
                    self.invitations_repo.update(inv)
                    self.users_repo.session.commit()
                    raise ValidationError("Invitation has expired")

                # Create User
                name_parts = profile.get("name", "").split(" ", 1)
                user = User(
                    email=email,
                    google_id=google_id,
                    first_name=name_parts[0] if name_parts else "",
                    last_name=name_parts[1] if len(name_parts) > 1 else "",
                    profile_picture=profile.get("picture"),
                    is_active=True,
                    is_verified=True,
                )
                self.users_repo.create(user)

                # Consume invite
                inv.status = "ACCEPTED"
                self.invitations_repo.update(inv)

                # Join organization
                member = OrganizationMember(
                    organization_id=inv.organization_id,
                    user_id=user.id,
                    role=inv.role,
                )
                self.members_repo.create(member)

        if not user.is_active:
            raise AuthenticationError("Account is inactive")

        session = self.create_session_in_tx(user.id, ip_address, user_agent)
        
        self.users_repo.session.commit()
        self.users_repo.session.refresh(user)
        self.users_repo.session.refresh(session)
        
        return session, user

    def create_session_in_tx(
        self,
        user_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> UserSession:
        # Purge expired sessions for this user
        self.sessions_repo.delete_expired(user_id)

        # Create new session
        token = secrets.token_urlsafe(48)
        # Session expires in 30 days
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        
        session = UserSession(
            user_id=user_id,
            session_token=token,
            expires_at=expires,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return self.sessions_repo.create(session)

    def logout(self, session_token: str) -> None:
        self.sessions_repo.delete_by_token(session_token)
        self.sessions_repo.session.commit()

    def logout_all(self, user_id: uuid.UUID) -> None:
        self.sessions_repo.delete_all_for_user(user_id)
        self.sessions_repo.session.commit()

    def deactivate_account(self, user: User) -> None:
        user.is_active = False
        self.users_repo.update(user)
        self.users_repo.session.commit()

    def update_profile(
        self,
        user: User,
        first_name: str | None = None,
        last_name: str | None = None,
        profile_picture: str | None = None,
    ) -> User:
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        if profile_picture is not None:
            user.profile_picture = profile_picture
        self.users_repo.update(user)
        self.users_repo.session.commit()
        self.users_repo.session.refresh(user)
        return user

    def change_password(self, user: User, current_password: str, new_password: str) -> None:
        if not user.password_hash or not verify_password(current_password, user.password_hash):
            raise AuthenticationError("Invalid current password")
        user.password_hash = hash_password(new_password)
        self.users_repo.update(user)
        self.users_repo.session.commit()
