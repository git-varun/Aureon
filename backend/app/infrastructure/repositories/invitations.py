from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.system import Invitation


class InvitationsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, inv: Invitation) -> Invitation:
        self.session.add(inv)
        self.session.flush()
        return inv

    def get_by_id(self, inv_id: uuid.UUID) -> Invitation | None:
        stmt = select(Invitation).where(Invitation.id == inv_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_token(self, token: str) -> Invitation | None:
        stmt = select(Invitation).where(Invitation.token == token)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_pending_by_email(self, email: str) -> list[Invitation]:
        stmt = select(Invitation).where(
            (Invitation.email == email) &
            (Invitation.status == "PENDING")
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_by_org(self, org_id: uuid.UUID) -> list[Invitation]:
        stmt = select(Invitation).where(Invitation.organization_id == org_id)
        return list(self.session.execute(stmt).scalars().all())

    def update(self, inv: Invitation) -> Invitation:
        self.session.flush()
        return inv

    def delete(self, inv_id: uuid.UUID) -> bool:
        inv = self.get_by_id(inv_id)
        if inv:
            self.session.delete(inv)
            self.session.flush()
            return True
        return False
