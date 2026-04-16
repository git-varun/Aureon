from fastapi import APIRouter

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/health")
def users_health():
    return {"module": "users", "status": "ok"}
