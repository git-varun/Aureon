from fastapi import APIRouter, Depends, status

from app.api.dependencies import (
    get_current_user,
    get_members_repo,
    get_org_service,
    get_orgs_repo,
)
from app.api.v1.schemas import OrganizationCreate, OrganizationResponse
from app.domain.entities.system import Organization, User
from app.domain.services import OrganizationService
from app.infrastructure.repositories import (
    OrganizationMembersRepository,
    OrganizationsRepository,
)

router = APIRouter()

@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_org(
    payload: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    org_service: OrganizationService = Depends(get_org_service),
) -> Organization:
    return org_service.create_organization(
        name=payload.name,
        slug=payload.slug,
        owner_id=current_user.id,
    )

@router.get("", response_model=list[OrganizationResponse])
def list_orgs(
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    orgs_repo: OrganizationsRepository = Depends(get_orgs_repo),
) -> list[Organization]:
    memberships = members_repo.get_memberships_by_user(current_user.id)
    org_ids = [m.organization_id for m in memberships]
    orgs = []
    for org_id in org_ids:
        org = orgs_repo.get_by_id(org_id)
        if org:
            orgs.append(org)
    return orgs

