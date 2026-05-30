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
    "eps": "retirement",
    "nps": "retirement",
    "insurance": "insurance",
    "commodity": "stocks",  # default bucket
}


def _classify(asset_type: Optional[str]) -> str:
    if not asset_type:
        return "stocks"
    return ASSET_TYPE_TO_CLASS.get(asset_type, "stocks")


def _holding_payload(pos, a, ph_closes: list[float], fx_rate: float = 83.50) -> dict[str, Any]:
    """Build a holding dict with all monetary values normalised to USD.

    Uses asset.currency to determine denomination: USD assets (crypto, or any
    future USD-denominated security) are kept as-is; INR assets are divided by
    fx_rate. This replaces the old crypto-type-only heuristic so that US equities
    (if ever added with currency='USD') are handled correctly too.
    """
    qty = float(pos.quantity or 0)
    cost = float(pos.avg_buy_price or 0)
    price = float(a.current_price or 0)
    # Accrual tasks (accrue_epf, accrue_eps, insurance_premium) write pos.current_value
    # but never update asset.current_price. Derive an effective unit price from the
    # position value so these assets show a non-zero value in the UI.
    if price == 0 and pos.current_value and qty > 0:
        price = float(pos.current_value) / qty
    prev = float(a.previous_close or price)

    is_usd_asset = getattr(a, "currency", "INR") == "USD"
    if not is_usd_asset:
        # INR → USD
        price = price / fx_rate
        prev = prev / fx_rate
        cost = cost / fx_rate
        ph_closes = [c / fx_rate for c in ph_closes]

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


def build_aureon_state(session: Session, user_id: Optional[int] = None) -> dict[str, Any]:
    from app.core.cache import cache
    from app.modules.config.services import ConfigService
    from app.modules.notification.models import Notification
    from app.modules.portfolio.models import Asset, PriceHistory, Transaction
    from app.modules.portfolio.services import PortfolioService
    from app.modules.recommendations.models import Recommendation
    from app.modules.recommendations.services import RecommendationService
    from app.modules.signals.models import Signal
    from app.shared.utils import cache_key

    fx_rate = float(cache.get(cache_key("fx", "usd_inr")) or 83.50)
    positions = PortfolioService(session).list_positions(user_id=user_id)

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
        h = _holding_payload(pos, a, prices_by_aid.get(a.id, []), fx_rate=fx_rate)
        value = h["qty"] * h["price"]
        net_worth += value
        is_usd_asset = getattr(a, "currency", "INR") == "USD"
        raw_prev = float(a.previous_close or a.current_price or 0)
        if raw_prev == 0:
            # No historical price — treat prev == current so day delta is zero.
            prev_price = h["price"]
        else:
            prev_price = raw_prev if is_usd_asset else raw_prev / fx_rate
        prev_value = h["qty"] * prev_price
        day_delta_dollars += (value - prev_value)
        alloc[h["class"]] = alloc.get(h["class"], 0.0) + value
        holdings.append(h)

    if net_worth > 0:
        alloc = {k: round(v / net_worth, 6) for k, v in alloc.items()}
    day_pct = (day_delta_dollars / net_worth) if net_worth else 0.0

    # Class targets — from config
    targets = ConfigService(session).list_allocation_targets()
    class_target = {t["asset_class"]: t["target_pct"] for t in targets}

    # Recommendations — scoped to this user; auto-seed defaults on first load
    from app.modules.recommendations.services import DEFAULT_FIXTURES
    if user_id is not None:
        from sqlalchemy import or_
        has_recs = session.query(Recommendation).filter(or_(Recommendation.user_id == user_id, Recommendation.user_id.is_(None))).first()
        if not has_recs:
            RecommendationService.seed(session, DEFAULT_FIXTURES, user_id=user_id)

    recs_all = RecommendationService.list(session, user_id=user_id)
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

    # Signals — latest 20 for this user (include legacy rows where user_id is NULL)
    signals_q = session.query(Signal).order_by(Signal.created_at.desc())
    if user_id is not None:
        from sqlalchemy import or_
        signals_q = signals_q.filter(or_(Signal.user_id == user_id, Signal.user_id.is_(None)))
    signals_out = []
    for s in signals_q.limit(20).all():
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
    activity = _build_activity(session, user_id=user_id)

    # Portfolio-scoped recommendation (rebalance / allocation-level decisions)
    port_rec_q = (
        session.query(Recommendation)
        .filter(Recommendation.scope_kind == "portfolio", Recommendation.status == "active")
    )
    if user_id is not None:
        from sqlalchemy import or_
        port_rec_q = port_rec_q.filter(or_(Recommendation.user_id == user_id, Recommendation.user_id.is_(None)))
    portfolio_rec_row = port_rec_q.order_by(Recommendation.created_at.desc()).first()
    from app.modules.recommendations.services import _to_dict as _rec_to_dict
    portfolio_rec = _rec_to_dict(portfolio_rec_row) if portfolio_rec_row else None

    # Unread notification count for sidebar badge
    unread_q = session.query(Notification).filter(Notification.read == False)  # noqa: E712
    if user_id is not None:
        from sqlalchemy import or_
        unread_q = unread_q.filter(or_(Notification.user_id == user_id, Notification.user_id.is_(None)))
    unread_count = unread_q.count()

    # Market pulse — aggregate news sentiment (optional, null when cold)
    market_pulse = cache.get(cache_key("news", "sentiment_aggregate"))

    # AI global briefing — generated by global_briefing_task, cached 6 h
    ai_briefing = cache.get(cache_key("ai", "briefing"))

    return {
        "holdings": holdings,
        "netWorth": round(net_worth, 2),
        "fxRate": fx_rate,
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
        "portfolioRec": portfolio_rec,
        "unreadCount": unread_count,
        "marketPulse": market_pulse,
        "aiBriefing": ai_briefing,
    }


