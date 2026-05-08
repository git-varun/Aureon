"""Recommendations service layer — list/apply/dismiss/undo + seed."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.shared.exceptions import NotFoundError, ValidationError

from .models import Recommendation


def _to_dict(r: Recommendation) -> dict[str, Any]:
    return {
        "id": r.id,
        "ext_id": r.ext_id,
        "status": r.status,
        "strength": r.strength,
        "action": r.action,
        "scope": {"kind": r.scope_kind, "ref": r.scope_ref},
        "title": r.title,
        "impact_one_line": r.impact_one_line,
        "confidence": r.confidence,
        "horizon": r.horizon,
        "change": r.change,
        "impact": r.impact,
        "reasoning": r.reasoning,
        "conflicts_with": r.conflicts_with or [],
        "signal_ids": r.signal_ids or [],
        "confidence_factors": r.confidence_factors,
        "predicted_impact": r.predicted_impact,
        "realized_impact": r.realized_impact,
        "created_at": r.created_at,
        "applied_at": r.applied_at,
        "dismissed_at": r.dismissed_at,
    }


class RecommendationService:

    @staticmethod
    def list(session: Session, status: Optional[str] = None) -> list[dict[str, Any]]:
        q = session.query(Recommendation)
        if status:
            q = q.filter(Recommendation.status == status)
        return [_to_dict(r) for r in q.order_by(Recommendation.created_at.desc()).all()]

    @staticmethod
    def get_by_ext_id(session: Session, ext_id: str) -> Recommendation:
        rec = session.query(Recommendation).filter(Recommendation.ext_id == ext_id).first()
        if not rec:
            raise NotFoundError(f"recommendation {ext_id!r} not found")
        return rec

    @staticmethod
    def apply(session: Session, ext_id: str) -> dict[str, Any]:
        rec = RecommendationService.get_by_ext_id(session, ext_id)
        if rec.status == "applied":
            return _to_dict(rec)
        # Block if any conflicting rec is still active
        for cid in (rec.conflicts_with or []):
            other = session.query(Recommendation).filter(Recommendation.ext_id == cid).first()
            if other and other.status == "active":
                raise ValidationError(f"blocked by active conflict: {cid}")
        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.dismissed_at = None
        session.commit()
        session.refresh(rec)
        return _to_dict(rec)

    @staticmethod
    def dismiss(session: Session, ext_id: str, reason: Optional[str] = None) -> dict[str, Any]:
        rec = RecommendationService.get_by_ext_id(session, ext_id)
        rec.status = "dismissed"
        rec.dismissed_at = datetime.utcnow()
        rec.applied_at = None
        rec.dismiss_reason = reason
        session.commit()
        session.refresh(rec)
        return _to_dict(rec)

    @staticmethod
    def undo(session: Session, ext_id: str) -> dict[str, Any]:
        rec = RecommendationService.get_by_ext_id(session, ext_id)
        rec.status = "active"
        rec.applied_at = None
        rec.dismissed_at = None
        rec.dismiss_reason = None
        session.commit()
        session.refresh(rec)
        return _to_dict(rec)

    @staticmethod
    def seed(session: Session, fixtures: list[dict[str, Any]]) -> tuple[int, int]:
        """Idempotent seed by ext_id. Returns (inserted, skipped)."""
        existing = {
            r.ext_id for r in session.query(Recommendation.ext_id).all()
        }
        inserted = 0
        for f in fixtures:
            if f["ext_id"] in existing:
                continue
            session.add(Recommendation(**f))
            inserted += 1
        session.commit()
        return inserted, len(fixtures) - inserted


# ---------------------------------------------------------------------------
# Default fixtures — ported from frontend Aureon mocks (V3_RECS_ACTIVE + EXTRA_RECS)
# ---------------------------------------------------------------------------
DEFAULT_FIXTURES: list[dict[str, Any]] = [
    {
        "ext_id": "r-tech", "status": "active", "strength": "recommended", "action": "Reduce",
        "scope_kind": "class", "scope_ref": "Tech stocks",
        "title": "Trim tech exposure",
        "impact_one_line": "$3,200 cash · return +0.3pp / 12m",
        "confidence": 82, "horizon": "Long",
        "change": {"amount": -3200, "percent": -0.075},
        "impact": {"risk": {"delta": -0.08, "unit": "β"}, "ret": {"delta": "+0.3pp", "horizon": "12m"},
                   "alloc": {"before": 0.34, "after": 0.285, "target": 0.28}, "cash": 3200},
        "reasoning": {"allocation": "Tech 34% vs. target 28%",
                      "momentum": "60-day momentum turning negative",
                      "sentiment": "Diverging from fundamentals"},
        "conflicts_with": [], "signal_ids": ["sg-004"],
        "confidence_factors": {"allocation": 0.46, "momentum": 0.32, "sentiment": 0.22},
    },
    {
        "ext_id": "r-harvest", "status": "active", "strength": "consider", "action": "Harvest",
        "scope_kind": "portfolio", "scope_ref": "3 lots",
        "title": "Harvest tax losses",
        "impact_one_line": "+$1.8k realized · no wash-sale conflicts",
        "confidence": 71, "horizon": "Short",
        "change": {"amount": -1840, "percent": None},
        "impact": {"risk": {"delta": 0, "unit": "β"}, "ret": {"delta": "+$1,800", "horizon": "realized"},
                   "alloc": None, "cash": 1800},
        "reasoning": {"allocation": "3 positions below cost basis >30 days",
                      "fundamentals": "No wash-sale conflicts detected"},
        "conflicts_with": [], "signal_ids": [],
        "confidence_factors": {"allocation": 0.58, "fundamentals": 0.42},
    },
    {
        "ext_id": "r-nvda-trim", "status": "active", "strength": "recommended", "action": "Reduce",
        "scope_kind": "asset", "scope_ref": "NVDA",
        "title": "Reduce NVDA position",
        "impact_one_line": "$1,600 cash · return +0.1pp / 12m",
        "confidence": 76, "horizon": "Short",
        "change": {"amount": -1600, "percent": -0.1},
        "impact": {"risk": {"delta": -0.03, "unit": "β"}, "ret": {"delta": "+0.1pp", "horizon": "12m"},
                   "alloc": {"before": 0.012, "after": 0.011, "target": 0.010}, "cash": 1600},
        "reasoning": {"allocation": "Single-name concentration 1.2% → 1.1%",
                      "momentum": "60-day momentum turning negative",
                      "fundamentals": "PEG 0.9, within range"},
        "conflicts_with": ["r-nvda-hold"], "signal_ids": ["sg-001"],
        "confidence_factors": {"allocation": 0.30, "momentum": 0.45, "fundamentals": 0.25},
    },
    {
        "ext_id": "r-nvda-hold", "status": "active", "strength": "conflict", "action": "Hold",
        "scope_kind": "asset", "scope_ref": "NVDA",
        "title": "Hold NVDA — signal pending",
        "impact_one_line": "No change · awaiting sentiment resolution",
        "confidence": 58, "horizon": "Short",
        "change": {"amount": 0, "percent": 0},
        "impact": {"risk": {"delta": 0, "unit": "β"}, "ret": {"delta": "Awaiting signal", "horizon": "—"},
                   "alloc": None, "cash": 0},
        "reasoning": {"sentiment": "Negative spike last 48h could revert",
                      "fundamentals": "PEG 0.9 supports holding"},
        "conflicts_with": ["r-nvda-trim"], "signal_ids": ["sg-002"],
        "confidence_factors": {"sentiment": 0.60, "fundamentals": 0.40},
    },
    {
        "ext_id": "r-btc-trim", "status": "active", "strength": "recommended", "action": "Reduce",
        "scope_kind": "asset", "scope_ref": "BTC",
        "title": "Trim BTC on volatility spike",
        "impact_one_line": "$1,800 cash · risk Δ −0.06β",
        "confidence": 74, "horizon": "Short",
        "change": {"amount": -1800, "percent": -0.06},
        "impact": {"risk": {"delta": -0.06, "unit": "β"}, "ret": {"delta": "+0.2pp", "horizon": "12m"},
                   "alloc": {"before": 0.070, "after": 0.064, "target": 0.070}, "cash": 1800},
        "reasoning": {"momentum": "Realized vol 14d > 90th percentile",
                      "sentiment": "Funding rates negative — bearish bias",
                      "allocation": "Crypto 7.0% vs target 7.0% (within band)"},
        "conflicts_with": [], "signal_ids": ["sg-003", "sg-013"],
    },
    {
        "ext_id": "r-bonds-add", "status": "active", "strength": "consider", "action": "Add",
        "scope_kind": "class", "scope_ref": "Bonds",
        "title": "Add to bond allocation",
        "impact_one_line": "$2,200 deploy · drift 2.0pp closes",
        "confidence": 65, "horizon": "Long",
        "change": {"amount": 2200, "percent": 0.025},
        "impact": {"risk": {"delta": -0.04, "unit": "β"}, "ret": {"delta": "+0.1pp", "horizon": "12m"},
                   "alloc": {"before": 0.080, "after": 0.090, "target": 0.100}, "cash": -2200},
        "reasoning": {"allocation": "Bonds 8% vs target 10%",
                      "macro": "10y yield +6bp on stronger PCE"},
        "conflicts_with": [], "signal_ids": ["sg-007", "sg-010"],
    },
]
