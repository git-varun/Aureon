from app.domain.services.base import BaseService
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.domain.entities.system import Invitation, Organization, OrganizationMember
from app.infrastructure.repositories import (
    InvitationsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
    UsersRepository,
)


class OrganizationService(BaseService):
    def __init__(
        self,
        orgs_repo: OrganizationsRepository,
        members_repo: OrganizationMembersRepository,
        invitations_repo: InvitationsRepository,
        users_repo: UsersRepository,
    ):
        self.orgs_repo = orgs_repo
        self.members_repo = members_repo
        self.invitations_repo = invitations_repo
        self.users_repo = users_repo

    def create_organization(self, name: str, slug: str, owner_id: uuid.UUID) -> Organization:
        # Check if slug exists
        existing = self.orgs_repo.get_by_slug(slug)
        if existing:
            raise ConflictError("Organization slug is already taken")

        # Create organization
        org = Organization(name=name, slug=slug)
        self.orgs_repo.create(org)

        # Make the creator the OWNER
        member = OrganizationMember(
            organization_id=org.id,
            user_id=owner_id,
            role="OWNER",
        )
        self.members_repo.create(member)

        self.orgs_repo.session.commit()
        self.orgs_repo.session.refresh(org)
        return org

    def create_invitation(
        self,
        org_id: uuid.UUID,
        email: str,
        role: str,
        invited_by_id: uuid.UUID,
    ) -> Invitation:
        # 1. Enforce roles: Must be OWNER or ADMIN of the org
        inviter_membership = self.members_repo.get_by_org_and_user(org_id, invited_by_id)
        if not inviter_membership or inviter_membership.role not in ("OWNER", "ADMIN"):
            raise PermissionDeniedError("Only organization owners and admins can invite members")

        # 2. Check if user is already a member
        user = self.users_repo.get_by_email(email.lower())
        if user:
            existing_member = self.members_repo.get_by_org_and_user(org_id, user.id)
            if existing_member:
                raise ConflictError("User is already a member of this organization")

        # 3. Check role validation
        valid_roles = ("OWNER", "ADMIN", "MEMBER", "READ_ONLY")
        if role not in valid_roles:
            raise ValidationError(f"Invalid role: {role}")

        # ADMIN cannot invite OWNER
        if inviter_membership.role == "ADMIN" and role == "OWNER":
            raise PermissionDeniedError("Admins cannot invite organization owners")

        # 4. Invalidate any existing pending invitations for this email in this org
        # (clean up old duplicates)
        existing_invs = self.invitations_repo.get_pending_by_email(email.lower())
        for existing_inv in existing_invs:
            if existing_inv.organization_id == org_id:
                existing_inv.status = "REVOKED"
                self.invitations_repo.update(existing_inv)

        # 5. Create new invitation
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)

        inv = Invitation(
            organization_id=org_id,
            email=email.lower(),
            role=role,
            invited_by_id=invited_by_id,
            token=token,
            status="PENDING",
            expires_at=expires_at,
        )
        self.invitations_repo.create(inv)
        
        self.invitations_repo.session.commit()
        self.invitations_repo.session.refresh(inv)
        return inv

    def get_organization_members(self, org_id: uuid.UUID, requester_id: uuid.UUID) -> list[OrganizationMember]:
        # Enforce requester is a member of the organization
        req_membership = self.members_repo.get_by_org_and_user(org_id, requester_id)
        if not req_membership:
            raise PermissionDeniedError("You are not a member of this organization")

        return self.members_repo.get_members_by_org(org_id)

    def update_membership_role(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        new_role: str,
        updated_by_id: uuid.UUID,
    ) -> OrganizationMember:
        valid_roles = ("OWNER", "ADMIN", "MEMBER", "READ_ONLY")
        if new_role not in valid_roles:
            raise ValidationError(f"Invalid role: {new_role}")

        # 1. Get requester membership
        req_membership = self.members_repo.get_by_org_and_user(org_id, updated_by_id)
        if not req_membership or req_membership.role not in ("OWNER", "ADMIN"):
            raise PermissionDeniedError("Only owners and admins can modify membership roles")

        # 2. Get target membership
        target_membership = self.members_repo.get_by_org_and_user(org_id, user_id)
        if not target_membership:
            raise NotFoundError("Membership record not found")

        # 3. Role validation rules:
        # - Only OWNER can demote/promote OWNER, or create new OWNER
        if target_membership.role == "OWNER" and req_membership.role != "OWNER":
            raise PermissionDeniedError("Only organization owners can modify owner memberships")
        
        if new_role == "OWNER" and req_membership.role != "OWNER":
            raise PermissionDeniedError("Only organization owners can promote members to owner")

        # - ADMIN cannot modify another ADMIN or OWNER
        if req_membership.role == "ADMIN" and target_membership.role in ("ADMIN", "OWNER"):
            raise PermissionDeniedError("Admins cannot modify owner or other admin memberships")

        # 4. Apply role change
        target_membership.role = new_role
        self.members_repo.update(target_membership)
        
        self.members_repo.session.commit()
        self.members_repo.session.refresh(target_membership)
        return target_membership

    def remove_organization_member(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        removed_by_id: uuid.UUID,
    ) -> None:
        # Allow self-removal (leaving organization)
        is_self_removal = (user_id == removed_by_id)

        target_membership = self.members_repo.get_by_org_and_user(org_id, user_id)
        if not target_membership:
            raise NotFoundError("Membership record not found")

        if not is_self_removal:
            # Get requester membership
            req_membership = self.members_repo.get_by_org_and_user(org_id, removed_by_id)
            if not req_membership or req_membership.role not in ("OWNER", "ADMIN"):
                raise PermissionDeniedError("Only owners and admins can remove organization members")

            # Role validation rules:
            # - Only OWNER can remove OWNER
            if target_membership.role == "OWNER" and req_membership.role != "OWNER":
                raise PermissionDeniedError("Only organization owners can remove other owners")
            
            # - ADMIN cannot remove another ADMIN or OWNER
            if req_membership.role == "ADMIN" and target_membership.role in ("ADMIN", "OWNER"):
                raise PermissionDeniedError("Admins cannot remove owners or other admins")

        # If removing the last OWNER, raise ValidationError
        if target_membership.role == "OWNER":
            all_members = self.members_repo.get_members_by_org(org_id)
            owners = [m for m in all_members if m.role == "OWNER"]
            if len(owners) <= 1:
                raise ValidationError("Cannot remove the last organization owner. Promote another member to owner first.")

        self.members_repo.delete(target_membership.id)
        self.members_repo.session.commit()
