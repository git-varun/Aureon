import uuid
from datetime import datetime, timedelta, timezone

from app.core.services.base import BaseService
from app.modules.news.entities.news import AssetSentimentSnapshot
from app.modules.news.repositories.asset_sentiment import AssetSentimentSnapshotRepository
from app.modules.news.repositories.news import NewsRepository

# Recency-weighted, confidence-shrunk aggregation. Each article's contribution
# decays with age (half-life below), and the aggregate is pulled toward
# neutral (0) when total evidence is thin, so one stale article doesn't carry
# the same signal as ten recent ones.
_HALF_LIFE_7D_DAYS = 2.0
_HALF_LIFE_30D_DAYS = 7.0
_CONFIDENCE_TARGET_WEIGHT = 5.0  # weight-equivalent of ~5 fresh articles saturates confidence
_TREND_THRESHOLD = 0.05


def _weighted_sentiment(rows: list[tuple[float, datetime]], now: datetime, half_life_days: float) -> float | None:
    if not rows:
        return None
    weight_sum = 0.0
    weighted_total = 0.0
    for score, published_at in rows:
        age_days = max(0.0, (now - published_at).total_seconds() / 86400)
        weight = 0.5 ** (age_days / half_life_days)
        weight_sum += weight
        weighted_total += weight * score
    if weight_sum == 0:
        return None
    raw_avg = weighted_total / weight_sum
    confidence = min(1.0, weight_sum / _CONFIDENCE_TARGET_WEIGHT)
    return raw_avg * confidence


class NewsSentimentService(BaseService):
    def __init__(self, news_repo: NewsRepository, sentiment_repo: AssetSentimentSnapshotRepository):
        self.news_repo = news_repo
        self.sentiment_repo = sentiment_repo

    def aggregate_asset_sentiment(self, asset_id: uuid.UUID) -> AssetSentimentSnapshot | None:
        """Recomputes the rolling 7d/30d sentiment aggregate for an asset from
        News.sentiment_score (immutable per-article scores, set at ingestion).
        Does not touch per-article sentiment itself."""
        now = datetime.now(timezone.utc)
        rows_30d = self.news_repo.list_sentiment_for_asset(asset_id, since=now - timedelta(days=30))
        if not rows_30d:
            return None

        rows_7d = [row for row in rows_30d if row[1] >= now - timedelta(days=7)]

        avg_7d = _weighted_sentiment(rows_7d, now, _HALF_LIFE_7D_DAYS)
        avg_30d = _weighted_sentiment(rows_30d, now, _HALF_LIFE_30D_DAYS)

        trend = None
        if avg_7d is not None and avg_30d is not None:
            diff = avg_7d - avg_30d
            if diff > _TREND_THRESHOLD:
                trend = "IMPROVING"
            elif diff < -_TREND_THRESHOLD:
                trend = "DETERIORATING"
            else:
                trend = "STABLE"

        snapshot = AssetSentimentSnapshot(
            asset_id=asset_id,
            snapshot_date=now.replace(hour=0, minute=0, second=0, microsecond=0),
            avg_sentiment_7d=avg_7d,
            avg_sentiment_30d=avg_30d,
            article_count_7d=len(rows_7d),
            trend=trend,
        )
        self.sentiment_repo.upsert(snapshot)
        self.sentiment_repo.session.commit()
        return snapshot