def _build_activity(session: Session, user_id: Optional[int] = None) -> list[dict[str, Any]]:
    from app.modules.portfolio.models import Asset, Transaction
    from app.modules.recommendations.models import Recommendation

    out: list[dict[str, Any]] = []

    txn_q = (
        session.query(Transaction, Asset.symbol)
        .outerjoin(Asset, Asset.id == Transaction.asset_id)
        .order_by(Transaction.transaction_date.desc())
    )
    if user_id is not None:
        from sqlalchemy import or_
        txn_q = txn_q.filter(or_(Transaction.user_id == user_id, Transaction.user_id.is_(None)))
    for t, sym in txn_q.limit(40).all():
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

    dismissed_q = (
        session.query(Recommendation)
        .filter(Recommendation.status == "dismissed")
        .order_by(Recommendation.dismissed_at.desc())
    )
    if user_id is not None:
        from sqlalchemy import or_
        dismissed_q = dismissed_q.filter(or_(Recommendation.user_id == user_id, Recommendation.user_id.is_(None)))
    dismissed = dismissed_q.limit(20).all()
    for r in dismissed:
        out.append({
            "id": f"d-{r.id}",
            "ext_id": r.ext_id,
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


def build_asset_detail(session: Session, ticker: str, user_id: Optional[int] = None) -> Optional[dict[str, Any]]:
    from app.modules.analytics.models import Fundamentals
    from app.modules.assets.market_data import MarketDataService
    from app.modules.portfolio.models import Asset, PriceHistory, Position, Transaction
    from app.modules.recommendations.models import Recommendation
    from app.modules.signals.models import Signal

    asset = session.query(Asset).filter(Asset.symbol == ticker).first()
    if not asset:
        asset = session.query(Asset).filter(Asset.symbol == ticker + ".NS").first()
    if not asset:
        return _build_market_asset_detail(ticker)

    # ── Portfolio asset path (full detail) ───────────────────────────────────

    pos_q = session.query(Position).filter(Position.asset_id == asset.id)
    if user_id is not None:
        from sqlalchemy import or_
        pos_q = pos_q.filter(or_(Position.user_id == user_id, Position.user_id.is_(None)))
    pos = pos_q.first()

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
    from sqlalchemy import or_ as _or
    sigs = (
        session.query(Signal)
        .filter(_or(Signal.symbol == ticker, Signal.symbol == ticker + ".NS"))
        .order_by(Signal.created_at.desc())
        .limit(10)
        .all()
    )
    recs_q = session.query(Recommendation).filter(Recommendation.scope_ref == ticker, Recommendation.status == "active")
    if user_id is not None:
        from sqlalchemy import or_
        recs_q = recs_q.filter(or_(Recommendation.user_id == user_id, Recommendation.user_id.is_(None)))
    recs = recs_q.all()

    curr_price = float(asset.current_price or 0)
    prev_price = float(asset.previous_close or curr_price or 0)
    day_pct = ((curr_price - prev_price) / prev_price) if prev_price > 0 else 0.0

    return {
        "ticker": asset.symbol,
        "name": asset.name,
        "class": _classify(asset.asset_type),
        "tier": asset.tier,
        "price": curr_price,
        "dayPct": round(day_pct, 6),
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
            "market_cap": float(fund.market_cap) if fund and fund.market_cap is not None else None,
        } if fund else None,
        "signals": [
            {
                "id": f"sg-{s.id}",
                "kind": (s.signal_type.value if s.signal_type else None),
                "text": s.rationale,
                "severity": ("med" if (s.risk_level or "med") == "medium" else (s.risk_level or "med")),
                "ts": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "",
            }
            for s in sigs
        ],
        "recommendations": [
            {"ext_id": r.ext_id, "title": r.title, "action": r.action, "strength": r.strength,
             "impact_one_line": r.impact_one_line, "confidence": r.confidence}
            for r in recs
        ],
    }


def _build_market_asset_detail(ticker: str) -> Optional[dict[str, Any]]:
    """Lightweight asset detail for non-portfolio symbols — built from MarketDataService.

    Returns the same top-level shape as build_asset_detail so the FE can render
    the asset panel consistently. Position, signals, and recommendations are empty
    because the symbol is not held or analysed.
    """
    from app.modules.assets.market_data import MarketDataService

    mds = MarketDataService()
    quote = mds.get_quote(ticker)
    if not quote:
        return None

    ohlcv = mds.get_ohlcv(ticker, days=60)
    price_series = [c["close"] for c in ohlcv]

    prev = quote.get("previous_close") or 0.0
    curr = quote.get("close") or 0.0
    day_pct = ((curr - prev) / prev) if prev > 0 else 0.0

    return {
        "ticker": ticker,
        "name": ticker,
        "class": "stocks",
        "tier": None,
        "price": curr,
        "dayPct": day_pct,
        "priceSeries": price_series,
        "priorActions": [],
        "position": None,
        "fundamentals": None,
        "signals": [],
        "recommendations": [],
    }


def build_portfolio_history(
    session: Session,
    user_id: Optional[int],
    days: int = 60,
) -> list[dict[str, Any]]:
    """Return daily portfolio net-worth (in USD) for the last *days* days.

    Strategy: for each calendar date in the window, sum (position.quantity *
    price_on_that_date) across all user positions.  Positions that don't have a
    price row for a given date use that asset's most-recent prior close instead
    (last-observation-carried-forward).  INR-denominated prices are converted to
    USD using the cached fx_rate so the output is consistent with netWorth.

    Returns a list sorted ascending by date:
        [{"date": "2024-12-01", "value": 1234.56}, ...]  (USD)

    Returns [] when the user has no positions or no price history exists.
    """
    from app.core.cache import cache
    from app.modules.portfolio.models import Asset, Position, PriceHistory
    from app.shared.utils import cache_key
    from sqlalchemy import or_

    fx_rate = float(cache.get(cache_key("fx", "usd_inr")) or 83.50)

    positions = (
        session.query(Position)
        .filter(or_(Position.user_id == user_id, Position.user_id.is_(None)), Position.quantity > 0)
        .all()
    )
    if not positions:
        return []

    asset_ids = [p.asset_id for p in positions]
    qty_map = {p.asset_id: float(p.quantity) for p in positions}

    # Build per-asset currency map in one query
    currency_map = {
        a.id: (a.currency or "INR")
        for a in session.query(Asset).filter(Asset.id.in_(asset_ids)).all()
    }

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        session.query(PriceHistory.asset_id, PriceHistory.date, PriceHistory.close)
        .filter(
            PriceHistory.asset_id.in_(asset_ids),
            PriceHistory.date >= cutoff,
        )
        .order_by(PriceHistory.asset_id, PriceHistory.date)
        .all()
    )
    if not rows:
        # No price history — return a single snapshot using current_price from Asset
        total = 0.0
        for p in positions:
            asset = session.get(Asset, p.asset_id)
            if asset and asset.current_price:
                raw = float(asset.current_price)
                usd = raw if currency_map.get(p.asset_id) == "USD" else raw / fx_rate
                total += float(p.quantity) * usd
        if total > 0:
            return [{"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "value": round(total, 2)}]
        return []

    # Build {asset_id: sorted[(date, close), ...]}
    from collections import defaultdict
    price_series: dict[int, list[tuple[datetime, float]]] = defaultdict(list)
    for asset_id, date, close in rows:
        price_series[asset_id].append((date, float(close)))

    # Collect every unique date across all assets
    all_dates: list[datetime] = sorted({r[1] for r in rows})

    result: list[dict[str, Any]] = []
    last_price: dict[int, float] = {}  # last known price per asset (LOCF), in native currency

    for date in all_dates:
        daily_value = 0.0
        for asset_id in asset_ids:
            series = price_series.get(asset_id, [])
            price = None
            for d, c in series:
                if d <= date:
                    price = c
                elif price is not None:
                    break
            if price is not None:
                last_price[asset_id] = price
            used_price = last_price.get(asset_id)
            if used_price is not None:
                # Normalise to USD: INR assets are divided by fx_rate
                usd_price = used_price if currency_map.get(asset_id) == "USD" else used_price / fx_rate
                daily_value += qty_map[asset_id] * usd_price

        if daily_value > 0:
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "value": round(daily_value, 2),
            })

    return result


