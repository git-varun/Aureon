"""Tests for the recommendations module (Aureon)."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.modules.recommendations.models import Recommendation
from app.modules.recommendations.services import DEFAULT_FIXTURES, RecommendationService
from app.shared.exceptions import NotFoundError, ValidationError


@pytest.fixture
def session():
    # Import all model modules so create_all sees every table the FKs reference.
    from app.modules.users import models  # noqa: F401
    from app.modules.portfolio import models as _p  # noqa: F401
    from app.modules.signals import models as _s  # noqa: F401
    from app.modules.config import models as _c  # noqa: F401
    from app.modules.news import models as _n  # noqa: F401
    from app.modules.notification import models as _nt  # noqa: F401
    from app.modules.analytics import models as _a  # noqa: F401

    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


class TestSeed:
    def test_seed_inserts_all_fixtures(self, session):
        inserted, skipped = RecommendationService.seed(session, DEFAULT_FIXTURES)
        assert inserted == len(DEFAULT_FIXTURES)
        assert skipped == 0

    def test_seed_is_idempotent(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        inserted, skipped = RecommendationService.seed(session, DEFAULT_FIXTURES)
        assert inserted == 0
        assert skipped == len(DEFAULT_FIXTURES)


class TestLifecycle:
    def test_apply_moves_active_to_applied(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        out = RecommendationService.apply(session, "r-tech")
        assert out["status"] == "applied"
        assert out["applied_at"] is not None

    def test_dismiss_records_reason(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        out = RecommendationService.dismiss(session, "r-harvest", reason="Wash sale risk")
        assert out["status"] == "dismissed"
        assert out["dismissed_at"] is not None

    def test_undo_returns_to_active(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        RecommendationService.apply(session, "r-tech")
        out = RecommendationService.undo(session, "r-tech")
        assert out["status"] == "active"
        assert out["applied_at"] is None

    def test_apply_blocked_by_active_conflict(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        # r-nvda-trim conflicts with r-nvda-hold; both start active
        with pytest.raises(ValidationError):
            RecommendationService.apply(session, "r-nvda-trim")

    def test_apply_unblocked_after_conflict_dismissed(self, session):
        RecommendationService.seed(session, DEFAULT_FIXTURES)
        RecommendationService.dismiss(session, "r-nvda-hold")
        out = RecommendationService.apply(session, "r-nvda-trim")
        assert out["status"] == "applied"

    def test_get_unknown_raises(self, session):
        with pytest.raises(NotFoundError):
            RecommendationService.get_by_ext_id(session, "does-not-exist")


class TestModelValidators:
    def test_invalid_status_rejected(self, session):
        with pytest.raises(ValueError):
            Recommendation(
                ext_id="x", status="bogus", strength="recommended", action="Reduce",
                scope_kind="asset", title="X",
            )

    def test_invalid_strength_rejected(self, session):
        with pytest.raises(ValueError):
            Recommendation(
                ext_id="x", status="active", strength="huh", action="Reduce",
                scope_kind="asset", title="X",
            )
