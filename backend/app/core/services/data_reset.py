import uuid
from typing import Any, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.core.redis import (
    invalidate_intelligence_dashboard,
    invalidate_intelligence_outcomes,
    invalidate_intelligence_recommendations,
    invalidate_org_recommendations,
    is_reset_in_progress,
    release_reset_lock,
    try_acquire_reset_lock,
)
from app.core.services.audit import log_audit_action
from app.modules.ai.entities.ai import AIBriefing, AIEvaluation, AIFeedback, AIGeneration
from app.modules.ai.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.modules.ai.services.recommendation import RECOMMENDATIONS_CACHE_KEY
from app.modules.market.entities.market import MarketTheme, ThemeWeight
from app.modules.market.repositories.watchlist import WatchlistsRepository
from app.modules.portfolio.services.portfolio import PortfolioService

# Reset lock TTL: covers the slowest realistic scope (portfolio, N portfolios x
# CASCADE delete) with headroom; a worker process dying mid-reset can't wedge
# ingestion jobs skipped forever since the lock expires either way.
RESET_LOCK_TTL_SECONDS = 120

FUTURES_POSITIONS_WARNING = (
    "Futures positions have no backing transaction ledger — they cannot be "
    "restored from backup. Recovery is re-syncing Binance (credentials survive "
    "the reset)."
)

SCOPES = (
    "portfolio",
    "watchlists",
    "ai_history",
    "recommendation_history",
    "custom_themes",
)


