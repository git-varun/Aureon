"""Celery tasks for fixed-return and illiquid asset lifecycle management."""

import logging
from datetime import date, datetime, timezone

from app.core.celery_app import celery_app
from app.core.db import SessionLocal

logger = logging.getLogger("celery.fixed_return")


@celery_app.task(bind=True, name="portfolio.accrue_epf", max_retries=1)
def accrue_epf_task(self):
    """Credit monthly EPF/PPF contributions and compute interest accrual.

    Runs 1st of each month. Writes an AccrualLedger row per EPF/PPF asset
    and updates the position's current_value.
    """
    session = None
    try:
        from app.modules.portfolio.models import Asset, AccrualLedger, Position
        from app.shared.constants import AssetType

        session = SessionLocal()
        assets = session.query(Asset).filter(
            Asset.asset_type.in_([AssetType.EPF.value, AssetType.PPF.value]),
            Asset.is_tradeable.is_(False),
            Asset.is_active.is_(True),
        ).all()

        today = date.today()
        period_start = date(today.year, today.month, 1)

        credited = 0
        for asset in assets:
            try:
                metadata = asset.asset_metadata or {}
                rate = float(metadata.get("interest_rate", 8.15)) / 100.0
                employee = float(metadata.get("employee_monthly", 0.0))
                employer = float(metadata.get("employer_monthly", 0.0))
                vpf = float(metadata.get("vpf_monthly", 0.0))
                monthly_contribution = employee + employer + vpf

                if monthly_contribution <= 0:
                    continue

                # Latest running total from ledger
                last = (
                    session.query(AccrualLedger)
                    .filter(AccrualLedger.asset_id == asset.id)
                    .order_by(AccrualLedger.period_end.desc())
                    .first()
                )
                corpus_before = float(last.running_total) if last else 0.0

                # Monthly interest on existing corpus
                monthly_interest = corpus_before * (rate / 12)
                amount = monthly_contribution + monthly_interest
                running_total = corpus_before + amount

                # Idempotent: skip if already credited for this period
                existing = (
                    session.query(AccrualLedger)
                    .filter(
                        AccrualLedger.asset_id == asset.id,
                        AccrualLedger.period_start == period_start,
                        AccrualLedger.accrual_type == "contribution",
                    )
                    .first()
                )
                if existing:
                    logger.debug("accrue_epf: already credited for %s period=%s", asset.symbol, period_start)
                    continue

                session.add(AccrualLedger(
                    asset_id=asset.id,
                    accrual_type="contribution",
                    period_start=period_start,
                    period_end=today,
                    amount=round(amount, 2),
                    rate_used=rate,
                    running_total=round(running_total, 2),
                ))

                # Update positions: advance cost basis by the new contribution only
                # (not interest), so pnl reflects accumulated interest rather than
                # treating contributions as unrealized profit.
                for pos in session.query(Position).filter(Position.asset_id == asset.id).all():
                    qty = float(pos.quantity or 1)
                    old_contributions = float(pos.avg_buy_price or 0) * qty
                    new_contributions = old_contributions + monthly_contribution
                    pos.avg_buy_price = round(new_contributions / qty, 4)
                    pos.current_value = round(running_total, 2)
                    pos.pnl = round(running_total - new_contributions, 2)
                    pos.pnl_percent = round(pos.pnl / new_contributions * 100, 4) if new_contributions > 0 else 0.0
                    pos.last_valued_at = datetime.now(timezone.utc)

                session.commit()
                credited += 1
                logger.info("accrue_epf: credited asset_id=%s corpus=%.2f", asset.id, running_total)

            except Exception as exc:
                session.rollback()
                logger.warning("accrue_epf: failed for asset_id=%s: %s", asset.id, exc)

        return {"status": "success", "credited": credited}

    except Exception as exc:
        logger.exception("accrue_epf_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="portfolio.bond_mtm", max_retries=1)
def bond_mtm_task(self, symbol: str = None):
    """Update bond positions using market price (yfinance) or accrual fallback.

    Runs weekdays at 09:30. Optionally targets a single symbol.
    """
    session = None
    try:
        from app.modules.portfolio.models import Asset, AssetValuation, Position
        from app.modules.valuation.factory import get_valuation_provider
        from app.shared.constants import AssetType

        session = SessionLocal()
        query = session.query(Asset).filter(
            Asset.asset_type == AssetType.BOND.value,
            Asset.is_tradeable.is_(False),
            Asset.is_active.is_(True),
        )
        if symbol:
            query = query.filter(Asset.symbol == symbol)
        assets = query.all()

        updated = 0
        for asset in assets:
            try:
                provider = get_valuation_provider("bond", session)
                if not provider:
                    logger.warning("bond_mtm: no valuation provider for bonds, skipping %s", asset.symbol)
                    continue

                metadata = asset.asset_metadata or {}
                value = provider.compute_current_value(metadata, [])

                positions = session.query(Position).filter(Position.asset_id == asset.id).all()
                if not positions:
                    continue
                total_qty = 0.0
                for pos in positions:
                    pos.current_value = round(value * float(pos.quantity), 2)
                    pos.last_valued_at = datetime.now(timezone.utc)
                    total_qty += float(pos.quantity)

                asset.current_price = round(value, 4)
                session.add(AssetValuation(
                    asset_id=asset.id,
                    valuation_amount=round(value * total_qty, 2),
                    valuation_date=date.today(),
                    valuation_method="accrual",
                ))
                session.commit()
                updated += 1
                logger.info("bond_mtm: asset_id=%s symbol=%s value=%.4f", asset.id, asset.symbol, value)

            except Exception as exc:
                session.rollback()
                logger.warning("bond_mtm: failed for %s: %s", asset.symbol, exc)

        return {"status": "success", "updated": updated}

    except Exception as exc:
        logger.exception("bond_mtm_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=120)
    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="portfolio.insurance_premium", max_retries=1)
def insurance_premium_task(self):
    """Update ULIP values via NAV and flag premium due dates.

    Runs weekly on Monday. Updates current_value for ULIP sub-type using
    nav × units from metadata. Non-ULIP insurance positions are not updated
    (value = 0 for term, sum_assured proxy for endowment).
    """
    session = None
    try:
        from app.modules.portfolio.models import Asset, AssetValuation, Position
        from app.modules.valuation.factory import get_valuation_provider
        from app.shared.constants import AssetType

        session = SessionLocal()
        assets = session.query(Asset).filter(
            Asset.asset_type == AssetType.INSURANCE.value,
            Asset.is_active.is_(True),
        ).all()

        updated = 0
        for asset in assets:
            try:
                metadata = asset.asset_metadata or {}
                provider = get_valuation_provider("insurance", session)
                if not provider:
                    continue

                value = provider.compute_current_value(metadata, [])
                if value <= 0:
                    continue  # term/health — no economic value to track

                for pos in session.query(Position).filter(Position.asset_id == asset.id).all():
                    pos.current_value = round(value, 2)
                    pos.last_valued_at = datetime.now(timezone.utc)

                session.add(AssetValuation(
                    asset_id=asset.id,
                    valuation_amount=round(value, 2),
                    valuation_date=date.today(),
                    valuation_method="api_estimate",
                ))
                session.commit()
                updated += 1
                logger.info("insurance_premium: asset_id=%s value=%.2f", asset.id, value)

            except Exception as exc:
                session.rollback()
                logger.warning("insurance_premium: failed for %s: %s", asset.symbol, exc)

        return {"status": "success", "updated": updated}

    except Exception as exc:
        logger.exception("insurance_premium_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="portfolio.accrue_eps", max_retries=1)
def accrue_eps_task(self):
    """Credit monthly EPS contributions (8.33% × min(pensionable_salary, 15000)).

    Runs 1st of each month. Writes an AccrualLedger row per EPS asset and updates
    the position's current_value. No interest is applied — EPS corpus is the
    running sum of employer contributions, not an interest-bearing account.
    """
    session = None
    try:
        from app.modules.portfolio.models import AccrualLedger, Asset, Position
        from app.modules.valuation.providers.eps import EPSValuationProvider
        from app.shared.constants import AssetType

        session = SessionLocal()
        assets = session.query(Asset).filter(
            Asset.asset_type == AssetType.EPS.value,
            Asset.is_tradeable.is_(False),
            Asset.is_active.is_(True),
        ).all()

        today = date.today()
        period_start = date(today.year, today.month, 1)
        provider = EPSValuationProvider()

        credited = 0
        for asset in assets:
            try:
                metadata = asset.asset_metadata or {}
                monthly = provider._monthly_contribution(metadata)

                if monthly <= 0:
                    logger.debug("accrue_eps: skipping asset_id=%s — zero monthly contribution", asset.id)
                    continue

                # Idempotent: skip if already credited this period
                existing = (
                    session.query(AccrualLedger)
                    .filter(
                        AccrualLedger.asset_id == asset.id,
                        AccrualLedger.period_start == period_start,
                        AccrualLedger.accrual_type == "contribution",
                    )
                    .first()
                )
                if existing:
                    logger.debug("accrue_eps: already credited asset_id=%s period=%s", asset.id, period_start)
                    continue

                # Running total from latest ledger row
                last = (
                    session.query(AccrualLedger)
                    .filter(AccrualLedger.asset_id == asset.id)
                    .order_by(AccrualLedger.period_end.desc())
                    .first()
                )
                corpus_before = float(last.running_total) if last else 0.0
                running_total = round(corpus_before + monthly, 2)

                session.add(AccrualLedger(
                    asset_id=asset.id,
                    accrual_type="contribution",
                    period_start=period_start,
                    period_end=today,
                    amount=round(monthly, 2),
                    rate_used=0.0833,
                    running_total=running_total,
                ))

                # EPS has no interest — the entire amount is an employer contribution.
                # Advance cost basis by the monthly amount so pnl stays near zero.
                for pos in session.query(Position).filter(Position.asset_id == asset.id).all():
                    qty = float(pos.quantity or 1)
                    old_contributions = float(pos.avg_buy_price or 0) * qty
                    new_contributions = old_contributions + monthly
                    pos.avg_buy_price = round(new_contributions / qty, 4)
                    pos.current_value = running_total
                    pos.pnl = round(running_total - new_contributions, 2)
                    pos.pnl_percent = round(pos.pnl / new_contributions * 100, 4) if new_contributions > 0 else 0.0
                    pos.last_valued_at = datetime.now(timezone.utc)

                session.commit()
                credited += 1
                logger.info("accrue_eps: credited asset_id=%s corpus=%.2f", asset.id, running_total)

            except Exception as exc:
                session.rollback()
                logger.warning("accrue_eps: failed for asset_id=%s: %s", asset.id, exc)

        return {"status": "success", "credited": credited}

    except Exception as exc:
        logger.exception("accrue_eps_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()


@celery_app.task(bind=True, name="portfolio.sync_nps", max_retries=1)
def sync_nps_task(self):
    """Propagate manually-entered NPS balance from metadata to pos.current_value.

    NPS has no auto-accrual — the user updates asset_metadata.balance manually.
    This task syncs that balance to Position.current_value so the UI stays current.
    Runs weekly on Sunday.
    """
    session = None
    try:
        from app.modules.portfolio.models import Asset, Position
        from app.modules.valuation.factory import get_valuation_provider
        from app.shared.constants import AssetType

        session = SessionLocal()
        assets = session.query(Asset).filter(
            Asset.asset_type == AssetType.NPS.value,
            Asset.is_active.is_(True),
        ).all()

        updated = 0
        for asset in assets:
            try:
                provider = get_valuation_provider("nps", session)
                if not provider:
                    continue

                metadata = asset.asset_metadata or {}
                value = provider.compute_current_value(metadata, [])
                if value <= 0:
                    continue

                positions = session.query(Position).filter(Position.asset_id == asset.id).all()
                if not positions:
                    continue

                for pos in positions:
                    pos.current_value = round(value, 2)
                    pos.last_valued_at = datetime.now(timezone.utc)

                session.commit()
                updated += 1
                logger.info("sync_nps: asset_id=%s value=%.2f", asset.id, value)

            except Exception as exc:
                session.rollback()
                logger.warning("sync_nps: failed for %s: %s", asset.symbol, exc)

        return {"status": "success", "updated": updated}

    except Exception as exc:
        logger.exception("sync_nps_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        if session:
            session.close()
