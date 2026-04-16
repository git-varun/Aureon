"""News API routes."""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_session
from app.modules.news.services import NewsService

router = APIRouter(prefix="/api/news", tags=["news"])

_news_service = NewsService()


@router.get("/health")
def news_health():
    """Health check for news module."""
    return {"module": "news", "status": "ok"}


@router.get("")
def get_all_news(db: Session = Depends(get_session)) -> Dict[str, Any]:
    """
    Return latest news articles grouped by symbol.

    Returns dict with symbol keys and list of article dicts as values.
    """
    return _news_service.get_all_recent(db, limit=30)


@router.get("/{symbol}")
def get_news_for_symbol(
    symbol: str, db: Session = Depends(get_session)
) -> List[Dict[str, Any]]:
    """
    Return recent news articles for a specific symbol.

    Args:
        symbol: Stock ticker symbol (e.g., 'AAPL', 'TCS')

    Returns:
        List of article dicts sorted by published_at (newest first)
    """
    articles = _news_service.get_recent_news(symbol, db, limit=10)
    return [
        {
            "id": a.id,
            "title": a.title,
            "summary": a.summary,
            "source": a.source,
            "url": a.url,
            "symbols": a.symbols,
            "published_at": a.published_at.isoformat() if a.published_at else None,
            "sentiment_score": a.sentiment_score,
        }
        for a in articles
    ]
