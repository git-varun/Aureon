"""Users services."""
import logging

from sqlalchemy.orm import Session
from app.modules.users.models import User
from app.shared.exceptions import NotFoundError
from typing import Optional

logger = logging.getLogger("users.service")


class UserService:
    def __init__(self, db: Session):
        self.db = db
        logger.debug("UserService initialised with session id=%s", id(db))

    def get_user_by_id(self, user_id: int) -> type[User]:
        logger.debug("get_user_by_id: user_id=%s", user_id)
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.warning("get_user_by_id: user_id=%s not found", user_id)
            raise NotFoundError(f"User with id {user_id} not found")
        logger.debug("get_user_by_id: user_id=%s found email=%s", user_id, user.email)
        return user

    def get_user_by_email(self, email: str) -> type[User] | None:
        logger.debug("get_user_by_email: email=%s", email)
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            logger.debug("get_user_by_email: email=%s found id=%s", email, user.id)
        else:
            logger.debug("get_user_by_email: email=%s not found", email)
        return user

    def create_user(self, email: str, password_hash: str, **kwargs) -> User:
        logger.info("create_user: email=%s extra_fields=%s", email, list(kwargs.keys()))
        user = User(email=email, password_hash=password_hash, **kwargs)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        logger.info("create_user: committed id=%s email=%s", user.id, email)
        return user

    def update_user(self, user_id: int, **updates) -> type[User]:
        logger.info("update_user: user_id=%s fields=%s", user_id, list(updates.keys()))
        user = self.get_user_by_id(user_id)
        for key, value in updates.items():
            if hasattr(user, key):
                # Never log the actual value of sensitive fields
                display = "***" if key in ("password_hash", "password", "token") else repr(value)
                logger.debug("update_user: user_id=%s field=%s → %s", user_id, key, display)
                setattr(user, key, value)
        self.db.commit()
        self.db.refresh(user)
        logger.info("update_user: committed user_id=%s", user_id)
        return user

    def delete_user(self, user_id: int) -> None:
        logger.info("delete_user: user_id=%s", user_id)
        user = self.get_user_by_id(user_id)
        self.db.delete(user)
        self.db.commit()
        logger.info("delete_user: user_id=%s deleted", user_id)
