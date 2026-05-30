from typing import Any, Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_session as _get_session
from app.core.cache import get_cache as _get_cache

_bearer = HTTPBearer(auto_error=False)


def get_session() -> Generator[Any, None, None]:
    """Dependency: get DB session."""
    yield from _get_session()


def get_cache():
    """Dependency: get cache manager."""
    return _get_cache()


def get_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
        db: Session = Depends(get_session),
):
    """Auth guard — returns the User ORM object for a valid JWT; returns None otherwise."""
    from app.core.config import settings
    from app.modules.users.models import User
    import jwt
    if not credentials:
        return None
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
    """Strict auth guard — raises 401 if user is not authenticated."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user
