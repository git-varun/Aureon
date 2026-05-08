import logging
from typing import Dict, List
from datetime import datetime, timedelta

from app.core.context_cache import smart_cache, TTL_QUANT_MATH


class NewsEngine:
    """Processes and aggregates sentiment from provided news articles (pure computation, no DB calls)."""

    def __init__(self):
        self.logger = logging.getLogger("NewsEngine")

    def aggregate_sentiment(self, symbol: str, summary: Dict = None, days: int = 7) -> Dict:
        """
        Aggregate sentiment score from provided news summary.

        Args:
            symbol: Asset symbol to analyze
            summary: Sentiment summary dict from repository (caller responsible for fetching)
            days: Time window for aggregation (default 7 days)

        Returns:
            {
                'avg_sentiment': float (-1.0 to 1.0),
                'article_count': int,
                'sentiment_label': str ('BULLISH'/'NEUTRAL'/'BEARISH'),
                'last_analyzed': datetime
            }
        """
        cache_key = f"news_sentiment_{symbol}_{days}d"
        cached = smart_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            # Use passed summary data (caller responsible for fetching from repository)

            if not summary or summary.get('count', 0) == 0:
                result = {
                    'avg_sentiment': 0.0,
                    'article_count': 0,
                    'sentiment_label': 'NEUTRAL',
                    'last_analyzed': None
                }
            else:
                avg_score = summary.get('avg_score', 0.0) or 0.0
                article_count = summary.get('articles', 0)

                # Map sentiment score to label
                if avg_score > 0.3:
                    label = 'BULLISH'
                elif avg_score < -0.3:
                    label = 'BEARISH'
                else:
                    label = 'NEUTRAL'

                result = {
                    'avg_sentiment': round(avg_score, 3),
                    'article_count': article_count,
                    'sentiment_label': label,
                    'last_analyzed': datetime.now().isoformat()
                }

            smart_cache.set(cache_key, result, expire=TTL_QUANT_MATH)
            return result

        except Exception as e:
            self.logger.error(f"Sentiment aggregation failed for {symbol}: {e}", exc_info=True)
            return {
                'avg_sentiment': 0.0,
                'article_count': 0,
                'sentiment_label': 'NEUTRAL',
                'last_analyzed': None
            }

    def get_asset_news(self, symbol: str, articles: List[Dict] = None, limit: int = 5) -> List[Dict]:
        """
        Process and format analyzed articles for asset.

        Args:
            symbol: Asset symbol
            articles: List of analyzed article dicts (caller responsible for fetching from repository)
            limit: Max articles to return

        Returns:
            List of analyzed article dicts with sentiment
        """
        try:
            articles = articles or []
            return [
                {
                    'title': a.get('title'),
                    'snippet': a.get('snippet'),
                    'sentiment': a.get('sentiment', {}),
                    'published_at': a.get('published_at'),
                    'link': a.get('link')
                }
                for a in articles
            ]
        except Exception as e:
            self.logger.warning(f"Failed to process news for {symbol}: {e}")
            return []
