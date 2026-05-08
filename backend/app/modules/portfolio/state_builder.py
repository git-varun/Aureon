"""Shared state payload builder used by /api/state and compute_state_task."""

import json
import logging
import math
import statistics as _stats
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy.orm import Session

logger = logging.getLogger("portfolio.state_builder")


def _safe_float(v, default=None):
    """Return float(v), or default if v is None / NaN / infinite."""
    if v is None:
        return default
    try:
        f = float(v)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return default


def build_state_payload(session: Session, cache, cache_key_fn: Callable) -> dict:
    """Assemble the /api/state response payload.

    Single source of truth — called by both the endpoint (cache-miss fallback)
    and compute_state_task (pre-compute path).
    """
    from app.modules.analytics.models import AIBriefing, Fundamentals, TechnicalIndicators
    from app.modules.news.models import News, NewsAsset
    from app.modules.portfolio.models import Asset, PriceHistory
    from app.modules.portfolio.services import PortfolioService
    from app.modules.signals.models import Signal
    from app.shared.quant import QuantEngine

    try:
        from app.modules.analytics.macro import DXYProvider, FearGreedProvider
        alt_metrics = {
            "fear_and_greed": FearGreedProvider().fetch(),
            "fii_proxy": DXYProvider().fetch(),
        }
    except Exception:
        alt_metrics = {
            "fear_and_greed": {"value": 50, "classification": "Neutral"},
            "fii_proxy": {"dxy_value": 100.0, "fii_trend": "UNKNOWN"},
        }

    fx_rate = cache.get(cache_key_fn("fx", "usd_inr")) or 83.50
    positions = PortfolioService(session).list_positions()

    if not positions:
        return {
            "status": "empty",
            "total_value_inr": 0,
            "fx_rate": fx_rate,
            "assets": [],
            "health": {"beta": 0.0, "allocation": {}, "correlation_matrix": {}},
            "briefing": None,
            "news": {},
            "alt_metrics": alt_metrics,
        }

    # Briefing: Redis cache → DB fallback
    briefing = cache.get(cache_key_fn("ai", "briefing"))
    if not briefing:
        db_briefing = (
            session.query(AIBriefing)
            .filter(AIBriefing.briefing_type == "global")
            .order_by(AIBriefing.created_at.desc())
            .first()
        )
        if db_briefing and db_briefing.content:
            try:
                briefing = json.loads(db_briefing.content)
            except Exception:
                briefing = None

    # News: group by asset symbol via news_assets junction (primary path).
    # Articles with no junction row fall into "GENERAL" (backward compat).
    news: dict = {}
    seen_news_ids: set = set()

    # Primary: news linked via junction table
    junction_rows = (
        session.query(News, Asset.symbol)
        .join(NewsAsset, NewsAsset.news_id == News.id)
        .join(Asset, Asset.id == NewsAsset.asset_id)
        .order_by(News.published_at.desc())
        .limit(120)
        .all()
    )
    for row, sym_key in junction_rows:
        seen_news_ids.add(row.id)
        news.setdefault(sym_key, [])
        sentiment = None
        if row.sentiment_score is not None:
            score = float(row.sentiment_score)
            bias = "POSITIVE" if score > 0.1 else "NEGATIVE" if score < -0.1 else "NEUTRAL"
            sentiment = {
                "bias": bias,
                "confidence": round(abs(score) * 100, 1),
                "impact_summary": row.summary or "No additional context available.",
            }
        news[sym_key].append({
            "id": row.id,
            "title": row.title,
            "snippet": row.summary,
            "link": row.url,
            "provider": row.source or "RSS",
            "sentiment": sentiment,
        })

    # Fallback: older articles not yet in junction table
    fallback_rows = (
        session.query(News)
        .filter(News.id.notin_(seen_news_ids) if seen_news_ids else News.id.isnot(None))
        .order_by(News.published_at.desc())
        .limit(30)
        .all()
    )
    for row in fallback_rows:
        sym_key = (row.symbols or "GENERAL").split(",")[0].strip() or "GENERAL"
        news.setdefault(sym_key, [])
        sentiment = None
        if row.sentiment_score is not None:
            score = float(row.sentiment_score)
            bias = "POSITIVE" if score > 0.1 else "NEGATIVE" if score < -0.1 else "NEUTRAL"
            sentiment = {
                "bias": bias,
                "confidence": round(abs(score) * 100, 1),
                "impact_summary": row.summary or "No additional context available.",
            }
        news[sym_key].append({
            "id": row.id,
            "title": row.title,
            "snippet": row.summary,
            "link": row.url,
            "provider": row.source or "RSS",
            "sentiment": sentiment,
        })

    symbols = [pos.asset.symbol for pos in positions if pos.asset]
    asset_ids = [pos.asset_id for pos in positions]

    # Technical indicators: latest per symbol (one query)
    tech_by_symbol: dict = {}
    if symbols:
        for row in (
                session.query(TechnicalIndicators)
                        .filter(TechnicalIndicators.symbol.in_(symbols))
                        .order_by(TechnicalIndicators.symbol, TechnicalIndicators.created_at.desc())
                        .all()
        ):
            if row.symbol not in tech_by_symbol:
                tech_by_symbol[row.symbol] = row

    # Signals: latest per symbol (one query)
    signals_by_symbol: dict = {}
    try:
        for row in (
                session.query(Signal)
                        .filter(Signal.symbol.in_(symbols))
                        .order_by(Signal.symbol, Signal.created_at.desc())
                        .all()
        ):
            if row.symbol not in signals_by_symbol:
                signals_by_symbol[row.symbol] = row
    except Exception as exc:
        logger.warning("signals query failed, continuing without signals: %s", exc)

    # Fundamentals (one query)
    fund_by_symbol: dict = {}
    if symbols:
        for row in session.query(Fundamentals).filter(Fundamentals.symbol.in_(symbols)).all():
            fund_by_symbol[row.symbol] = row

    # Price history: last 200 days (one query)
    cutoff = datetime.now(timezone.utc) - timedelta(days=200)
    prices_by_asset_id: dict = {}
    if asset_ids:
        for p in (
                session.query(PriceHistory)
                        .filter(PriceHistory.asset_id.in_(asset_ids), PriceHistory.date >= cutoff)
                        .order_by(PriceHistory.asset_id, PriceHistory.date)
                        .all()
        ):
            prices_by_asset_id.setdefault(p.asset_id, []).append(p)

    assets_out = []
    total_value = 0.0
    allocation: dict = {}

    for pos in positions:
        a = pos.asset
        if not a:
            continue
        value = _safe_float(pos.current_value, 0.0)
        total_value += value
        asset_type = (a.asset_type.value if hasattr(a.asset_type, "value") else str(
            a.asset_type)).lower() if a.asset_type else "equity"
        allocation[asset_type] = round(allocation.get(asset_type, 0.0) + value, 2)

        tech = tech_by_symbol.get(a.symbol)
        ph = prices_by_asset_id.get(a.id, [])
        sig = signals_by_symbol.get(a.symbol)

        # ATR% and Fibonacci from recent price history
        price_risk_pct = fib_618 = fib_382 = None
        if ph and len(ph) >= 14:
            closes = [_safe_float(p.close, 0.0) for p in ph]
            highs = [_safe_float(p.high or p.close, 0.0) for p in ph]
            lows = [_safe_float(p.low or p.close, 0.0) for p in ph]
            trs = [
                max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
                for i in range(1, len(ph))
            ]
            if trs:
                atr = sum(trs[-14:]) / min(14, len(trs))
                cur = closes[-1] or 1
                price_risk_pct = round((atr / cur) * 100, 2)
            if len(ph) >= 20:
                h120 = max(highs)
                l120 = min(lows)
                rng = h120 - l120
                if rng > 0:
                    fib_618 = round(h120 - 0.618 * rng, 2)
                    fib_382 = round(h120 - 0.382 * rng, 2)

        # Full technical analysis (Redis-cached per symbol)
        quant_result: dict = {}
        quant_ck = cache_key_fn("quant", a.symbol)
        cached_quant = cache.get(quant_ck)
        if cached_quant:
            quant_result = cached_quant
        elif ph and len(ph) >= 14:
            quant_result = QuantEngine().compute_all(ph)
            cache.set(quant_ck, quant_result, ttl=3600)

        macd_dict = quant_result.get("macd") or {}
        bb_dict = quant_result.get("bollinger") or {}
        momentum_rsi = quant_result.get("rsi_14")
        trend_strength = macd_dict.get("value")
        bb_upper = bb_dict.get("upper")
        bb_lower = bb_dict.get("lower")
        vwap_val = quant_result.get("vwap")
        sma_100 = quant_result.get("sma_100")
        ema_105 = quant_result.get("ema_105")
        atr_50_val = quant_result.get("atr_50")
        sma_200 = quant_result.get("sma_200")

        # DB fallback when QuantEngine had insufficient data
        if momentum_rsi is None and tech:   momentum_rsi = _safe_float(tech.rsi)
        if trend_strength is None and tech: trend_strength = _safe_float(tech.macd)
        if bb_upper is None and tech:       bb_upper = _safe_float(tech.bollinger_upper)
        if bb_lower is None and tech:       bb_lower = _safe_float(tech.bollinger_lower)
        if vwap_val is None and tech:       vwap_val = _safe_float(tech.vwap)

        # Signal metrics
        current_price = _safe_float(a.current_price, 0)
        bmsb_status = macro_tsl = target_1_2 = z_score = None

        if sma_100 and ema_105 and current_price:
            bmsb_status = (
                "ABOVE BAND (HOLD)" if current_price > sma_100 and current_price > ema_105
                else "BELOW BAND (RISK OFF)"
            )
        if atr_50_val and current_price:
            macro_tsl = round(current_price - 3.5 * atr_50_val, 2)
            target_1_2 = round(current_price + 2 * (current_price - macro_tsl), 2)
        if sma_200 and ph and len(ph) >= 200:
            closes_200 = [_safe_float(p.close, 0.0) for p in ph[-200:]]
            try:
                std_200 = _stats.stdev(closes_200)
                if std_200:
                    z_score = round((current_price - sma_200) / std_200, 2)
            except Exception as exc:
                logger.debug("z-score computation failed for %s: %s", a.symbol, exc)

        # Composite technical score
        score = 50
        if momentum_rsi is not None:
            if momentum_rsi > 70:
                score -= 10
            elif momentum_rsi < 30:
                score += 15
            elif momentum_rsi > 55:
                score += 7
            elif momentum_rsi < 45:
                score -= 7
        if trend_strength is not None:
            score += 10 if trend_strength > 0 else -10
        if bmsb_status and "ABOVE" in bmsb_status:
            score += 5
        technical_score = max(0, min(100, score))

        fund_cache = cache.get(cache_key_fn("fundamentals", a.symbol)) or {}
        fund_db = fund_by_symbol.get(a.symbol)
        pe_ratio = fund_cache.get("pe_ratio") or (_safe_float(fund_db.pe_ratio) if fund_db else None)
        graham_number = fund_cache.get("graham_number")

        assets_out.append({
            "symbol": a.symbol,
            "name": a.name,
            "type": asset_type,
            "sub_type": a.sub_type,
            "source": a.exchange,
            "qty": _safe_float(pos.quantity, 0),
            "avg_buy_price": _safe_float(pos.avg_buy_price, 0),
            "live_price": _safe_float(a.current_price, 0),
            "value_inr": value,
            "gross_value_inr": value,
            "pnl": _safe_float(pos.pnl, 0),
            "pnl_pct": _safe_float(pos.pnl_percent, 0),
            "tv_signal": sig.signal_type.value if sig and sig.signal_type else None,
            "momentum_rsi": momentum_rsi,
            "trend_strength": trend_strength,
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "vwap_volume_profile": vwap_val,
            "bmsb_status": bmsb_status,
            "macro_tsl": macro_tsl,
            "target_1_2": target_1_2,
            "z_score": z_score,
            "price_risk_pct": price_risk_pct,
            "fib_618": fib_618,
            "fib_382": fib_382,
            "technical_score": technical_score,
            "pe_ratio": pe_ratio,
            "graham_number": graham_number,
            "altman_z_score": None,
            "delivery_pct": None,
        })

    return {
        "status": "success",
        "total_value_inr": total_value,
        "fx_rate": fx_rate,
        "assets": assets_out,
        "health": {"beta": 0.0, "allocation": allocation, "correlation_matrix": {}},
        "briefing": briefing,
        "news": news,
        "alt_metrics": alt_metrics,
    }
