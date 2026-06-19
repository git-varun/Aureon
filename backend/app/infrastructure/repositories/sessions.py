from app.infrastructure.repositories.base import BaseRepository
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.entities.system import UserSession


class SessionsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def create(self, user_session: UserSession) -> UserSession:
        self.session.add(user_session)
        self.session.flush()
        return user_session

    def get_by_token(self, token: str) -> UserSession | None:
        stmt = select(UserSession).where(UserSession.session_token == token)
        return self.session.execute(stmt).scalar_one_or_none()

    def delete_by_token(self, token: str) -> bool:
        stmt = delete(UserSession).where(UserSession.session_token == token)
        result = self.session.execute(stmt)
        self.session.flush()
        return (result.rowcount or 0) > 0

    def delete_expired(self, user_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        stmt = delete(UserSession).where(
            (UserSession.user_id == user_id) &
            (UserSession.expires_at < now)
        )
        self.session.execute(stmt)
        self.session.flush()

    def delete_all_for_user(self, user_id: uuid.UUID) -> None:
        stmt = delete(UserSession).where(UserSession.user_id == user_id)
        self.session.execute(stmt)
        self.session.flush()
