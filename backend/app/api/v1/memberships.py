import uuid

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_current_user, get_org_service
from app.api.v1.schemas import MemberResponse, RoleUpdate
from app.domain.entities.system import OrganizationMember, User
from app.domain.services import OrganizationService

router = APIRouter()

@router.get("/{org_id}", response_model=list[MemberResponse])
def get_members(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    org_service: OrganizationService = Depends(get_org_service),
) -> list[OrganizationMember]:
    return org_service.get_organization_members(
        org_id=org_id,
        requester_id=current_user.id,
    )

@router.put("/{org_id}/users/{user_id}", response_model=MemberResponse)
def update_member_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: RoleUpdate,
    current_user: User = Depends(get_current_user),
    org_service: OrganizationService = Depends(get_org_service),
) -> OrganizationMember:
    return org_service.update_membership_role(
        org_id=org_id,
        user_id=user_id,
        new_role=payload.role,
        updated_by_id=current_user.id,
    )

@router.delete("/{org_id}/users/{user_id}", status_code=status.HTTP_200_OK)
def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    org_service: OrganizationService = Depends(get_org_service),
) -> dict:
    org_service.remove_organization_member(
        org_id=org_id,
        user_id=user_id,
        removed_by_id=current_user.id,
    )
    return {"status": "success", "message": "Member removed successfully"}
