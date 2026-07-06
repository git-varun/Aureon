from app.infrastructure.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.entities.system import User


class UsersRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, user: User) -> User:
        self.session.add(user)
        self.session.flush()
        return user

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.session.execute(stmt).scalar_one_or_none()

    def update(self, user: User) -> User:
        self.session.flush()
        return user

    def delete(self, user_id: uuid.UUID) -> bool:
        user = self.get_by_id(user_id)
        if user:
            self.session.delete(user)
            self.session.flush()
            return True
        return False
