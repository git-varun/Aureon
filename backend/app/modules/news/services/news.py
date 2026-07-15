from app.core.services.base import BaseService
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.core.exceptions import ProviderError
from app.core.logging import logger
from app.core.providers.capabilities import Capability
from app.core.providers.factory import ProviderFactory
from app.core.providers.registry import registry
from app.core.providers.retry import with_retry
from app.modules.market.entities.market import LatestQuote
from app.modules.news.entities.news import News, NewsAsset
from app.core.services.config import ConfigService
from app.core.repositories.config import ConfigRepository
from app.modules.news.repositories.news import NewsRepository

# VADER's compound score is already on News.sentiment_score's documented
# -1..1 scale, so no conversion is needed at this write point.
_sentiment_analyzer = SentimentIntensityAnalyzer()


@with_retry()
def _get_news_with_retry(provider, symbol: str):
    return provider.get_news(symbol)


class NewsService(BaseService):
    def __init__(self, repo: NewsRepository):
        self.repo = repo
        cfg_repo = ConfigRepository(repo.session)
        cfg_svc = ConfigService(cfg_repo)
        self.provider_factory = ProviderFactory(cfg_svc)

    def fetch_and_store(self, symbol: str, is_crypto: bool = False) -> int:
        symbol = symbol.upper().strip()
        logger.info(f"fetch_and_store news: symbol={symbol} is_crypto={is_crypto}")

        all_payloads = []
        seen_urls = set()

        news_providers = registry.list(Capability.NEWS)
        attempted = 0
        failed_providers = []
        for provider in news_providers:
            name = provider.provider_name
            live = self.provider_factory.get(name, required=False)
            if live is None:
                continue
            attempted += 1
            try:
                headlines = _get_news_with_retry(live, symbol)
            except Exception as e:
                logger.error(f"Failed to fetch news from provider {name} for {symbol}: {e}")
                failed_providers.append(name)
                continue
            for hl in headlines:
                if hl.url and hl.url not in seen_urls:
                    seen_urls.add(hl.url)
                    all_payloads.append(hl)

        # Every live provider genuinely errored (not merely returned zero
        # articles) — surface this loudly instead of returning 0, which would
        # be indistinguishable from a genuine "no news today".
        if attempted > 0 and len(failed_providers) == attempted:
            raise ProviderError(
                f"All {attempted} news provider(s) failed for symbol={symbol}: {', '.join(failed_providers)}"
            )

        if not all_payloads:
            return 0

        new_count = 0
        for payload in all_payloads:
            # Check if URL exists
            exists = self.repo.get_news_by_url(payload.url)
            if exists:
                continue

            article = News(
                title=payload.title,
                source=payload.provider,
                url=payload.url,
                summary=payload.title,  # default snippet/summary to title
                symbols=symbol,
                published_at=payload.published_at or datetime.now(timezone.utc),
                sentiment_score=_sentiment_analyzer.polarity_scores(payload.title)["compound"],
            )
            self.repo.save_news(article)
            new_count += 1

        if new_count > 0:
            self.repo.session.commit()
            self._link_news_assets(symbol)
            self.repo.session.commit()

        return new_count

    def get_recent_news(self, symbol: str, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.repo.list_recent_news(symbol, limit)
        return [
            {
                "id": r.id,
                "title": r.title,
                "summary": r.summary,
                "source": r.source,
                "url": r.url,
                "symbols": r.symbols,
                "published_at": r.published_at.isoformat() if r.published_at else None,
                "sentiment_score": r.sentiment_score
            }
            for r in rows
        ]

    def get_all_recent(self, limit: int = 30) -> dict[str, list[dict[str, Any]]]:
        rows = self.repo.list_all_recent(limit)
        grouped = {}
        for r in rows:
            sym = (r.symbols or "UNKNOWN").split(",")[0].strip()
            grouped.setdefault(sym, [])
            grouped[sym].append({
                "id": r.id,
                "title": r.title,
                "summary": r.summary,
                "source": r.source,
                "url": r.url,
                "symbols": r.symbols,
                "published_at": r.published_at.isoformat() if r.published_at else None,
                "sentiment_score": r.sentiment_score
            })
        return grouped

    def _link_news_assets(self, symbol: str) -> None:
        stmt = select(LatestQuote).where(LatestQuote.symbol == symbol)
        quote = self.repo.session.execute(stmt).scalar_one_or_none()
        if not quote or not quote.asset_id:
            return

        recent_news = self.repo.list_recent_news(symbol, 50)
        for article in recent_news:
            exists = self.repo.get_news_asset(article.id, quote.asset_id)
            if not exists:
                na = NewsAsset(news_id=article.id, asset_id=quote.asset_id)
                self.repo.save_news_asset(na)