class DataResetService:
    """Data-only reset per DATA_RESET_SCOPE.md — five independently selectable
    scopes (§4, minus scope 5 "market reference data": narrow reset only, per
    the approved decision that excludes market/news/evaluation entirely).
    Never touches system.users, system.user_preferences, config.* (job_logs
    excepted... actually job_logs isn't cleared here either, out of scope for
    this pass), or system.audit_logs.

    Each scope has a single "_count_X" method that is the one source of truth
    for what belongs to that scope — both `preview()` (read-only) and
    `reset()` (count-then-delete) call it, so the confirmation screen's
    numbers and the actual delete can never drift apart.
    """

    def __init__(
        self,
        db: Session,
        portfolio_service: PortfolioService,
        watchlists_repo: WatchlistsRepository,
    ):
        self.db = db
        self.portfolio_service = portfolio_service
        self.watchlists_repo = watchlists_repo

    def _validate_scopes(self, scopes: list[str]) -> None:
        unknown = set(scopes) - set(SCOPES)
        if unknown:
            raise ValidationError(f"Unknown reset scope(s): {sorted(unknown)}")
        if not scopes:
            raise ValidationError("At least one scope must be selected")

    def preview(self, scopes: list[str], owner_id: uuid.UUID) -> dict[str, Any]:
        """Read-only row counts per scope — no deletes, no lock acquisition
        beyond checking one isn't already held elsewhere. Rejects while a
        reset is in progress since counts would be mid-flux."""
        self._validate_scopes(scopes)
        if is_reset_in_progress():
            raise ValidationError(
                "A reset is currently in progress — counts would be inaccurate, try again shortly"
            )

        results: dict[str, Any] = {}
        if "portfolio" in scopes:
            results["portfolio"] = self._count_portfolio()
        if "watchlists" in scopes:
            results["watchlists"] = self._count_watchlists(owner_id)
        if "ai_history" in scopes:
            results["ai_history"] = self._count_ai_history()
        if "recommendation_history" in scopes:
            results["recommendation_history"] = self._count_recommendation_history()
        if "custom_themes" in scopes:
            results["custom_themes"] = self._count_custom_themes(owner_id)
        return results

    def reset(
        self,
        scopes: list[str],
        owner_id: uuid.UUID,
        actor_id: Optional[uuid.UUID] = None,
    ) -> dict[str, Any]:
        self._validate_scopes(scopes)

        token = str(uuid.uuid4())
        if not try_acquire_reset_lock(token, RESET_LOCK_TTL_SECONDS):
            raise ValidationError(
                "A reset is already in progress — try again once it completes"
            )

        try:
            results: dict[str, Any] = {}
            # Order follows DATA_RESET_SCOPE.md §2.4 (steps 4-8), minus the
            # market-reference steps 1-3 which are out of scope by decision.
            if "portfolio" in scopes:
                results["portfolio"] = self._reset_portfolio()
            if "recommendation_history" in scopes:
                results["recommendation_history"] = self._reset_recommendation_history()
            if "watchlists" in scopes:
                results["watchlists"] = self._reset_watchlists(owner_id)
            if "ai_history" in scopes:
                results["ai_history"] = self._reset_ai_history()
            if "custom_themes" in scopes:
                results["custom_themes"] = self._reset_custom_themes(owner_id)

            log_audit_action(
                self.db,
                action="data_reset",
                entity_type="system",
                actor_id=actor_id,
                details={"scopes": scopes, "results": results},
            )
            self.db.commit()
            return results
        finally:
            release_reset_lock(token)

    # --- portfolio ---------------------------------------------------------

    def _count_portfolio(self) -> dict[str, Any]:
        portfolios = self.portfolio_service.list_portfolios()
        transactions = 0
        positions = 0
        futures_positions = 0
        snapshots = 0
        for p in portfolios:
            transactions += len(self.portfolio_service.transactions_repo.get_by_portfolio(p.id))
            portfolio_positions = self.portfolio_service.positions_repo.get_by_portfolio(p.id)
            positions += len(portfolio_positions)
            futures_positions += len([pos for pos in portfolio_positions if pos.wallet != "spot"])
            if self.portfolio_service.snapshot_repo.get(p.id) is not None:
                snapshots += 1

        return {
            "portfolios": len(portfolios),
            "transactions": transactions,
            "positions": positions,
            "futures_positions": futures_positions,
            "snapshots": snapshots,
            # Surfaced here too (not just on the delete response) so a confirmation
            # screen built off preview() discloses the recovery caveat before the
            # irreversible click, not just after — DATA_RESET_SCOPE.md §6's
            # "disclosed, not silent" requirement applies pre-confirm.
            "warning": FUTURES_POSITIONS_WARNING if futures_positions else None,
        }

    def _reset_portfolio(self) -> dict[str, Any]:
        counts = self._count_portfolio()
        portfolios = self.portfolio_service.list_portfolios()
        for p in portfolios:
            self.portfolio_service.delete_portfolio(p.id)
            invalidate_intelligence_recommendations(str(p.id))
            invalidate_intelligence_outcomes(str(p.id))
            invalidate_intelligence_dashboard(str(p.id))

        return {
            "portfolios_cleared": counts["portfolios"],
            "transactions_cleared": counts["transactions"],
            "positions_cleared": counts["positions"],
            "futures_positions_cleared": counts["futures_positions"],
            "warning": counts["warning"],
        }

    # --- watchlists ----------------------------------------------------------

    def _count_watchlists(self, owner_id: uuid.UUID) -> dict[str, Any]:
        watchlists = self.watchlists_repo.list_by_user(owner_id)
        symbols = sum(len(w.symbols) for w in watchlists)
        return {"watchlists": len(watchlists), "symbols": symbols}

    def _reset_watchlists(self, owner_id: uuid.UUID) -> dict[str, Any]:
        counts = self._count_watchlists(owner_id)
        for w in self.watchlists_repo.list_by_user(owner_id):
            self.watchlists_repo.delete(w)
        self.db.flush()
        return {"watchlists_cleared": counts["watchlists"], "symbols_cleared": counts["symbols"]}

    # --- ai_history ----------------------------------------------------------

    def _count_ai_history(self) -> dict[str, Any]:
        generation_ids = self.db.execute(select(AIGeneration.id)).scalars().all()
        evaluations = (
            self.db.scalar(
                select(func.count()).select_from(AIEvaluation).where(
                    AIEvaluation.generation_id.in_(generation_ids)
                )
            )
            if generation_ids
            else 0
        )
        feedback = (
            self.db.scalar(
                select(func.count()).select_from(AIFeedback).where(
                    AIFeedback.generation_id.in_(generation_ids)
                )
            )
            if generation_ids
            else 0
        )
        briefings = self.db.scalar(select(func.count()).select_from(AIBriefing))

        return {
            "ai_generations": len(generation_ids),
            "ai_evaluations": evaluations,
            "ai_feedback": feedback,
            "ai_briefings": briefings,
        }

    def _reset_ai_history(self) -> dict[str, Any]:
        counts = self._count_ai_history()

        # CASCADE from ai_generations covers ai_evaluations/ai_feedback.
        self.db.execute(delete(AIGeneration))
        self.db.execute(delete(AIBriefing))
        self.db.flush()

        for p in self.portfolio_service.list_portfolios():
            invalidate_intelligence_dashboard(str(p.id))

        return {
            "ai_generations_cleared": counts["ai_generations"],
            "ai_evaluations_cleared": counts["ai_evaluations"],
            "ai_feedback_cleared": counts["ai_feedback"],
            "ai_briefings_cleared": counts["ai_briefings"],
        }

    # --- recommendation_history -----------------------------------------------

    def _count_recommendation_history(self) -> dict[str, Any]:
        recommendation_ids = self.db.execute(select(Recommendation.id)).scalars().all()
        explanations = (
            self.db.scalar(
                select(func.count()).select_from(RecommendationExplanation).where(
                    RecommendationExplanation.recommendation_id.in_(recommendation_ids)
                )
            )
            if recommendation_ids
            else 0
        )
        outcomes = (
            self.db.scalar(
                select(func.count()).select_from(RecommendationOutcome).where(
                    RecommendationOutcome.recommendation_id.in_(recommendation_ids)
                )
            )
            if recommendation_ids
            else 0
        )

        return {
            "recommendations": len(recommendation_ids),
            "recommendation_explanations": explanations,
            "recommendation_outcomes": outcomes,
        }

    def _reset_recommendation_history(self) -> dict[str, Any]:
        counts = self._count_recommendation_history()

        # CASCADE from recommendations covers explanations/outcomes;
        # transactions.recommendation_id goes SET NULL as a side effect.
        self.db.execute(delete(Recommendation))
        self.db.flush()

        invalidate_org_recommendations(RECOMMENDATIONS_CACHE_KEY)
        for p in self.portfolio_service.list_portfolios():
            invalidate_intelligence_recommendations(str(p.id))
            invalidate_intelligence_outcomes(str(p.id))
            invalidate_intelligence_dashboard(str(p.id))

        return {
            "recommendations_cleared": counts["recommendations"],
            "recommendation_explanations_cleared": counts["recommendation_explanations"],
            "recommendation_outcomes_cleared": counts["recommendation_outcomes"],
        }

    # --- custom_themes ---------------------------------------------------------

    def _count_custom_themes(self, owner_id: uuid.UUID) -> dict[str, Any]:
        theme_ids = self.db.execute(
            select(MarketTheme.theme_id).where(MarketTheme.owner_id == owner_id)
        ).scalars().all()
        weights = (
            self.db.scalar(
                select(func.count()).select_from(ThemeWeight).where(
                    ThemeWeight.theme_id.in_(theme_ids)
                )
            )
            if theme_ids
            else 0
        )
        return {"custom_themes": len(theme_ids), "theme_weights": weights}

    def _reset_custom_themes(self, owner_id: uuid.UUID) -> dict[str, Any]:
        counts = self._count_custom_themes(owner_id)
        themes = self.db.execute(
            select(MarketTheme).where(MarketTheme.owner_id == owner_id)
        ).scalars().all()
        theme_ids = [t.theme_id for t in themes]

        if theme_ids:
            self.db.execute(delete(ThemeWeight).where(ThemeWeight.theme_id.in_(theme_ids)))
        for t in themes:
            self.db.delete(t)
        self.db.flush()

        return {
            "custom_themes_cleared": counts["custom_themes"],
            "theme_weights_cleared": counts["theme_weights"],
        }
