"""WebSocket endpoint — per-user push channel backed by Redis pub/sub."""

import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.core.config import settings

logger = logging.getLogger("ws.router")

ws_router = APIRouter()


def _decode_token(token: str) -> int:
    """Decode JWT from WS query param and return user_id. Raises HTTPException on failure."""
    import jwt
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return int(payload["sub"])
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))


@ws_router.websocket("/ws/user/{user_id}")
async def user_websocket(websocket: WebSocket, user_id: int, token: str = ""):
    """Forward Redis pub/sub messages on channel `backfill:{user_id}` to the client."""
    # Verify the token belongs to the user_id being subscribed to
    if token:
        try:
            claimed_id = _decode_token(token)
            if claimed_id != user_id:
                await websocket.close(code=1008)
                return
        except Exception:
            await websocket.close(code=1008)
            return

    await websocket.accept()

    try:
        r = aioredis.from_url(settings.redis_url)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"backfill:{user_id}")
    except Exception as exc:
        logger.warning("ws: redis unavailable for user %d: %s", user_id, exc)
        await websocket.close(code=1011, reason="upstream unavailable")
        return
    logger.info("ws: user %d subscribed to backfill channel", user_id)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                await websocket.send_text(data)
    except WebSocketDisconnect:
        logger.info("ws: user %d disconnected", user_id)
    except Exception as exc:
        logger.warning("ws: user %d error: %s", user_id, exc)
    finally:
        try:
            await pubsub.unsubscribe(f"backfill:{user_id}")
            await r.aclose()
        except Exception:
            pass
