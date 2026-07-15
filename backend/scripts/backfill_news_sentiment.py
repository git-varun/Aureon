#!/usr/bin/env python
"""One-time backfill: computes VADER sentiment for News rows ingested before
Fix U (VADER-at-ingestion, live 2026-07-11 ~21:00 UTC) went live. That fix was
forward-only — News.sentiment_score is set at write time in
NewsService.fetch_and_store, so it never touches existing rows — and its
backfill was scoped but never executed (SENTIMENT_DESIGN_AUDIT.md §4:
"a one-time backfill/migration concern for existing rows, not a recurring
job"). Every row with sentiment_score IS NULL today is, by construction, a
pre-fix row (post-fix ingestion always sets a float, including 0.0) — no date
cutoff needed, the NULL check alone identifies exactly the target set.

Uses the same VADER call and title-only input NewsService.fetch_and_store uses
at ingestion, so backfilled scores are computed identically to real-time ones.

Run once. Not a Celery task — this isn't a recurring job, and there's nothing
left to backfill after it's run (going forward, every new row already gets a
score at ingestion).

Usage (run from backend/, with PYTHONPATH set so `app` is importable):
    PYTHONPATH=. python scripts/backfill_news_sentiment.py
    PYTHONPATH=. python scripts/backfill_news_sentiment.py --dry-run
"""
import argparse
import sys

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.core.database import SessionLocal
from app.modules.news.entities.news import News

_sentiment_analyzer = SentimentIntensityAnalyzer()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing")
    args = parser.parse_args()

    with SessionLocal() as db:
        rows = db.query(News).filter(News.sentiment_score.is_(None)).all()
        print(f"Found {len(rows)} News row(s) with sentiment_score IS NULL.")

        if not rows:
            return 0

        if args.dry_run:
            for r in rows[:10]:
                score = _sentiment_analyzer.polarity_scores(r.title)["compound"]
                print(f"  [dry-run] id={r.id} score={score:+.4f} title={r.title!r}")
            if len(rows) > 10:
                print(f"  ...and {len(rows) - 10} more")
            print("Dry run — no changes written.")
            return 0

        for r in rows:
            r.sentiment_score = _sentiment_analyzer.polarity_scores(r.title)["compound"]
        db.commit()
        print(f"Backfilled sentiment_score for {len(rows)} row(s).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
