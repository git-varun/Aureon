"""Tests for Asset.tier column + AssetTier enum."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.modules.portfolio.models import Asset
from app.shared.constants import AssetTier


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


def test_enum_values_match_aureon():
    assert {m.value for m in AssetTier} == {"active", "semi", "passive"}


def test_tier_accepts_valid_value(session):
    a = Asset(symbol="NVDA", name="NVIDIA", asset_type="equity", tier="active")
    session.add(a);
    session.commit()
    assert a.tier == "active"


def test_tier_accepts_null(session):
    a = Asset(symbol="X", name="X Co", asset_type="equity")
    session.add(a);
    session.commit()
    assert a.tier is None


def test_tier_rejects_bogus_value():
    with pytest.raises(ValueError, match="Invalid tier"):
        Asset(symbol="Y", name="Y Co", asset_type="equity", tier="aggressive")
