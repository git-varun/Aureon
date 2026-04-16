"""RSS-based news provider using feedparser."""

import logging
from typing import List
from urllib.parse import quote

import feedparser

from app.modules.news.providers.base import BaseNewsProvider
from app.shared.interfaces import NewsPayload

logger = logging.getLogger(__name__)


class RSSNewsProvider(BaseNewsProvider):
    """Fetches news headlines from RSS feeds (Google Finance, Yahoo Finance)."""

    @property
    def provider_name(self) -> str:
        return "rss"

    def fetch_headlines(self, symbol: str) -> List[NewsPayload]:
        """
        Fetch news for a symbol from multiple RSS feeds.
        Returns up to 20 deduplicated NewsPayload objects.
        Never raises — exceptions are caught and partial results returned.
        """
        encoded = quote(symbol)
        urls = [
            (
                f"https://news.google.com/rss/search"
                f"?q={encoded}+stock&hl=en-IN&gl=IN&ceid=IN:en"
            ),
            (
                f"https://feeds.finance.yahoo.com/rss/2.0/headline"
                f"?s={encoded}.NS&region=US&lang=en-US"
            ),
        ]

        seen_links: set = set()
        results: List[NewsPayload] = []

        for url in urls:
            try:
                feed = feedparser.parse(url)
                for entry in feed.entries:
                    if len(results) >= 20:
                        break

                    link = getattr(entry, "link", "") or ""
                    if not link or link in seen_links:
                        continue

                    title = getattr(entry, "title", "") or ""
                    snippet = (
                        getattr(entry, "summary", "")
                        or getattr(entry, "description", "")
                        or ""
                    )

                    seen_links.add(link)
                    results.append(
                        NewsPayload(
                            title=title,
                            snippet=snippet,
                            link=link,
                            provider=self.provider_name,
                        )
                    )

            except Exception as exc:
                logger.warning(
                    "RSSNewsProvider: failed to fetch from %s for %s: %s",
                    url,
                    symbol,
                    exc,
                )

            if len(results) >= 20:
                break

        self._log_fetch(symbol, len(results))
        return results[:20]