def ask_about_context(
    session: Session,
    context_type: str,
    context_id: str,
    question: str,
    user_id: Optional[int] = None,
) -> str:
    import json as _json
    from app.modules.analytics.ai_service import build_ai_service

    if context_type == "signal":
        from app.modules.signals.models import Signal
        # Frontend sends "sg-{db_id}" — strip prefix before integer lookup
        raw_id = context_id.removeprefix("sg-")
        try:
            signal_pk = int(raw_id)
        except ValueError:
            raise ValueError(f"Invalid signal id: {context_id}")
        q = session.query(Signal).filter(Signal.id == signal_pk)
        if user_id:
            q = q.filter(Signal.user_id == user_id)
        obj = q.first()
        if not obj:
            raise ValueError(f"Signal {context_id} not found")
        context_data = {
            "symbol": obj.symbol,
            "action": obj.signal_type.value if obj.signal_type else None,
            "confidence": obj.confidence,
            "rationale": obj.rationale,
            "rsi": obj.rsi,
            "macd": obj.macd,
            "created_at": str(obj.created_at),
        }
    elif context_type == "recommendation":
        from app.modules.recommendations.models import Recommendation
        # Frontend sends ext_id strings like "r-tech" — look up by ext_id column
        q = session.query(Recommendation).filter(Recommendation.ext_id == context_id)
        if user_id:
            q = q.filter(Recommendation.user_id == user_id)
        obj = q.first()
        if not obj:
            raise ValueError(f"Recommendation {context_id} not found")
        context_data = {
            "ext_id": obj.ext_id,
            "title": obj.title,
            "action": obj.action,
            "scope_kind": obj.scope_kind,
            "scope_ref": obj.scope_ref,
            "confidence": obj.confidence,
            "impact_one_line": obj.impact_one_line,
            "reasoning": obj.reasoning,
            "created_at": str(obj.created_at),
        }
    else:
        raise ValueError(f"Unknown context_type: {context_type}")

    from app.modules.portfolio.providers.credential_manager import CredentialManager
    cred_manager = CredentialManager(session)
    ai = build_ai_service(cred_manager)
    context_str = _json.dumps(context_data, default=str)
    return ai.answer_question(context=context_str, question=question)
