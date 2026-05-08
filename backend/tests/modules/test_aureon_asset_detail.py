"""Tests for build_asset_detail prior-action markers (Phase 3)."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.modules.aureon.services import build_asset_detail
from app.modules.portfolio.models import Asset, PriceHistory, Transaction
from app.modules.recommendations.models import Recommendation


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


def _seed_price_history(session, asset, days=30):
    today = datetime.utcnow().replace(microsecond=0)
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        session.add(PriceHistory(asset_id=asset.id, date=d, close=100 + i))
    session.commit()


def test_returns_none_for_missing_asset(session):
    assert build_asset_detail(session, "DOES-NOT-EXIST") is None


def test_priorActions_includes_transactions(session):
    a = Asset(symbol="NVDA", name="NVIDIA", asset_type="equity", tier="active")
    session.add(a);
    session.commit()
    _seed_price_history(session, a, days=30)
    txn_date = datetime.utcnow() - timedelta(days=10)
    session.add(Transaction(
        asset_id=a.id, transaction_type="buy", quantity=10, price=120,
        total_value=1200, transaction_date=txn_date, kind="trade",
    ))
    session.commit()

    detail = build_asset_detail(session, "NVDA")
    assert detail is not None
    assert len(detail["priceSeries"]) == 30
    assert "priorActions" in detail
    assert any(p["kind"] == "trade" for p in detail["priorActions"])
    marker = next(p for p in detail["priorActions"] if p["kind"] == "trade")
    assert marker["i"] is not None and 0 <= marker["i"] < 30
    assert marker["label"].startswith("Buy")


def test_priorActions_includes_dismissed_recs(session):
    a = Asset(symbol="BTC", name="Bitcoin", asset_type="crypto", tier="active")
    session.add(a);
    session.commit()
    _seed_price_history(session, a, days=20)
    rec = Recommendation(
        ext_id="r-btc-trim", status="dismissed", strength="recommended", action="Reduce",
        scope_kind="asset", scope_ref="BTC", title="Trim BTC",
        dismissed_at=datetime.utcnow() - timedelta(days=5),
    )
    session.add(rec);
    session.commit()

    detail = build_asset_detail(session, "BTC")
    kinds = {p["kind"] for p in detail["priorActions"]}
    assert "dismissed" in kinds


def test_priorActions_empty_when_no_history(session):
    a = Asset(symbol="X", name="X Co", asset_type="equity", tier="active")
    session.add(a);
    session.commit()
    _seed_price_history(session, a, days=10)
    detail = build_asset_detail(session, "X")
    assert detail["priorActions"] == []
