"""FastAPI dependency injection factories."""

from typing import Any, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_session as _get_session
from app.core.cache import get_cache as _get_cache

_bearer = HTTPBearer(auto_error=True)


def get_session() -> Generator[Any, None, None]:
    """Dependency: get DB session."""
    yield from _get_session()


def get_cache():
    """Dependency: get cache manager."""
    return _get_cache()


def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
        db: Session = Depends(get_session),
):
    """Auth guard — returns the User ORM object for a valid JWT; raises 401 otherwise."""
    from app.core.config import settings
    from app.modules.users.models import User
    import jwt
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter_by(id=user_id, is_active=True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_auth(user=Depends(get_current_user)):
    """Strict auth guard — alias for get_current_user; kept for named clarity at call sites."""
    return user
