"""Tests for Phase 3 Signal → Recommendation materializer."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.modules.recommendations.materializer import (
    CONFIDENCE_THRESHOLD,
    materialize_from_signals,
)
from app.modules.recommendations.models import Recommendation
from app.modules.signals.models import Signal
from app.shared.constants import SignalType, TimeFrame


@pytest.fixture
def session():
    from app.modules.users import models  # noqa: F401
    from app.modules.portfolio import models as _p  # noqa: F401
    from app.modules.signals import models as _s  # noqa: F401
    from app.modules.config import models as _c  # noqa: F401
    from app.modules.news import models as _n  # noqa: F401
    from app.modules.notification import models as _nt  # noqa: F401
    from app.modules.analytics import models as _a  # noqa: F401
    from app.modules.recommendations import models as _r  # noqa: F401

    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _mk_signal(symbol, signal_type, conf, status="active", rationale="momentum positive"):
    return Signal(
        symbol=symbol, signal_type=signal_type, timeframe=TimeFrame.SHORT_TERM,
        confidence=conf, status=status, rationale=rationale,
    )


def test_buy_signal_above_threshold_creates_rec(session):
    session.add(_mk_signal("NVDA", SignalType.BUY, 0.80))
    session.commit()
    out = materialize_from_signals(session)
    assert out["created"] == 1
    rec = session.query(Recommendation).filter_by(ext_id="sg-nvda-add").one()
    assert rec.action == "Add"
    assert rec.scope_kind == "asset" and rec.scope_ref == "NVDA"
    assert rec.confidence == 80
    assert rec.strength == "recommended"


def test_sell_signal_creates_reduce_rec(session):
    session.add(_mk_signal("BTC", SignalType.SELL, 0.70, rationale="vol spike"))
    session.commit()
    out = materialize_from_signals(session)
    assert out["created"] == 1
    rec = session.query(Recommendation).filter_by(ext_id="sg-btc-reduce").one()
    assert rec.action == "Reduce"
    assert rec.strength == "consider"  # 70 < 80


def test_below_threshold_skipped(session):
    session.add(_mk_signal("AAPL", SignalType.BUY, 0.50))
    session.commit()
    out = materialize_from_signals(session)
    assert out["created"] == 0 and out["skipped"] == 1


def test_neutral_signal_ignored(session):
    session.add(_mk_signal("MSFT", SignalType.NEUTRAL, 0.95))
    session.commit()
    out = materialize_from_signals(session)
    assert out["created"] == 0
    assert session.query(Recommendation).count() == 0


def test_idempotent_upsert_updates_existing(session):
    session.add(_mk_signal("NVDA", SignalType.BUY, 0.70))
    session.commit()
    materialize_from_signals(session)
    # Second pass with stronger confidence — should update, not duplicate.
    s2 = _mk_signal("NVDA", SignalType.BUY, 0.90, rationale="trend strengthening")
    session.add(s2);
    session.commit()
    out = materialize_from_signals(session)
    assert out["updated"] >= 1
    recs = session.query(Recommendation).filter_by(scope_ref="NVDA").all()
    assert len(recs) == 1
    assert recs[0].confidence == 90
    assert recs[0].strength == "recommended"


def test_dismissed_rec_reactivates_on_new_signal(session):
    session.add(_mk_signal("NVDA", SignalType.BUY, 0.80))
    session.commit()
    materialize_from_signals(session)
    rec = session.query(Recommendation).filter_by(ext_id="sg-nvda-add").one()
    rec.status = "dismissed"
    session.commit()
    # New signal arrives — materializer should reactivate.
    session.add(_mk_signal("NVDA", SignalType.BUY, 0.85))
    session.commit()
    materialize_from_signals(session)
    session.refresh(rec)
    assert rec.status == "active"


def test_threshold_default():
    assert CONFIDENCE_THRESHOLD == 65
