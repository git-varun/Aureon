"""Tests for AllocationTarget service."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.modules.config.services import ConfigService


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


def test_seed_defaults_inserts_aureon_class_targets(session):
    ConfigService.seed_defaults(session)
    targets = {t["asset_class"]: t["target_pct"] for t in ConfigService(session).list_allocation_targets()}
    # Must match Aureon FE CLASS_TARGET keys
    assert set(targets) == {"stocks", "crypto", "funds", "bonds", "real_estate", "retirement", "insurance"}
    assert targets["stocks"] == pytest.approx(0.46, rel=1e-4)
    assert targets["crypto"] == pytest.approx(0.07, rel=1e-4)


def test_upsert_creates_then_updates(session):
    svc = ConfigService(session)
    out = svc.upsert_allocation_target("stocks", target_pct=0.50)
    assert out["target_pct"] == pytest.approx(0.50, rel=1e-4)

    out2 = svc.upsert_allocation_target("stocks", target_pct=0.40, band_low_pct=0.35, band_high_pct=0.45)
    assert out2["target_pct"] == pytest.approx(0.40, rel=1e-4)
    assert out2["band_low_pct"] == pytest.approx(0.35, rel=1e-4)
    assert out2["band_high_pct"] == pytest.approx(0.45, rel=1e-4)
