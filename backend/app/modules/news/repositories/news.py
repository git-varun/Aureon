from app.core.repositories.base import BaseRepository
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.news.entities.news import News, NewsAsset


class NewsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get_news(self, news_id: int) -> News | None:
        stmt = select(News).where(News.id == news_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_news_by_url(self, url: str) -> News | None:
        stmt = select(News).where(News.url == url)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_recent_news(self, symbol: str | None = None, limit: int = 10) -> list[News]:
        stmt = select(News)
        if symbol:
            stmt = stmt.where(News.symbols.like(f"%{symbol}%"))
        stmt = stmt.order_by(News.published_at.desc()).limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def list_all_recent(self, limit: int = 30) -> list[News]:
        stmt = select(News).order_by(News.published_at.desc()).limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def list_all(self) -> list[News]:
        return list(self.session.execute(select(News)).scalars().all())

    def save_news(self, news: News) -> News:
        self.session.add(news)
        self.session.flush()
        return news

    def list_sentiment_for_asset(
        self, asset_id: uuid.UUID, since: datetime
    ) -> list[tuple[float, datetime]]:
        stmt = (
            select(News.sentiment_score, News.published_at)
            .join(NewsAsset, NewsAsset.news_id == News.id)
            .where(
                NewsAsset.asset_id == asset_id,
                News.sentiment_score.is_not(None),
                News.published_at >= since,
            )
        )
        return [(float(score), published_at) for score, published_at in self.session.execute(stmt).all()]

    def get_news_asset(self, news_id: int, asset_id: uuid.UUID) -> NewsAsset | None:
        stmt = select(NewsAsset).where(NewsAsset.news_id == news_id, NewsAsset.asset_id == asset_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def save_news_asset(self, na: NewsAsset) -> NewsAsset:
        self.session.add(na)
        self.session.flush()
        return na
