from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from app.api.dependencies import get_news_service
from app.modules.news.services.news import NewsService

router = APIRouter(prefix="/news", tags=["news"])

@router.get("/health")
def news_health():
    return {"module": "news", "status": "ok"}

@router.get("")
def get_all_news(
    service: NewsService = Depends(get_news_service)
) -> Dict[str, Any]:
    return service.get_all_recent(limit=30)

@router.get("/{symbol}")
def get_news_for_symbol(
    symbol: str,
    service: NewsService = Depends(get_news_service)
) -> List[Dict[str, Any]]:
    return service.get_recent_news(symbol, limit=10)
