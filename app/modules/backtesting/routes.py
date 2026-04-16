from fastapi import APIRouter

router = APIRouter(prefix="/api/backtesting", tags=["backtesting"])


@router.get("/health")
def backtesting_health():
    return {"module": "backtesting", "status": "ok"}
