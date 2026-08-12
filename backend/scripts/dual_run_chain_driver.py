"""Python leg driver for the dual-run evaluation-chain comparison harness
(backend-node/scripts/compareEvalChains.ts, migration plan Task 2 Step 3).

Invoked by that script as a subprocess, once per asset. Runs Python's REAL
process_asset_snapshot chain end-to-end (process_asset_snapshot ->
generate_features -> generate_signals -> generate_scores ->
compute_asset_health), via Celery eager execution — same technique proven in
.superpowers/sdd/2026-08-12-python-to-node-remaining-work/task2-step1-report.md's
live reproduction — then prints a single `RESULT_JSON:{...}` line capturing
every output field the harness diffs against Node's equivalent chain, before
Node's leg runs and overwrites the same upsert-target rows (AssetSnapshot/
AssetFeatures/AssetScore/AssetHealth are all single-row-per-asset upserts
shared by both backends).

Not meant to be run standalone for anything other than this harness — it has
no dry-run mode and always executes the real chain against whatever DB
DATABASE_URL points at.

Usage: python3 scripts/dual_run_chain_driver.py <asset_id_uuid>
Requires env: DATABASE_URL, REDIS_URL, REPO_ROOT (passed in explicitly by the
Node harness — not read from backend/'s own .env defaults, since those may
point at a different local Postgres/Redis instance than backend-node's; see
task2-step1-report.md for the root cause this works around).
"""
import json
import os
import sys
import uuid as uuid_mod
from datetime import datetime, timezone

os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "true")
repo_root = os.environ["REPO_ROOT"]
sys.path.insert(0, os.path.join(repo_root, "backend"))


def to_jsonable(v):
    if v is None:
        return None
    if isinstance(v, (uuid_mod.UUID,)):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    try:
        from decimal import Decimal
        if isinstance(v, Decimal):
            return float(v)
    except ImportError:
        pass
    return v


def main():
    asset_id_str = sys.argv[1]
    aid = uuid_mod.UUID(asset_id_str)

    from app.workers.celery_app import celery_app
    celery_app.conf.task_always_eager = True

    from app.workers.snapshots.asset_snapshot import process_asset_snapshot

    result = process_asset_snapshot.apply(args=[asset_id_str])
    result.get(propagate=True)

    # Capture every output field, fresh, right after Python's chain finished
    # and before Node's leg touches the same rows.
    from app.core.database import SessionLocal
    from app.core.redis import get_asset_signals_key, get_redis_client

    out = {"asset_id": asset_id_str}

    with SessionLocal() as session:
        from app.modules.market.entities.market import AssetSnapshot, AssetFeatures, AssetHealth
        from app.modules.market.entities.evaluation import AssetScore, FeatureSnapshot
        from app.modules.ai.entities.recommendation import Recommendation
        from app.modules.news.entities.news import AssetSentimentSnapshot
        from sqlalchemy import select

        snap = session.get(AssetSnapshot, aid)
        out["asset_snapshot"] = None if not snap else {
            "price": to_jsonable(snap.price),
            "market_cap": to_jsonable(snap.market_cap),
            "pe_ratio": to_jsonable(snap.pe_ratio),
            "rsi": to_jsonable(snap.rsi),
            "momentum_score": to_jsonable(snap.momentum_score),
            "volatility_score": to_jsonable(snap.volatility_score),
            "sentiment_score": to_jsonable(snap.sentiment_score),
            "payload": snap.payload,
            "updated_at": to_jsonable(snap.updated_at),
        }

        feat = session.get(AssetFeatures, aid)
        out["asset_features"] = None if not feat else {
            "price": to_jsonable(feat.price),
            "market_cap": to_jsonable(feat.market_cap),
            "momentum_score": to_jsonable(feat.momentum_score),
            "volatility_score": to_jsonable(feat.volatility_score),
            "sentiment_score": to_jsonable(feat.sentiment_score),
            "updated_at": to_jsonable(feat.updated_at),
        }

        fs = session.execute(
            select(FeatureSnapshot).where(FeatureSnapshot.asset_id == aid).order_by(FeatureSnapshot.snapshot_at.desc()).limit(1)
        ).scalar_one_or_none()
        out["feature_snapshot"] = None if not fs else {
            "id": str(fs.id),
            "snapshot_at": to_jsonable(fs.snapshot_at),
            "model_version": fs.model_version,
            "feature_schema_version": fs.feature_schema_version,
            "features": fs.features,
        }

        score = session.execute(
            select(AssetScore).where(AssetScore.asset_id == aid).order_by(AssetScore.generated_at.desc()).limit(1)
        ).scalar_one_or_none()
        out["asset_score"] = None if not score else {
            "model_version": score.model_version,
            "recommendation_score": to_jsonable(score.recommendation_score),
            "quality_score": to_jsonable(score.quality_score),
            "valuation_score": to_jsonable(score.valuation_score),
            "unavailable_inputs": score.unavailable_inputs,
            "generated_at": to_jsonable(score.generated_at),
        }

        rec = session.execute(
            select(Recommendation).where(Recommendation.asset_id == aid, Recommendation.status == "active").order_by(Recommendation.updated_at.desc()).limit(1)
        ).scalar_one_or_none()
        out["recommendation"] = None if not rec else {
            "id": str(rec.id),
            "recommendation_state": rec.recommendation_state,
            "confidence_score": to_jsonable(rec.confidence_score),
            "status": rec.status,
            "version": rec.version,
        }

        health_rows = session.execute(select(AssetHealth).where(AssetHealth.asset_id == aid)).scalars().all()
        out["asset_health"] = [
            {
                "provider_name": h.provider_name,
                "status": h.status,
                "quote_age_seconds": h.quote_age_seconds,
                "fundamentals_age_seconds": h.fundamentals_age_seconds,
                "signal_age_seconds": h.signal_age_seconds,
                "news_age_seconds": h.news_age_seconds,
            }
            for h in health_rows
        ]

        sent = session.execute(
            select(AssetSentimentSnapshot).where(AssetSentimentSnapshot.asset_id == aid).order_by(AssetSentimentSnapshot.snapshot_date.desc()).limit(1)
        ).scalar_one_or_none()
        out["sentiment_snapshot"] = None if not sent else {
            "snapshot_date": to_jsonable(sent.snapshot_date),
            "avg_sentiment_7d": sent.avg_sentiment_7d,
        }

    client = get_redis_client()
    raw = client.get(get_asset_signals_key(asset_id_str))
    out["signals_cache"] = json.loads(raw) if raw else None

    print("RESULT_JSON:" + json.dumps(out, default=to_jsonable))


if __name__ == "__main__":
    main()
