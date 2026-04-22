"""News services: multi-provider orchestration and DB persistence."""

import logging
from datetime import datetime, timezone
from typing import Dict, List

from sqlalchemy.orm import Session

from app.modules.news.models import News
from app.modules.news.providers.registry import get_registry

logger = logging.getLogger("news.service")


class NewsService:
    """Fetch news from multiple providers and persist to News table."""

    def __init__(self, session: Session):
        self.session = session
        self.registry = get_registry(session)
        logger.debug(
            "NewsService initialized with providers: %s",
            self.registry.list_enabled(),
        )

    def fetch_and_store(self, symbol: str, db: Session, is_crypto: bool = False) -> int:
        """
        Fetch headlines for *symbol* from all enabled providers, deduplicate by URL,
        and persist new articles to database.

        Args:
            symbol: Effective query symbol (base coin for crypto, e.g. "BTC").
            is_crypto: When True, providers receive the crypto hint so they can
                       adjust query format/URL (e.g. skip equity-only endpoints).

        Returns count of newly inserted records.
        """
        logger.info("fetch_and_store: symbol=%s is_crypto=%s", symbol, is_crypto)

        providers = self.registry.get_providers()
        if not providers:
            logger.warning("fetch_and_store: no providers available")
            return 0

        # Fetch from all providers, deduplicate by URL in-memory
        seen_urls = set()
        all_payloads = []

        for provider in providers:
            try:
                logger.debug(
                    "fetch_and_store: symbol=%s fetching from %s",
                    symbol,
                    provider.provider_name,
                )
                payloads = provider.fetch_headlines(symbol, is_crypto=is_crypto)

                for payload in payloads:
                    if payload.link and payload.link not in seen_urls:
                        seen_urls.add(payload.link)
                        all_payloads.append(payload)

                logger.debug(
                    "fetch_and_store: symbol=%s provider=%s got %d headlines (unique=%d)",
                    symbol,
                    provider.provider_name,
                    len(payloads),
                    sum(1 for p in payloads if p.link),
                )

            except Exception as exc:
                logger.error(
                    "fetch_and_store: symbol=%s provider=%s failed: %s",
                    symbol,
                    provider.provider_name,
                    exc,
                )

        if not all_payloads:
            logger.info("fetch_and_store: symbol=%s — no headlines from any provider", symbol)
            return 0

        logger.debug(
            "fetch_and_store: symbol=%s — %d unique headlines total",
            symbol,
            len(all_payloads),
        )

        # Check for duplicates in database
        new_count = 0
        dupe_count = 0

        for payload in all_payloads:
            url = payload.link
            if not url:
                continue

            # Check if URL already exists in DB
            exists = db.query(News).filter(News.url == url).first()
            if exists:
                logger.debug(
                    "fetch_and_store: symbol=%s URL already in DB (id=%s) — skip",
                    symbol,
                    exists.id,
                )
                dupe_count += 1
                continue

            # Create new article
            article = News(
                title=payload.title,
                source=payload.provider,
                url=url,
                summary=payload.snippet,
                symbols=symbol,
                published_at=datetime.now(timezone.utc),
            )
            db.add(article)
            new_count += 1
            logger.debug(
                "fetch_and_store: symbol=%s queuing new article (provider=%s) title=%.60s",
                symbol,
                payload.provider,
                payload.title,
            )

        if new_count:
            try:
                db.commit()
                logger.info(
                    "fetch_and_store: symbol=%s committed %d new / %d dupes skipped",
                    symbol,
                    new_count,
                    dupe_count,
                )
            except Exception as exc:
                db.rollback()
                logger.error(
                    "fetch_and_store: symbol=%s commit failed — rolled back: %s",
                    symbol,
                    exc,
                )
                return 0
        else:
            logger.info(
                "fetch_and_store: symbol=%s — no new articles (all %d were dupes)",
                symbol,
                dupe_count,
            )

        return new_count

    def get_recent_news(self, symbol: str, db: Session, limit: int = 10) -> List[type[News]]:
        """Return recent News ORM objects for *symbol*, newest first."""
        logger.debug("get_recent_news: symbol=%s limit=%d", symbol, limit)
        rows = (
            db.query(News)
            .filter(News.symbols.contains(symbol))
            .order_by(News.published_at.desc())
            .limit(limit)
            .all()
        )
        logger.info("get_recent_news: symbol=%s → %d records", symbol, len(rows))
        return rows

    def get_all_recent(self, db: Session, limit: int = 30) -> Dict:
        """Return latest news grouped by symbol."""
        logger.debug("get_all_recent: limit=%d", limit)
        rows = (
            db.query(News)
            .order_by(News.published_at.desc())
            .limit(limit)
            .all()
        )
        logger.debug("get_all_recent: fetched %d raw rows", len(rows))

        grouped: Dict[str, list] = {}
        for row in rows:
            first_symbol = (row.symbols or "unknown").split(",")[0].strip()
            grouped.setdefault(first_symbol, [])
            grouped[first_symbol].append(
                {
                    "id": row.id,
                    "title": row.title,
                    "summary": row.summary,
                    "source": row.source,
                    "url": row.url,
                    "symbols": row.symbols,
                    "published_at": (
                        row.published_at.isoformat() if row.published_at else None
                    ),
                    "sentiment_score": row.sentiment_score,
                }
            )

        logger.info(
            "get_all_recent: limit=%d → %d symbols with news", limit, len(grouped)
        )
        return grouped
