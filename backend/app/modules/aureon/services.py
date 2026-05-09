"""Aureon service — assembles composite state for the Aureon UI.

Slim builder; does NOT reuse the legacy /api/state shape. The FE consumes
specific keys defined in `frontend/src/hooks/useAureonData.js`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

# Maps Aureon FE class keys ⇄ backend asset_type values.
# FE uses: stocks, crypto, funds, bonds, real_estate, retirement, insurance.
# BE asset_type uses AssetType enum: equity, crypto, mutual_fund, bond, ...
ASSET_TYPE_TO_CLASS = {
    "equity": "stocks",
    "crypto": "crypto",
    "mutual_fund": "funds",
    "bond": "bonds",
    "real_estate": "real_estate",
    "epf": "retirement",
    "ppf": "retirement",
    "insurance": "insurance",
    "commodity": "stocks",  # default bucket
}


def _classify(asset_type: Optional[str]) -> str:
    if not asset_type:
        return "stocks"
    return ASSET_TYPE_TO_CLASS.get(asset_type, "stocks")


def _holding_payload(pos, a, ph_closes: list[float]) -> dict[str, Any]:
    qty = float(pos.quantity or 0)
    cost = float(pos.avg_buy_price or 0)
    price = float(a.current_price or 0)
    prev = float(a.previous_close or price)
    day_pct = ((price - prev) / prev) if prev else 0.0
    return {
        "id": a.symbol,
        "ticker": a.symbol,
        "name": a.name,
        "class": _classify(a.asset_type),
        "tier": a.tier or "active",
        "qty": qty,
        "cost": cost,
        "price": price,
        "dayPct": round(day_pct, 6),
        "sector": (a.asset_metadata or {}).get("sector") if isinstance(a.asset_metadata, dict) else None,
        "beta": (a.asset_metadata or {}).get("beta") if isinstance(a.asset_metadata, dict) else None,
        "spark": ph_closes[-30:] if ph_closes else [],
    }


def build_aureon_state(session: Session) -> dict[str, Any]:
    from app.modules.config.services import ConfigService
    from app.modules.portfolio.models import Asset, PriceHistory, Transaction
    from app.modules.portfolio.services import PortfolioService
    from app.modules.recommendations.models import Recommendation
    from app.modules.recommendations.services import RecommendationService
    from app.modules.signals.models import Signal

    positions = PortfolioService(session).list_positions()

    asset_ids = [p.asset_id for p in positions]
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    prices_by_aid: dict[int, list[float]] = {}
    if asset_ids:
        rows = (
            session.query(PriceHistory)
            .filter(PriceHistory.asset_id.in_(asset_ids), PriceHistory.date >= cutoff)
            .order_by(PriceHistory.asset_id, PriceHistory.date)
            .all()
        )
        for r in rows:
            prices_by_aid.setdefault(r.asset_id, []).append(float(r.close))

    holdings = []
    net_worth = 0.0
    day_delta_dollars = 0.0
    alloc: dict[str, float] = {}

    for pos in positions:
        a = pos.asset
        if not a:
            continue
        h = _holding_payload(pos, a, prices_by_aid.get(a.id, []))
        value = h["qty"] * h["price"]
        net_worth += value
        prev_value = h["qty"] * (a.previous_close or h["price"])
        day_delta_dollars += (value - prev_value)
        alloc[h["class"]] = alloc.get(h["class"], 0.0) + value
        holdings.append(h)

    if net_worth > 0:
        alloc = {k: round(v / net_worth, 6) for k, v in alloc.items()}
    day_pct = (day_delta_dollars / net_worth) if net_worth else 0.0

    # Class targets — from config
    targets = ConfigService(session).list_allocation_targets()
    class_target = {t["asset_class"]: t["target_pct"] for t in targets}

    # Recommendations
    recs_all = RecommendationService.list(session)
    recs_active = [r for r in recs_all if r["status"] == "active"]
    recs_applied = [r for r in recs_all if r["status"] == "applied"]
    recs_dismissed = [r for r in recs_all if r["status"] == "dismissed"]

    # Build reverse map: signal ext_id → recommendation ext_id (active recs only)
    _sig_to_rec: dict[str, str] = {}
    for r in recs_active:
        for sid in (r.get("signal_ids") or []):
            _sig_to_rec[sid] = r["ext_id"]

    # signal_type → UI kind mapping (best-effort; signal_metadata.kind wins if present)
    _SIGNAL_KIND: dict[str, str] = {
        "buy": "momentum",
        "sell": "momentum",
        "hold": "fundamentals",
        "neutral": "macro",
    }

    # Signals — latest 20
    signals_out = []
    for s in (
            session.query(Signal).order_by(Signal.created_at.desc()).limit(20).all()
    ):
        sig_ext_id = f"sg-{s.id}"
        raw_type = s.signal_type.value if s.signal_type and hasattr(s.signal_type, "value") else "neutral"
        meta = s.signal_metadata or {}
        kind = meta.get("kind") or _SIGNAL_KIND.get(raw_type, "macro")
        raw_severity = s.risk_level or "med"
        severity = "med" if raw_severity == "medium" else raw_severity
        ts = s.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if s.created_at else ""
        signals_out.append({
            "id": sig_ext_id,
            "ts": ts,
            "asset": s.symbol,
            "kind": kind,
            "severity": severity,
            "text": s.rationale or "",
            "linkedRec": _sig_to_rec.get(sig_ext_id),
        })

    # Activity ledger — combines transactions + dismissed recs (most recent 50)
    activity = _build_activity(session)

    return {
        "holdings": holdings,
        "netWorth": round(net_worth, 2),
        "dayDelta": {"dollars": round(day_delta_dollars, 2), "pct": round(day_pct, 6)},
        "allocation": alloc,
        "classTarget": class_target,
        "recommendations": {
            "active": recs_active,
            "applied": recs_applied,
            "dismissed": recs_dismissed,
        },
        "signals": signals_out,
        "activity": activity,
    }


def _build_activity(session: Session) -> list[dict[str, Any]]:
    from app.modules.portfolio.models import Asset, Transaction
    from app.modules.recommendations.models import Recommendation

    out: list[dict[str, Any]] = []

    txn_rows = (
        session.query(Transaction, Asset.symbol)
        .outerjoin(Asset, Asset.id == Transaction.asset_id)
        .order_by(Transaction.transaction_date.desc())
        .limit(40)
        .all()
    )
    for t, sym in txn_rows:
        out.append({
            "id": f"t-{t.id}",
            "ts": t.transaction_date.strftime("%Y-%m-%d %H:%M") if t.transaction_date else "",
            "kind": t.kind or "trade",
            "action": (t.transaction_type or "").title(),
            "asset": sym or "PORT",
            "detail": t.notes or "",
            "predicted": t.predicted_impact,
            "realized": t.realized_impact,
        })

    dismissed = (
        session.query(Recommendation)
        .filter(Recommendation.status == "dismissed")
        .order_by(Recommendation.dismissed_at.desc())
        .limit(20)
        .all()
    )
    for r in dismissed:
        out.append({
            "id": f"d-{r.id}",
            "ts": r.dismissed_at.strftime("%Y-%m-%d %H:%M") if r.dismissed_at else "",
            "kind": "dismissed",
            "action": r.action,
            "asset": r.scope_ref or "PORT",
            "detail": f"declined — {(r.dismiss_reason or 'user dismissed').lower()}",
        })

    out.sort(key=lambda x: x["ts"], reverse=True)
    return out[:50]


def _prior_actions_for_asset(
        session: Session, asset_id: int, ticker: str, series_dates: list,
) -> list[dict[str, Any]]:
    """Map applied transactions + dismissed recs onto the price-series index.

    Returns: [{i, label, kind, ts}] where i is the closest index in series_dates
    (or None if outside the window — caller can still render in a side list).
    """
    from app.modules.portfolio.models import Transaction
    from app.modules.recommendations.models import Recommendation

    def _to_naive(d):
        if d is None:
            return None
        if hasattr(d, "tzinfo") and d.tzinfo is not None:
            return d.replace(tzinfo=None)
        return d

    # Normalise series dates to naive UTC for comparison.
    sd = [_to_naive(d) for d in series_dates]

    def _index_for(when):
        when = _to_naive(when)
        if when is None or not sd:
            return None
        # Pick the last series date <= when (markers sit on/after the event).
        idx = None
        for i, d in enumerate(sd):
            if d <= when:
                idx = i
            else:
                break
        return idx

    out: list[dict[str, Any]] = []

    txns = (
        session.query(Transaction)
        .filter(Transaction.asset_id == asset_id)
        .order_by(Transaction.transaction_date.asc())
        .all()
    )
    for t in txns:
        action = (t.transaction_type or "").title() or "Trade"
        ts = _to_naive(t.transaction_date)
        out.append({
            "i": _index_for(ts),
            "kind": t.kind or "trade",
            "label": f"{action} · {ts.strftime('%-m/%-d')}" if ts else action,
            "ts": ts.isoformat() if ts else None,
        })

    dismissed = (
        session.query(Recommendation)
        .filter(Recommendation.scope_ref == ticker, Recommendation.status == "dismissed")
        .order_by(Recommendation.dismissed_at.asc())
        .all()
    )
    for r in dismissed:
        ts = _to_naive(r.dismissed_at)
        out.append({
            "i": _index_for(ts),
            "kind": "dismissed",
            "label": f"Dismissed · {ts.strftime('%-m/%-d')}" if ts else "Dismissed",
            "ts": ts.isoformat() if ts else None,
        })

    out.sort(key=lambda x: x["ts"] or "")
    return out


def build_asset_detail(session: Session, ticker: str) -> Optional[dict[str, Any]]:
    from app.modules.analytics.models import Fundamentals
    from app.modules.portfolio.models import Asset, PriceHistory, Position, Transaction
    from app.modules.recommendations.models import Recommendation
    from app.modules.signals.models import Signal

    asset = session.query(Asset).filter(Asset.symbol == ticker).first()
    if not asset:
        return None

    pos = session.query(Position).filter(Position.asset_id == asset.id).first()

    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    ph_rows = (
        session.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset.id, PriceHistory.date >= cutoff)
        .order_by(PriceHistory.date)
        .all()
    )
    closes = [float(p.close) for p in ph_rows]
    series_dates = [p.date for p in ph_rows]
    prior_actions = _prior_actions_for_asset(session, asset.id, ticker, series_dates)

    fund = session.query(Fundamentals).filter(Fundamentals.symbol == ticker).first()
    sigs = (
        session.query(Signal)
        .filter(Signal.symbol == ticker)
        .order_by(Signal.created_at.desc())
        .limit(10)
        .all()
    )
    recs = (
        session.query(Recommendation)
        .filter(Recommendation.scope_ref == ticker, Recommendation.status == "active")
        .all()
    )

    return {
        "ticker": asset.symbol,
        "name": asset.name,
        "class": _classify(asset.asset_type),
        "tier": asset.tier,
        "price": float(asset.current_price or 0),
        "priceSeries": closes,
        "priorActions": prior_actions,
        "position": {
            "qty": float(pos.quantity) if pos else 0.0,
            "cost": float(pos.avg_buy_price) if pos else 0.0,
            "value": float(pos.current_value) if pos else 0.0,
            "pnl": float(pos.pnl) if pos and pos.pnl is not None else 0.0,
            "pnl_pct": float(pos.pnl_percent) if pos and pos.pnl_percent is not None else 0.0,
        } if pos else None,
        "fundamentals": {
            "pe": float(fund.pe_ratio) if fund and fund.pe_ratio is not None else None,
            "peg": float(getattr(fund, "peg_ratio", None)) if fund and getattr(fund, "peg_ratio",
                                                                               None) is not None else None,
        } if fund else None,
        "signals": [
            {"id": f"sg-{s.id}", "kind": (s.signal_type.value if s.signal_type else None),
             "text": s.rationale, "ts": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else ""}
            for s in sigs
        ],
        "recommendations": [
            {"ext_id": r.ext_id, "title": r.title, "action": r.action, "strength": r.strength,
             "impact_one_line": r.impact_one_line, "confidence": r.confidence}
            for r in recs
        ],
    }
