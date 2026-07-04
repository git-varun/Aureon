from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.system import Organization


class OrganizationsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, org: Organization) -> Organization:
        self.session.add(org)
        self.session.flush()
        return org

    def get_by_id(self, org_id: uuid.UUID) -> Organization | None:
        stmt = select(Organization).where(Organization.id == org_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_slug(self, slug: str) -> Organization | None:
        stmt = select(Organization).where(Organization.slug == slug)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_all(self) -> list[Organization]:
        return list(self.session.execute(select(Organization)).scalars().all())

    def update(self, org: Organization) -> Organization:
        self.session.flush()
        return org

    def delete(self, org_id: uuid.UUID) -> bool:
        org = self.get_by_id(org_id)
        if org:
            self.session.delete(org)
            self.session.flush()
            return True
        return False
