"""Signal → Recommendation materializer.

Phase 3 (decision A=2): bucket signals into one rec per (scope, action),
upsert by stable ext_id. Idempotent — safe to call after every signal batch.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.modules.signals.models import Signal
from app.shared.constants import SignalType

from .models import Recommendation

CONFIDENCE_THRESHOLD = 65
ACTIONABLE_TYPES = {SignalType.BUY, SignalType.SELL}

_ACTION_BY_SIGNAL = {
    SignalType.BUY: "Add",
    SignalType.SELL: "Reduce",
}


def _strength(confidence_pct: int) -> str:
    return "recommended" if confidence_pct >= 80 else "consider"


def _ext_id(symbol: str, action: str) -> str:
    return f"sg-{symbol.lower()}-{action.lower()}"


def _latest_actionable_per_symbol(session: Session) -> dict[str, Signal]:
    """Latest actionable signal per symbol (status='active')."""
    rows: Iterable[Signal] = (
        session.query(Signal)
        .filter(Signal.status == "active")
        .order_by(Signal.symbol, Signal.created_at.desc())
        .all()
    )
    seen: dict[str, Signal] = {}
    for s in rows:
        if s.symbol in seen:
            continue
        if s.signal_type not in ACTIONABLE_TYPES:
            continue
        seen[s.symbol] = s
    return seen


def materialize_from_signals(session: Session, threshold: int = CONFIDENCE_THRESHOLD) -> dict[str, int]:
    """Upsert one Recommendation per (symbol, action) for signals above threshold.

    Returns counts: {created, updated, skipped}.
    """
    latest = _latest_actionable_per_symbol(session)
    created = updated = skipped = 0

    for symbol, sig in latest.items():
        conf_pct = int(round((sig.confidence or 0) * 100))
        if conf_pct < threshold:
            skipped += 1
            continue

        action = _ACTION_BY_SIGNAL[sig.signal_type]
        ext_id = _ext_id(symbol, action)
        signal_ext = f"sg-{sig.id}"

        rec = session.query(Recommendation).filter(Recommendation.ext_id == ext_id).first()
        payload: dict[str, Any] = {
            "strength": _strength(conf_pct),
            "action": action,
            "scope_kind": "asset",
            "scope_ref": symbol,
            "title": f"{action} {symbol}",
            "impact_one_line": (sig.rationale or "")[:200],
            "confidence": conf_pct,
            "horizon": "Short",
            "signal_ids": [signal_ext],
            "reasoning": {"signals": sig.rationale or ""},
        }

        if rec is None:
            session.add(Recommendation(ext_id=ext_id, status="active", **payload))
            created += 1
        else:
            # Re-activate from dismissed/applied if a fresh signal is firing.
            if rec.status != "active":
                rec.status = "active"
                rec.applied_at = None
                rec.dismissed_at = None
                rec.dismiss_reason = None
            for k, v in payload.items():
                setattr(rec, k, v)
            rec.updated_at = datetime.utcnow()
            updated += 1

    session.commit()
    return {"created": created, "updated": updated, "skipped": skipped}
