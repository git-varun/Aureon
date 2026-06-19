from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.system import OrganizationMember


class OrganizationMembersRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, member: OrganizationMember) -> OrganizationMember:
        self.session.add(member)
        self.session.flush()
        return member

    def get_by_id(self, member_id: uuid.UUID) -> OrganizationMember | None:
        stmt = select(OrganizationMember).where(OrganizationMember.id == member_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_org_and_user(self, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMember | None:
        stmt = select(OrganizationMember).where(
            (OrganizationMember.organization_id == org_id) &
            (OrganizationMember.user_id == user_id)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_members_by_org(self, org_id: uuid.UUID) -> list[OrganizationMember]:
        stmt = select(OrganizationMember).where(OrganizationMember.organization_id == org_id)
        return list(self.session.execute(stmt).scalars().all())

    def get_memberships_by_user(self, user_id: uuid.UUID) -> list[OrganizationMember]:
        stmt = select(OrganizationMember).where(OrganizationMember.user_id == user_id)
        return list(self.session.execute(stmt).scalars().all())

    def update(self, member: OrganizationMember) -> OrganizationMember:
        self.session.flush()
        return member

    def delete(self, member_id: uuid.UUID) -> bool:
        member = self.get_by_id(member_id)
        if member:
            self.session.delete(member)
            self.session.flush()
            return True
        return False
