import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    get_current_user,
    get_invitations_repo,
    get_members_repo,
    get_org_service,
    get_orgs_repo,
)
from app.api.v1.schemas import InvitationCreate, InvitationResponse
from app.domain.entities.system import Invitation, User
from app.domain.services import OrganizationService
from app.infrastructure.repositories import (
    InvitationsRepository,
    OrganizationMembersRepository,
    OrganizationsRepository,
)

router = APIRouter()

@router.post("", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    payload: InvitationCreate,
    org_id: uuid.UUID,  # Pass via query param or we can put it in InvitationCreate request body
    current_user: User = Depends(get_current_user),
    org_service: OrganizationService = Depends(get_org_service),
) -> Invitation:
    return org_service.create_invitation(
        org_id=org_id,
        email=payload.email,
        role=payload.role,
        invited_by_id=current_user.id,
    )

@router.get("/{token}")
def get_invitation_by_token(
    token: str,
    inv_repo: InvitationsRepository = Depends(get_invitations_repo),
    org_repo: OrganizationsRepository = Depends(get_orgs_repo),
) -> dict:
    inv = inv_repo.get_by_token(token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
        
    org = org_repo.get_by_id(inv.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "id": str(inv.id),
        "email": inv.email,
        "role": inv.role,
        "organization_id": str(inv.organization_id),
        "organization_name": org.name,
        "organization_slug": org.slug,
        "status": inv.status,
        "expires_at": inv.expires_at,
    }

@router.delete("/{inv_id}", status_code=status.HTTP_200_OK)
def revoke_invitation(
    inv_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    inv_repo: InvitationsRepository = Depends(get_invitations_repo),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
) -> dict:
    inv = inv_repo.get_by_id(inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
        
    # Enforce role: requester must be OWNER or ADMIN of the organization
    membership = members_repo.get_by_org_and_user(inv.organization_id, current_user.id)
    if not membership or membership.role not in ("OWNER", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Only organization owners and admins can revoke invitations",
        )
        
    inv.status = "REVOKED"
    inv_repo.update(inv)
    return {"status": "success", "message": "Invitation revoked successfully"}
