from app.core.services.base import BaseService
"""Portfolio domain services."""

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, NamedTuple, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.binance import STABLECOIN_ASSETS, WALLET_SUFFIXES, split_quote_asset
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import logger
from app.core.redis import (
    invalidate_intelligence_health,
    invalidate_intelligence_portfolio,
    invalidate_portfolio_snapshot,
)
from app.core.fx import to_inr
from app.modules.market.entities.market import Asset, LatestQuote, PriceHistory
from app.modules.market.services.market import ensure_asset_exists, infer_currency
from app.modules.portfolio.entities.portfolio import (
    Portfolio,
    PortfolioSnapshot,
    Position,
    Transaction,
)
from app.modules.portfolio.repositories.portfolio_snapshot import (
    PortfolioSnapshotRepository,
)
from app.modules.portfolio.repositories.portfolios import PortfoliosRepository
from app.modules.portfolio.repositories.positions import PositionsRepository
from app.modules.portfolio.repositories.transactions import TransactionsRepository

# Same live/fresh/stale bands as the frontend's MarketFreshnessSection
# THRESHOLDS.prices (5min/15min) — kept in sync intentionally, see Fix M.
_QUOTE_LIVE_SECONDS = 5 * 60
_QUOTE_FRESH_SECONDS = 15 * 60

# mutual_fund/nps NAVs update once daily (statement import or AMFI's daily
# publish), not continuously like equities/crypto — the 5min/15min bands
# would always read "stale" for data that's actually current by NAV standards.
_NAV_ASSET_CLASSES = {"mutual_fund", "nps"}
_NAV_LIVE_SECONDS = 24 * 60 * 60
_NAV_FRESH_SECONDS = 48 * 60 * 60


def _quote_age_status(updated_at: datetime, asset_class: Optional[str] = None) -> str:
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
    live_seconds, fresh_seconds = _QUOTE_LIVE_SECONDS, _QUOTE_FRESH_SECONDS
    if asset_class in _NAV_ASSET_CLASSES:
        live_seconds, fresh_seconds = _NAV_LIVE_SECONDS, _NAV_FRESH_SECONDS
    if age_seconds < live_seconds:
        return "live"
    if age_seconds < fresh_seconds:
        return "fresh"
    return "stale"


class PositionPrice(NamedTuple):
    price: Optional[float]
    price_source: str
    quote_age_status: Optional[str]
    quote_updated_at: Optional[datetime]
    epf_estimate_basis: Optional[Dict[str, Any]] = None
    currency: str = "USD"


_EPF_RATE_PROVIDER_NAME = "epf_interest_rates"


def _fy_label(d: datetime) -> str:
    """EPFO's financial year runs April-March; label as "start-end", e.g. April
    2023-March 2024 is "2023-2024" (matches EPF_ESTIMATE_SCOPE.md §4's config shape)."""
    start_year = d.year if d.month >= 4 else d.year - 1
    return f"{start_year}-{start_year + 1}"


def _month_start(d: datetime) -> datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_month(d: datetime) -> datetime:
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1)
    return d.replace(month=d.month + 1)


def _estimate_epf_price(session: Session, pos: Position) -> PositionPrice:
    """Projects an EPF position's current balance forward from the last known
    broker_snapshot balance, replaying broker_trade contributions through the
    exact EPFO mechanics: interest computed monthly on the opening-balance-of-
    month (before that month's own contribution), accumulated off to the side,
    and credited as one annual lump sum at FY-end (April-March) — see
    EPF_ESTIMATE_SCOPE.md §2. Degrades to "unavailable" if there's no snapshot
    to project from, or if a FY the projection spans has no configured rate
    (no silent fallback to a neighboring year's rate — §4/§7). A gap in
    contribution rows between two real snapshots does not block the estimate;
    it just understates slightly if some contributions were missed (§7).
    """
    snapshot = session.scalar(
        select(Transaction).filter_by(
            portfolio_id=pos.portfolio_id,
            symbol=pos.symbol,
            broker="epf",
            kind="broker_snapshot",
        )
    )
    if not snapshot:
        return PositionPrice(0.0, "unavailable", None, None, None, "INR")

    from app.core.entities.config import ProviderConfig
    provider = session.scalar(select(ProviderConfig).filter_by(provider_name=_EPF_RATE_PROVIDER_NAME))
    rates: Dict[str, float] = {}
    if provider and provider.config:
        import json
        try:
            rates = json.loads(provider.config).get("rates", {}) or {}
        except (ValueError, TypeError, AttributeError):
            rates = {}

    statement_date = snapshot.transaction_date
    if statement_date.tzinfo is None:
        statement_date = statement_date.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    contributions = session.scalars(
        select(Transaction).filter(
            Transaction.portfolio_id == pos.portfolio_id,
            Transaction.symbol == pos.symbol,
            Transaction.broker == "epf",
            Transaction.kind == "broker_trade",
            Transaction.transaction_date > statement_date,
        )
    ).all()

    contributions_by_month: Dict[tuple, float] = {}
    for c in contributions:
        c_date = c.transaction_date
        if c_date.tzinfo is None:
            c_date = c_date.replace(tzinfo=timezone.utc)
        if c_date > now:
            continue
        key = (c_date.year, c_date.month)
        contributions_by_month[key] = contributions_by_month.get(key, 0.0) + float(c.price)

    principal = float(snapshot.price)
    fy_accumulator: Dict[str, float] = {}
    applied_rates: Dict[str, float] = {}

    month = _next_month(_month_start(statement_date))
    last_month = _month_start(now)

    while month <= last_month:
        fy = _fy_label(month)
        if fy not in rates:
            return PositionPrice(0.0, "unavailable", None, None, None, "INR")
        rate = float(rates[fy])
        applied_rates[fy] = rate
        interest = principal * rate / 100.0 / 12.0
        fy_accumulator[fy] = fy_accumulator.get(fy, 0.0) + interest
        principal += contributions_by_month.get((month.year, month.month), 0.0)
        if month.month == 3:  # FY-end (March): credit the year's accumulated interest
            principal += fy_accumulator[fy]
            fy_accumulator[fy] = 0.0
        month = _next_month(month)

    estimated_balance = principal + sum(fy_accumulator.values())

    basis = {
        "as_of": now.isoformat(),
        "statement_date": statement_date.isoformat(),
        "rates_applied": [
            {"financial_year": fy, "rate_pct": rate} for fy, rate in sorted(applied_rates.items())
        ],
        "note": (
            "Estimate applies interest to the combined Employee+Employer+Pension "
            "balance; the EPS/pension share does not actually earn interest, so "
            "the true EPF-only balance may be somewhat lower than this figure. "
            "Also assumes every contribution was recorded via statement upload — "
            "any missed contributions between uploads will understate the total."
        ),
    }
    return PositionPrice(estimated_balance, "epf_estimated", None, None, basis, "INR")


def resolve_position_price(session: Session, pos: Position) -> PositionPrice:
    """Best-available price for a position, plus where it came from and, for a
    real market quote, how stale it is.

    Falls back to avg_buy_price when no live quote exists — a newly-added
    position with no ingested quote yet must still value at something, but
    callers need price_source to tell a real market price from that fallback.
    A LatestQuote row for a manually-created asset (see create_manual_asset /
    update_manual_valuation) holds a user-entered value, not an ingested
    quote, so it's labeled "manual" rather than "market" and never carries a
    staleness status (a user-entered value doesn't go stale the way a market
    quote does). quote_age_status/quote_updated_at are only populated for
    price_source == "market" — quote_updated_at is the raw LatestQuote
    timestamp, exposed so callers (e.g. the dashboard's Prices freshness
    tile, see Fix M) can find the oldest real market quote across a set of
    positions rather than just a per-position live/fresh/stale label.
    A LatestQuote row can exist with price == 0 (e.g. mutual fund/NPS/EPF
    symbols with no NAV ingestion path — see AUREON handoff notes); labeling
    that "market" would claim a real quote backed a value that's actually
    unpriced, so it's labeled "unavailable" instead and carries no staleness
    status, same as "manual".
    """
    from app.modules.market.entities.market import Asset
    asset = session.get(Asset, pos.asset_id) if pos.asset_id else None
    if asset and asset.asset_class == "epf":
        return _estimate_epf_price(session, pos)

    currency = infer_currency(asset.asset_class if asset else None, pos.symbol)

    quote = session.scalar(select(LatestQuote).filter_by(symbol=pos.symbol))
    if quote and quote.price is not None:
        is_manual = bool(
            asset and isinstance(asset.metadata_payload, dict)
            and asset.metadata_payload.get("sector") == "Manual"
        )
        if is_manual:
            return PositionPrice(float(quote.price), "manual", None, None, None, currency)
        if quote.price == 0:
            return PositionPrice(None, "unavailable", None, None, None, currency)
        updated_at = quote.updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        asset_class = asset.asset_class if asset else None
        return PositionPrice(float(quote.price), "market", _quote_age_status(quote.updated_at, asset_class), updated_at, None, currency)
    return PositionPrice(float(pos.avg_buy_price), "cost_basis", None, None, None, currency)


class PortfolioService(BaseService):
    def __init__(
        self,
        portfolios_repo: PortfoliosRepository,
        transactions_repo: TransactionsRepository,
        positions_repo: PositionsRepository,
        snapshot_repo: PortfolioSnapshotRepository,
    ):
        self.portfolios_repo = portfolios_repo
        self.transactions_repo = transactions_repo
        self.positions_repo = positions_repo
        self.snapshot_repo = snapshot_repo
        self.session = portfolios_repo.session

    def _invalidate_portfolio_caches(self, portfolio_id: uuid.UUID) -> None:
        pid = str(portfolio_id)
        invalidate_portfolio_snapshot(pid)
        invalidate_intelligence_portfolio(pid)
        invalidate_intelligence_health(pid)

    def create_portfolio(self, name: str, actor_id: Optional[uuid.UUID] = None) -> Portfolio:
        portfolio = Portfolio(name=name)
        self.portfolios_repo.create(portfolio)
        self.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_create",
            entity_type="portfolio",
            entity_id=str(portfolio.id),
            actor_id=actor_id,
            details={"name": name}
        )
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio

    def get_portfolio(self, portfolio_id: uuid.UUID) -> Portfolio:
        portfolio = self.portfolios_repo.get_by_id(portfolio_id)
        if not portfolio:
            raise NotFoundError("Portfolio not found")
        return portfolio

    def list_portfolios(self) -> List[Portfolio]:
        return self.portfolios_repo.list_all()

    def update_portfolio(self, portfolio_id: uuid.UUID, name: str, actor_id: Optional[uuid.UUID] = None) -> Portfolio:
        portfolio = self.get_portfolio(portfolio_id)
        old_name = portfolio.name
        portfolio.name = name
        self.portfolios_repo.update(portfolio)
        self.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_update",
            entity_type="portfolio",
            entity_id=str(portfolio.id),
            actor_id=actor_id,
            details={"old_name": old_name, "new_name": name}
        )
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio

    def delete_portfolio(self, portfolio_id: uuid.UUID, actor_id: Optional[uuid.UUID] = None) -> bool:
        portfolio = self.get_portfolio(portfolio_id)
        portfolio_name = portfolio.name
        deleted = self.portfolios_repo.delete(portfolio.id)
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_delete",
            entity_type="portfolio",
            entity_id=str(portfolio_id),
            actor_id=actor_id,
            details={"name": portfolio_name}
        )
        self.session.commit()
        if deleted:
            self._invalidate_portfolio_caches(portfolio_id)
        return deleted

    def record_transaction(
        self,
        portfolio_id: uuid.UUID,
        symbol: str,
        transaction_type: str,
        quantity: float,
        price: float,
        transaction_date: datetime,
        fees: float = 0.0,
        taxes: float = 0.0,
        notes: Optional[str] = None,
        broker: Optional[str] = None,
        broker_reference: Optional[str] = None,
        kind: str = "trade",
    ) -> Transaction:
        # Validate portfolio exists
        self.get_portfolio(portfolio_id)

        symbol = symbol.upper().strip()
        transaction_type = transaction_type.upper().strip()
        asset_id = ensure_asset_exists(self.session, symbol)

        txn = Transaction(
            portfolio_id=portfolio_id,
            symbol=symbol,
            asset_id=asset_id,
            transaction_type=transaction_type,
            quantity=quantity,
            price=price,
            transaction_date=transaction_date,
            fees=fees,
            taxes=taxes,
            notes=notes,
            broker=broker,
            broker_reference=broker_reference,
            kind=kind,
        )
        self.transactions_repo.create(txn)
        self.recalculate_position(portfolio_id, symbol)
        self.session.commit()
        self.session.refresh(txn)
        self._invalidate_portfolio_caches(portfolio_id)
        return txn

    def get_transaction(self, txn_id: uuid.UUID) -> Transaction:
        txn = self.transactions_repo.get_by_id(txn_id)
        if not txn:
            raise NotFoundError("Transaction not found")
        # Validate parent portfolio exists
        self.get_portfolio(txn.portfolio_id)
        return txn

    def list_transactions(self, portfolio_id: uuid.UUID) -> List[Transaction]:
        self.get_portfolio(portfolio_id)
        return self.transactions_repo.get_by_portfolio(portfolio_id)

    def update_transaction(
        self,
        txn_id: uuid.UUID,
        symbol: Optional[str] = None,
        transaction_type: Optional[str] = None,
        quantity: Optional[float] = None,
        price: Optional[float] = None,
        transaction_date: Optional[datetime] = None,
        fees: Optional[float] = None,
        taxes: Optional[float] = None,
        notes: Optional[str] = None,
        broker: Optional[str] = None,
        broker_reference: Optional[str] = None,
    ) -> Transaction:
        txn = self.get_transaction(txn_id)
        old_symbol = txn.symbol
        old_portfolio_id = txn.portfolio_id

        if symbol is not None:
            txn.symbol = symbol.upper().strip()
            txn.asset_id = ensure_asset_exists(self.session, txn.symbol)
        if transaction_type is not None:
            txn.transaction_type = transaction_type.upper().strip()
        if quantity is not None:
            txn.quantity = quantity
        if price is not None:
            txn.price = price
        if transaction_date is not None:
            txn.transaction_date = transaction_date
        if fees is not None:
            txn.fees = fees
        if taxes is not None:
            txn.taxes = taxes
        if notes is not None:
            txn.notes = notes
        if broker is not None:
            txn.broker = broker
        if broker_reference is not None:
            txn.broker_reference = broker_reference

        self.transactions_repo.update(txn)
        
        # Recalculate old and new symbol positions
        self.recalculate_position(old_portfolio_id, old_symbol)
        if symbol is not None and symbol.upper().strip() != old_symbol:
            self.recalculate_position(old_portfolio_id, txn.symbol)

        self.session.commit()
        self.session.refresh(txn)
        self._invalidate_portfolio_caches(old_portfolio_id)
        return txn

    def delete_transaction(self, txn_id: uuid.UUID) -> bool:
        txn = self.get_transaction(txn_id)
        portfolio_id = txn.portfolio_id
        symbol = txn.symbol

        deleted = self.transactions_repo.delete(txn_id)
        if deleted:
            self.recalculate_position(portfolio_id, symbol)
            self.session.commit()
            self._invalidate_portfolio_caches(portfolio_id)
        return deleted

    def recalculate_position(self, portfolio_id: uuid.UUID, symbol: str) -> None:
        symbol = symbol.upper().strip()
        
        # Query manual/imported transactions (kind == "trade"). Explicitly excludes
        # both "broker_snapshot" (a live-balance snapshot, not a ledger) and
        # "broker_trade" (best-effort/partial live trade-history import — see
        # _import_broker_trades — which only ever feeds cost basis via
        # _apply_trade_cost_basis, never quantity, since it can't be trusted to be
        # a complete ledger).
        txns = (
            self.session.query(Transaction)
            .filter(
                Transaction.portfolio_id == portfolio_id,
                Transaction.symbol == symbol,
                Transaction.transaction_type.in_({"BUY", "SELL", "BONUS", "SPLIT", "VALUATION"}),
                Transaction.kind == "trade",
            )
            .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
            .all()
        )

        # Fallback to broker snapshots if no manual transaction history exists
        if not txns:
            snap = (
                self.session.query(Transaction)
                .filter(
                    Transaction.portfolio_id == portfolio_id,
                    Transaction.symbol == symbol,
                    Transaction.kind == "broker_snapshot",
                )
                .order_by(Transaction.transaction_date.desc())
                .first()
            )
            if snap:
                txns = [snap]

        net_qty = 0.0
        running_avg = 0.0

        for t in txns:
            qty = float(t.quantity)
            price = float(t.price)
            t_type = t.transaction_type.upper()

            if t_type == "BUY":
                new_qty = net_qty + qty
                if new_qty > 0:
                    running_avg = (net_qty * running_avg + qty * price) / new_qty
                net_qty = new_qty
            elif t_type == "SELL":
                net_qty = max(net_qty - qty, 0.0)
            elif t_type == "BONUS":
                new_qty = net_qty + qty
                if new_qty > 0:
                    price_val = price if price else 0.0
                    running_avg = (net_qty * running_avg + qty * price_val) / new_qty
                net_qty = new_qty
            elif t_type == "SPLIT":
                multiplier = price if price else 1.0
                if multiplier > 0:
                    net_qty = net_qty * multiplier
                    running_avg = running_avg / multiplier
            elif t_type == "VALUATION":
                # Manual revaluation (see update_manual_valuation): `price` here is
                # an absolute unit price, not a SPLIT-style multiplier, so it must
                # never touch net_qty/running_avg. It only exists to update the
                # asset's current price (LatestQuote), which happens separately.
                pass

        pos = (
            self.session.query(Position)
            .filter(Position.portfolio_id == portfolio_id, Position.symbol == symbol)
            .first()
        )

        if net_qty <= 0:
            if pos and pos.wallet in ("futures_usdm", "futures_coinm"):
                # Futures positions are upserted directly from Binance's own
                # snapshot (_sync_futures_positions) and have no kind=="trade"
                # ledger, so net_qty here is always 0 for them — that must never
                # be read as "position closed, delete it".
                return
            if pos:
                self.session.delete(pos)
                self.session.flush()
            return

        asset_id = ensure_asset_exists(self.session, symbol)

        if pos:
            pos.quantity = net_qty
            pos.avg_buy_price = running_avg
            pos.asset_id = asset_id
        else:
            pos = Position(
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                quantity=net_qty,
                avg_buy_price=running_avg,
            )
            self.session.add(pos)
        self.session.flush()

    def get_position_price(self, pos: Position) -> PositionPrice:
        return resolve_position_price(self.session, pos)

    def generate_portfolio_snapshot(self, portfolio_id: uuid.UUID) -> PortfolioSnapshot:
        # Validate portfolio
        self.get_portfolio(portfolio_id)

        positions = self.positions_repo.get_by_portfolio(portfolio_id)
        market_value = 0.0
        total_invested = 0.0
        position_values = {}

        for pos in positions:
            pp = self.get_position_price(pos)
            price = pp.price

            qty = float(pos.quantity)
            if pos.wallet == "futures_coinm":
                # qty is contracts, not coins, for COIN-M — qty*entryPrice/leverage
                # (correct for USDⓈ-M below) has no financial meaning here.
                # margin_usd is precomputed at sync time from contractSize (see
                # _sync_futures_positions), where the real USD notional is known.
                margin = float(pos.margin_usd) if pos.margin_usd is not None else 0.0
                val = margin + float(pos.unrealized_pnl or 0)
                cost = margin
            elif pos.wallet == "futures_usdm":
                # Leveraged derivative: reporting qty * markPrice as "value" would
                # overstate capital exposure by the leverage multiple. What the user
                # actually has at risk is the margin posted plus unrealized PnL.
                leverage = float(pos.leverage) if pos.leverage else 1.0
                margin = abs(qty * float(pos.avg_buy_price)) / leverage
                val = margin + float(pos.unrealized_pnl or 0)
                cost = margin
            else:
                val = qty * price if price is not None else 0.0
                cost = qty * float(pos.avg_buy_price)

            # Positions carry native currency (INR for NSE/EPF/NPS/mutual funds,
            # USD otherwise) — normalize to INR before summing, or an INR EPF
            # balance gets added to a USD crypto value as if they were one unit.
            val = to_inr(val, pp.currency)
            cost = to_inr(cost, pp.currency)

            market_value += val
            total_invested += cost
            position_values[pos.symbol] = val

        allocation = {}
        for symbol, val in position_values.items():
            if symbol.endswith("_MF"):
                atype = "mutual_fund"
            elif any(symbol.endswith(f"-{s}") for s in WALLET_SUFFIXES.values()):
                atype = "crypto_futures"
            elif symbol.endswith("-USD"):
                atype = "stablecoin" if symbol[: -len("-USD")] in STABLECOIN_ASSETS else "crypto"
            else:
                atype = "equity"
            allocation[atype] = allocation.get(atype, 0.0) + val

        if market_value > 0:
            allocation = {k: round(v / market_value * 100, 2) for k, v in allocation.items()}
        else:
            allocation = {}

        total_return = market_value - total_invested
        daily_return = 0.0  # Placeholder as we do not have historical daily metrics in quotes

        snapshot = PortfolioSnapshot(
            portfolio_id=portfolio_id,
            market_value=market_value,
            cash_balance=0.0,
            allocation=allocation,
            daily_return=daily_return,
            total_return=total_return,
            updated_at=datetime.now(timezone.utc),
        )

        result = self.snapshot_repo.upsert(snapshot)
        self.session.commit()
        return result

    def get_history(self, portfolio_id: uuid.UUID, days: int = 90) -> dict[str, Any]:
        """Reconstructs net-worth over time from real Transaction + PriceHistory
        data. There is no persisted daily snapshot to read from —
        PortfolioSnapshot (see generate_portfolio_snapshot) is a single
        current-state row per portfolio, upserted in place, not a time series.

        Only symbols with a genuine BUY/SELL/BONUS/SPLIT trade ledger
        (kind="trade") are reconstructable: broker-synced holdings that only
        ever get a single `broker_snapshot` row (recalculate_position's
        fallback, no historical trail) and futures positions (upserted
        directly from Binance's live snapshot, no ledger at all — see
        _sync_futures_positions) have no historical quantity to replay, so
        they're excluded from this series entirely rather than assumed to
        have been held at today's size for the whole window. Each day is
        also skipped per-symbol until real PriceHistory exists for it — no
        flat-lined placeholder for the period before ingestion started.
        Consequently this series can genuinely be shorter than `days`, or
        empty, if the reconstructable data doesn't reach that far back.
        """
        self.get_portfolio(portfolio_id)

        txns = (
            self.session.query(Transaction)
            .filter(
                Transaction.portfolio_id == portfolio_id,
                Transaction.transaction_type.in_({"BUY", "SELL", "BONUS", "SPLIT"}),
                Transaction.kind == "trade",
            )
            .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
            .all()
        )
        if not txns:
            return {"snapshots": []}

        symbols = sorted({t.symbol for t in txns})
        txns_by_symbol: dict[str, list[Transaction]] = defaultdict(list)
        for t in txns:
            txns_by_symbol[t.symbol].append(t)

        assets = self.session.query(Asset).filter(Asset.symbol.in_(symbols)).all()
        asset_class_by_symbol = {a.symbol: a.asset_class for a in assets}

        price_rows = (
            self.session.query(PriceHistory)
            .filter(PriceHistory.symbol.in_(symbols))
            .order_by(PriceHistory.timestamp.asc())
            .all()
        )
        price_by_symbol: dict[str, list[PriceHistory]] = defaultdict(list)
        for p in price_rows:
            price_by_symbol[p.symbol].append(p)

        def qty_as_of(symbol: str, as_of: datetime) -> float:
            net = 0.0
            for t in txns_by_symbol[symbol]:
                if t.transaction_date > as_of:
                    break
                qty = float(t.quantity)
                price = float(t.price)
                t_type = t.transaction_type.upper()
                if t_type == "BUY":
                    net += qty
                elif t_type == "SELL":
                    net = max(net - qty, 0.0)
                elif t_type == "BONUS":
                    net += qty
                elif t_type == "SPLIT":
                    multiplier = price if price else 1.0
                    if multiplier > 0:
                        net *= multiplier
            return net

        def price_as_of(symbol: str, as_of: datetime) -> Optional[float]:
            best = None
            for p in price_by_symbol.get(symbol, []):
                if p.timestamp > as_of:
                    break
                best = p
            return float(best.price) if best is not None else None

        # DB timestamps are naive (TIMESTAMP WITHOUT TIME ZONE, implicitly UTC —
        # see transaction_date/PriceHistory.timestamp columns), so "now" must be
        # naive too or every comparison above raises.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        requested_start = now - timedelta(days=days)
        earliest_txn_date = txns[0].transaction_date
        start = max(requested_start, earliest_txn_date)

        snapshots = []
        day = start
        while day <= now:
            value = 0.0
            contributed = False
            for symbol in symbols:
                qty = qty_as_of(symbol, day)
                if qty <= 0:
                    continue
                price = price_as_of(symbol, day)
                if price is None:
                    continue
                currency = infer_currency(asset_class_by_symbol.get(symbol), symbol)
                value += to_inr(qty * price, currency)
                contributed = True
            if contributed:
                snapshots.append({"ts": day.isoformat(), "value": round(value, 2)})
            day += timedelta(days=1)

        return {"snapshots": snapshots}

    def import_transaction_file(
        self,
        portfolio_id: uuid.UUID,
        file_bytes: bytes,
        filename: str,
        broker: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Validate portfolio exists
        self.get_portfolio(portfolio_id)

        ext = filename.split(".")[-1].lower() if "." in filename else "csv"
        from app.modules.portfolio.services.portfolio_importer import parse_transaction_file
        rows, errors = parse_transaction_file(file_bytes, ext, broker)
        if not rows and errors:
            shown = errors[:5]
            more = f"; and {len(errors) - 5} more" if len(errors) > 5 else ""
            raise ValidationError(f"File parsing errors: {'; '.join(shown)}{more}")

        committed = 0
        skipped = 0
        symbols_to_recalc = set()

        # Bulk-load existing (broker, broker_reference) pairs up front so dedup
        # is one query instead of one SELECT per row (same pattern as the live
        # broker sync's _import_broker_trades).
        refs_by_broker: Dict[str, set] = {}
        for row in rows:
            broker_ref = row.get("broker_reference")
            if broker_ref:
                refs_by_broker.setdefault(row.get("broker") or "import", set()).add(broker_ref)

        existing_refs: set = set()
        for broker_name, refs in refs_by_broker.items():
            stmt = select(Transaction.broker, Transaction.broker_reference).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.broker == broker_name) &
                (Transaction.broker_reference.in_(refs))
            )
            existing_refs.update(tuple(r) for r in self.session.execute(stmt).all())

        seen_this_call: set = set()
        for row in rows:
            broker_ref = row.get("broker_reference")
            broker_name = row.get("broker") or "import"
            if broker_ref:
                key = (broker_name, broker_ref)
                if key in existing_refs or key in seen_this_call:
                    skipped += 1
                    continue
                seen_this_call.add(key)

            symbol = row["symbol"]
            asset_id = ensure_asset_exists(
                self.session,
                symbol,
                name=row.get("name"),
                asset_class=row.get("asset_type") or "equity",
            )

            txn = Transaction(
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                transaction_type=row["type"],
                quantity=row["quantity"],
                price=row["price"],
                transaction_date=row["date"],
                broker=broker_name,
                broker_reference=broker_ref,
                kind="trade",
            )
            self.transactions_repo.create(txn)
            committed += 1
            symbols_to_recalc.add(symbol)

        for sym in symbols_to_recalc:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return {"committed": committed, "skipped": skipped, "errors": errors}

    def import_cdsl_cas(
        self,
        portfolio_id: uuid.UUID,
        file_bytes: bytes,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Validate portfolio exists
        self.get_portfolio(portfolio_id)

        from app.modules.portfolio.services.portfolio_importer import parse_cdsl_cas
        try:
            payloads, summary = parse_cdsl_cas(file_bytes, password)
        except Exception as e:
            raise ValidationError(str(e))

        symbols_to_recalc = set()
        for p in payloads:
            symbol = p["symbol"]
            asset_id = ensure_asset_exists(self.session, symbol, name=p.get("name"), asset_class=p.get("asset_type") or "equity")

            stmt = select(Transaction).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.symbol == symbol) &
                (Transaction.kind == "broker_snapshot") &
                (Transaction.broker == "cas_cdsl")
            )
            existing = self.session.execute(stmt).scalars().first()

            if existing:
                existing.quantity = p["quantity"]
                existing.price = p["avg_buy_price"]
                existing.transaction_date = datetime.now(timezone.utc)
            else:
                txn = Transaction(
                    portfolio_id=portfolio_id,
                    symbol=symbol,
                    asset_id=asset_id,
                    transaction_type="BUY",
                    quantity=p["quantity"],
                    price=p["avg_buy_price"],
                    transaction_date=datetime.now(timezone.utc),
                    broker="cas_cdsl",
                    kind="broker_snapshot",
                )
                self.transactions_repo.create(txn)

            if p.get("current_price"):
                from app.core.providers.models import NormalizedQuote
                from app.modules.market.repositories.ingestion import IngestionRepository
                IngestionRepository(self.session).upsert_quote(
                    NormalizedQuote(
                        symbol=symbol,
                        provider="cas_cdsl_import",
                        timestamp=datetime.now(timezone.utc),
                        price=p["current_price"],
                    ),
                    asset_id,
                )

            symbols_to_recalc.add(symbol)

        for sym in symbols_to_recalc:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return {
            "status": "success",
            "imported_holdings": len(payloads),
            "summary": summary,
        }

    def import_nps_statement(
        self,
        portfolio_id: uuid.UUID,
        file_bytes: bytes,
    ) -> Dict[str, Any]:
        # Validate portfolio exists
        self.get_portfolio(portfolio_id)

        from app.modules.portfolio.services.portfolio_importer import parse_nps_statement
        try:
            holdings, rows, summary = parse_nps_statement(file_bytes)
        except Exception as e:
            raise ValidationError(str(e))

        symbols_to_recalc = set()

        # Holdings snapshot per scheme — same upsert-one-broker_snapshot-per-symbol
        # pattern as import_cdsl_cas.
        for h in holdings:
            symbol = h["symbol"]
            asset_id = ensure_asset_exists(self.session, symbol, name=h["name"], asset_class="nps", tier=h["tier"])

            stmt = select(Transaction).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.symbol == symbol) &
                (Transaction.kind == "broker_snapshot") &
                (Transaction.broker == "nps")
            )
            existing = self.session.execute(stmt).scalars().first()

            if existing:
                existing.quantity = h["quantity"]
                existing.price = h["current_nav"]
                existing.transaction_date = h["as_of_date"] or datetime.now(timezone.utc)
            else:
                txn = Transaction(
                    portfolio_id=portfolio_id,
                    symbol=symbol,
                    asset_id=asset_id,
                    transaction_type="BUY",
                    quantity=h["quantity"],
                    price=h["current_nav"],
                    transaction_date=h["as_of_date"] or datetime.now(timezone.utc),
                    broker="nps",
                    kind="broker_snapshot",
                )
                self.transactions_repo.create(txn)

            if h.get("current_nav"):
                from app.core.providers.models import NormalizedQuote
                from app.modules.market.repositories.ingestion import IngestionRepository
                IngestionRepository(self.session).upsert_quote(
                    NormalizedQuote(
                        symbol=symbol,
                        provider="nps_statement_import",
                        timestamp=datetime.now(timezone.utc),
                        price=h["current_nav"],
                    ),
                    asset_id,
                )

            symbols_to_recalc.add(symbol)

        # Per-row transactions — same (broker, broker_reference) dedup pattern as
        # import_transaction_file.
        refs = {row["broker_reference"] for row in rows}
        existing_refs: set = set()
        if refs:
            stmt = select(Transaction.broker_reference).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.broker == "nps") &
                (Transaction.broker_reference.in_(refs))
            )
            existing_refs = set(self.session.execute(stmt).scalars().all())

        committed = 0
        skipped = 0
        seen_this_call: set = set()
        for row in rows:
            broker_ref = row["broker_reference"]
            if broker_ref in existing_refs or broker_ref in seen_this_call:
                skipped += 1
                continue
            seen_this_call.add(broker_ref)

            symbol = row["symbol"]
            asset_id = ensure_asset_exists(self.session, symbol)

            txn = Transaction(
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                transaction_type=row["type"],
                quantity=row["quantity"],
                price=row["price"],
                transaction_date=row["date"],
                broker="nps",
                broker_reference=broker_ref,
                kind="trade",
                notes=row["description"],
            )
            self.transactions_repo.create(txn)
            committed += 1
            symbols_to_recalc.add(symbol)

        for sym in symbols_to_recalc:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return {
            "holdings_imported": len(holdings),
            "transactions_committed": committed,
            "transactions_skipped": skipped,
            "errors": [],
            "summary": summary,
        }

    def import_epf_statement(
        self,
        portfolio_id: uuid.UUID,
        file_bytes: bytes,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Validate portfolio exists
        self.get_portfolio(portfolio_id)

        from app.modules.portfolio.services.portfolio_importer import parse_epf_statement
        try:
            holdings, rows, summary = parse_epf_statement(file_bytes, password)
        except (ValueError, ImportError) as e:
            raise ValidationError(str(e))

        symbols_to_recalc = set()

        # Holdings snapshot (one per UAN) — same upsert-one-broker_snapshot-per-symbol
        # pattern as import_nps_statement/import_cdsl_cas. quantity is always 1.0:
        # EPF is a lump-sum INR balance, not a per-unit NAV holding like NPS schemes.
        for h in holdings:
            symbol = h["symbol"]
            asset_id = ensure_asset_exists(self.session, symbol, name=h["name"], asset_class="epf")

            stmt = select(Transaction).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.symbol == symbol) &
                (Transaction.kind == "broker_snapshot") &
                (Transaction.broker == "epf")
            )
            existing = self.session.execute(stmt).scalars().first()

            if existing:
                existing.quantity = h["quantity"]
                existing.price = h["current_value"]
                existing.transaction_date = h["as_of_date"] or datetime.now(timezone.utc)
            else:
                txn = Transaction(
                    portfolio_id=portfolio_id,
                    symbol=symbol,
                    asset_id=asset_id,
                    transaction_type="BUY",
                    quantity=h["quantity"],
                    price=h["current_value"],
                    transaction_date=h["as_of_date"] or datetime.now(timezone.utc),
                    broker="epf",
                    kind="broker_snapshot",
                )
                self.transactions_repo.create(txn)

            symbols_to_recalc.add(symbol)

        # Per-row contribution history — recorded as kind="broker_trade" (not
        # "trade"): EPF contributions aren't per-unit purchases the way NPS's
        # recalculate_position BUY replay assumes, so they must never drive
        # Position.quantity. They're an audit trail only; the holdings snapshot
        # above (kind="broker_snapshot") is what recalculate_position uses to
        # set Position.quantity/avg_buy_price via its fallback path. Same
        # (broker, broker_reference) dedup pattern as import_transaction_file.
        refs = {row["broker_reference"] for row in rows}
        existing_refs: set = set()
        if refs:
            stmt = select(Transaction.broker_reference).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.broker == "epf") &
                (Transaction.broker_reference.in_(refs))
            )
            existing_refs = set(self.session.execute(stmt).scalars().all())

        committed = 0
        skipped = 0
        seen_this_call: set = set()
        for row in rows:
            broker_ref = row["broker_reference"]
            if broker_ref in existing_refs or broker_ref in seen_this_call:
                skipped += 1
                continue
            seen_this_call.add(broker_ref)

            symbol = row["symbol"]
            asset_id = ensure_asset_exists(self.session, symbol)

            txn = Transaction(
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                transaction_type=row["type"],
                quantity=1.0,
                price=row["amount"],
                transaction_date=row["date"],
                broker="epf",
                broker_reference=broker_ref,
                kind="broker_trade",
                notes=row["description"],
            )
            self.transactions_repo.create(txn)
            committed += 1
            symbols_to_recalc.add(symbol)

        for sym in symbols_to_recalc:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return {
            "holdings_imported": len(holdings),
            "transactions_committed": committed,
            "transactions_skipped": skipped,
            "errors": [],
            "summary": summary,
        }

    def _sync_broker_snapshot(
        self,
        portfolio_id: uuid.UUID,
        broker: str,
        rows: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Idempotent upsert of normalized broker holdings into Position/Transaction,
        following the same one-snapshot-per-symbol pattern as import_cdsl_cas. Only
        affects symbols with no manual (non-broker_snapshot) transactions —
        recalculate_position's existing fallback logic prefers manual history
        whenever it exists, so a manually-edited symbol is left alone.

        Each row: {"symbol": str, "quantity": float, "avg_price": float, "name": str,
        "asset_class": str}. Rows with quantity <= 0 are skipped (fully-sold/empty)."""
        from app.modules.market.entities.market import Asset

        seen_symbols = set()
        for row in rows:
            symbol = row["symbol"]
            quantity = row["quantity"]
            if quantity <= 0:
                continue
            avg_price = row["avg_price"]

            asset_id = ensure_asset_exists(self.session, symbol)

            asset = self.session.scalar(select(Asset).filter_by(symbol=symbol))
            row_asset_class = row.get("asset_class", "equity")
            if not asset:
                self.session.add(Asset(id=asset_id, symbol=symbol, name=row.get("name", symbol), asset_class=row_asset_class))
                self.session.flush()
            elif asset.asset_class != row_asset_class:
                # Keeps a pre-existing Asset row's classification in sync with what
                # the broker sync now knows (e.g. a stablecoin synced before
                # "stablecoin" was a distinct asset_class from "crypto").
                asset.asset_class = row_asset_class
                self.session.flush()

            stmt = select(Transaction).where(
                (Transaction.portfolio_id == portfolio_id) &
                (Transaction.symbol == symbol) &
                (Transaction.kind == "broker_snapshot") &
                (Transaction.broker == broker)
            )
            existing = self.session.execute(stmt).scalars().first()
            if existing:
                existing.quantity = quantity
                existing.price = avg_price
                existing.transaction_date = datetime.now(timezone.utc)
            else:
                txn = Transaction(
                    portfolio_id=portfolio_id,
                    symbol=symbol,
                    asset_id=asset_id,
                    transaction_type="BUY",
                    quantity=quantity,
                    price=avg_price,
                    transaction_date=datetime.now(timezone.utc),
                    broker=broker,
                    kind="broker_snapshot",
                )
                self.transactions_repo.create(txn)

            seen_symbols.add(symbol)

        # Fully-sold holdings: remove the stale broker_snapshot so recalculate_position drops the Position.
        stale = (
            self.session.query(Transaction)
            .filter(
                Transaction.portfolio_id == portfolio_id,
                Transaction.broker == broker,
                Transaction.kind == "broker_snapshot",
                Transaction.symbol.notin_(seen_symbols),
            )
            .all()
        )
        removed_symbols = set()
        for t in stale:
            removed_symbols.add(t.symbol)
            self.session.delete(t)

        for sym in seen_symbols | removed_symbols:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        return {
            "status": "success",
            "synced_holdings": len(seen_symbols),
            "removed": len(removed_symbols),
        }

    def sync_zerodha_holdings(
        self,
        portfolio_id: uuid.UUID,
        holdings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        self.get_portfolio(portfolio_id)

        _EXCHANGE_SUFFIX = {"NSE": ".NS", "BSE": ".BO"}
        rows = []
        for h in holdings:
            raw_symbol = (h.get("tradingsymbol") or "").upper().strip()
            if not raw_symbol:
                continue
            suffix = _EXCHANGE_SUFFIX.get((h.get("exchange") or "").upper(), "")
            symbol = raw_symbol if raw_symbol.endswith(suffix) or not suffix else f"{raw_symbol}{suffix}"
            rows.append({
                "symbol": symbol,
                "quantity": float(h.get("quantity") or 0),
                "avg_price": float(h.get("average_price") or 0),
                "name": raw_symbol,
                "asset_class": "equity",
            })

        result = self._sync_broker_snapshot(portfolio_id, "zerodha", rows)
        self._invalidate_portfolio_caches(portfolio_id)
        return result

    def sync_binance_holdings(
        self,
        portfolio_id: uuid.UUID,
        holdings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """holdings: {"spot": [...], "earn": [...], "futures_usdm": [...],
        "futures_coinm": [...], "trades": {"spot": [...], "futures_usdm": [...],
        "futures_coinm": [...]}} — see BinanceBrokerProvider.sync(). Spot and Earn
        balances are the same underlying coin (Earn is just locked in a savings
        product), so they're merged into one Position per asset. Futures positions
        are leveraged derivatives with no cost-basis ledger, so they're upserted
        directly from Binance's own position snapshot rather than replayed through
        recalculate_position. Binance's account/position endpoints report current
        balances only, not historical cost basis for Spot/Earn — accurate P&L there
        depends on the trade history imported below (or the CSV/XLSX importer)."""
        self.get_portfolio(portfolio_id)

        quantities: Dict[str, float] = {}
        for b in holdings.get("spot") or []:
            asset = (b.get("asset") or "").upper().strip()
            if not asset:
                continue
            # Simple Earn Flexible auto-subscribes free spot balance and holds
            # it as a distinct SPOT asset code prefixed "LD" (e.g. "LDBTC"), a
            # 1:1-redeemable receipt token for the real "BTC" — confirmed live,
            # this is on the spot balance list itself, not on the Simple Earn
            # position endpoint (whose own "asset" field already reports the
            # plain underlying symbol, e.g. "BTC", nothing to strip there).
            # Strip it so the balance merges into the same Position as the
            # real spot holding — otherwise it becomes its own Position with no
            # quote/price source any provider can ever resolve.
            if asset.startswith("LD") and len(asset) > 2:
                asset = asset[2:]
            quantities[asset] = quantities.get(asset, 0.0) + float(b.get("free") or 0) + float(b.get("locked") or 0)
        for e in holdings.get("earn") or []:
            asset = (e.get("asset") or "").upper().strip()
            if not asset:
                continue
            amount = float(e.get("totalAmount") or e.get("amount") or 0)
            quantities[asset] = quantities.get(asset, 0.0) + amount

        rows = [
            {
                "symbol": f"{asset}-USD",
                "quantity": qty,
                "avg_price": 0.0,
                "name": asset,
                "asset_class": "stablecoin" if asset in STABLECOIN_ASSETS else "crypto",
            }
            for asset, qty in quantities.items()
            if qty > 0
        ]

        trades = holdings.get("trades") or {}
        result = self._sync_spot_with_cost_basis(portfolio_id, "binance", rows, trades.get("spot") or [])

        self._sync_futures_positions(portfolio_id, "binance", "futures_usdm", holdings.get("futures_usdm") or [])
        self._sync_futures_positions(portfolio_id, "binance", "futures_coinm", holdings.get("futures_coinm") or [])
        result["imported_trades"] += self._import_broker_trades(portfolio_id, "binance", trades.get("futures_usdm") or [], "futures_usdm")
        result["imported_trades"] += self._import_broker_trades(portfolio_id, "binance", trades.get("futures_coinm") or [], "futures_coinm")

        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return result

    def _sync_spot_with_cost_basis(
        self,
        portfolio_id: uuid.UUID,
        broker: str,
        rows: List[Dict[str, Any]],
        spot_trades: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Atomic unit for Spot/Earn: syncs the live balance snapshot, imports
        trade history, then reapplies cost basis from that history — in that
        exact order, every time. This exists so the ordering dependency
        (snapshot sync resets avg_buy_price via recalculate_position, so cost
        basis must be (re)applied *after* both snapshot sync and trade import,
        on every call, not just when a new trade appears) lives in one place
        instead of being the caller's responsibility to get right."""
        result = self._sync_broker_snapshot(portfolio_id, broker, rows)
        result["imported_trades"] = self._import_broker_trades(portfolio_id, broker, spot_trades, "spot")
        for row in rows:
            self._apply_trade_cost_basis(portfolio_id, row["symbol"])
        return result

    def _sync_futures_positions(
        self,
        portfolio_id: uuid.UUID,
        broker: str,
        wallet: str,
        positions: List[Dict[str, Any]],
    ) -> None:
        """Upserts Position rows directly from Binance's positionRisk snapshot
        (USDⓈ-M or COIN-M). Bypasses recalculate_position's BUY/SELL transaction
        replay since a futures position isn't a cost-basis ledger — it's a live,
        signed (long/short) snapshot that Binance itself already nets out."""
        from app.modules.market.entities.market import Asset

        suffix = WALLET_SUFFIXES[wallet]
        seen_symbols = set()
        for p in positions:
            position_amt = float(p.get("positionAmt") or 0)
            if position_amt == 0:
                continue
            raw_symbol = (p.get("symbol") or "").upper().strip()
            if not raw_symbol:
                continue
            symbol = f"{raw_symbol}-{suffix}"
            seen_symbols.add(symbol)

            asset_id = ensure_asset_exists(self.session, symbol)
            asset = self.session.scalar(select(Asset).filter_by(symbol=symbol))
            if not asset:
                self.session.add(Asset(id=asset_id, symbol=symbol, name=raw_symbol, asset_class="crypto_futures"))
                self.session.flush()

            side = (p.get("positionSide") or "").upper()
            if side not in ("LONG", "SHORT"):
                side = "LONG" if position_amt > 0 else "SHORT"

            pos = (
                self.session.query(Position)
                .filter(Position.portfolio_id == portfolio_id, Position.symbol == symbol)
                .first()
            )
            if not pos:
                pos = Position(portfolio_id=portfolio_id, symbol=symbol, asset_id=asset_id, wallet=wallet)
                self.session.add(pos)

            pos.quantity = position_amt
            pos.avg_buy_price = float(p.get("entryPrice") or 0)
            pos.leverage = float(p.get("leverage")) if p.get("leverage") is not None else None
            pos.liquidation_price = float(p.get("liquidationPrice")) if p.get("liquidationPrice") is not None else None
            pos.side = side
            pos.asset_id = asset_id

            if wallet == "futures_coinm":
                # COIN-M's positionAmt is contracts, not coins, and unRealizedProfit
                # is settlement-coin-denominated, not USD — qty*entryPrice/leverage
                # (correct for USDⓈ-M) is meaningless here. contractSize is a fixed
                # USD notional per contract (from Binance's dapi exchangeInfo, see
                # get_coinm_contract_sizes), so qty*contractSize/leverage is already
                # a real USD margin figure with no markPrice conversion needed.
                contract_size = p.get("contractSize")
                mark_price = p.get("markPrice")
                leverage = float(p.get("leverage")) if p.get("leverage") else 1.0
                if contract_size is not None and mark_price is not None:
                    pos.margin_usd = abs(position_amt) * float(contract_size) / leverage
                    pos.unrealized_pnl = float(p.get("unRealizedProfit") or 0) * float(mark_price)
                else:
                    # Can't honestly compute either figure without contractSize/
                    # markPrice — don't fabricate a wrong-unit number.
                    pos.margin_usd = None
                    pos.unrealized_pnl = None
            else:
                pos.margin_usd = None
                pos.unrealized_pnl = float(p.get("unRealizedProfit") or 0)
        self.session.flush()

        stale_query = self.session.query(Position).filter(
            Position.portfolio_id == portfolio_id,
            Position.wallet == wallet,
        )
        if seen_symbols:
            stale_query = stale_query.filter(Position.symbol.notin_(seen_symbols))
        stale = stale_query.all()
        for pos in stale:
            self.session.delete(pos)
        self.session.flush()

    def _import_broker_trades(
        self,
        portfolio_id: uuid.UUID,
        broker: str,
        trades: List[Dict[str, Any]],
        wallet: str,
    ) -> int:
        """Inserts Binance trade-history rows as kind="broker_trade" Transactions
        (a distinct kind from "trade" — see recalculate_position — since this
        history is best-effort/partial and must never override the live balance
        snapshot's quantity), deduped by (portfolio_id, broker, broker_reference)
        — same pattern as the CSV importer's import_transaction_file
        (broker_reference = Binance's trade id). Only Spot trades feed
        _apply_trade_cost_basis; Futures positions are snapshot-synced in
        _sync_futures_positions and don't have a cost-basis ledger concept here."""
        # Build every candidate's dedup key up front so existing rows can be
        # checked with one bulk query instead of one SELECT per trade.
        candidates = []
        for t in trades:
            trade_id = t.get("id") or t.get("orderId")
            if trade_id is None:
                continue
            raw_symbol = (t.get("symbol") or "").upper().strip()
            if not raw_symbol:
                continue
            # Binance trade ids are only unique per symbol/market, not globally —
            # a Spot BTCUSDT trade and a Spot ETHUSDT trade (or a USDⓈ-M and a
            # COIN-M trade) can share the same numeric id, so the dedup key must
            # include wallet + the raw exchange symbol/pair, not just the id.
            broker_ref = f"{wallet}:{raw_symbol}:{trade_id}"
            candidates.append((t, raw_symbol, broker_ref))

        if not candidates:
            return 0

        existing_refs = set(
            self.session.execute(
                select(Transaction.broker_reference).where(
                    Transaction.portfolio_id == portfolio_id,
                    Transaction.broker == broker,
                    Transaction.broker_reference.in_([c[2] for c in candidates]),
                )
            ).scalars().all()
        )

        committed = 0
        seen_this_call = set()
        for t, raw_symbol, broker_ref in candidates:
            if broker_ref in existing_refs or broker_ref in seen_this_call:
                continue
            seen_this_call.add(broker_ref)

            if wallet == "spot":
                # Normalise to the same "{ASSET}-USD" symbol the balance sync uses
                # (_sync_broker_snapshot), so trade history reinforces the same
                # Position instead of creating a shadow one. Only pairs quoted in a
                # USD stablecoin can be treated as USD-priced directly; BTC/ETH/BNB-
                # quoted pairs (e.g. "ADABTC") would need a separate BTC->USD
                # conversion to price correctly, so those are skipped here (still
                # available via the CSV importer, which doesn't face this problem
                # since exported statements report values in the user's fiat).
                base, _ = split_quote_asset(raw_symbol, STABLECOIN_ASSETS)
                if base is None:
                    continue
                symbol = f"{base}-USD"
                is_buyer = bool(t.get("isBuyer"))
                transaction_type = "BUY" if is_buyer else "SELL"
            else:
                suffix = WALLET_SUFFIXES[wallet]
                symbol = f"{raw_symbol}-{suffix}"
                side = (t.get("side") or "").upper()
                transaction_type = "BUY" if side == "BUY" else "SELL"

            asset_id = ensure_asset_exists(self.session, symbol)
            txn = Transaction(
                portfolio_id=portfolio_id,
                symbol=symbol,
                asset_id=asset_id,
                transaction_type=transaction_type,
                quantity=float(t.get("qty") or t.get("quantity") or 0),
                price=float(t.get("price") or 0),
                transaction_date=datetime.fromtimestamp(int(t.get("time") or 0) / 1000, tz=timezone.utc),
                fees=float(t.get("commission") or 0),
                broker=broker,
                broker_reference=broker_ref,
                kind="broker_trade",
            )
            self.transactions_repo.create(txn)
            committed += 1

        # Spot/Earn quantity must stay driven by the live balance snapshot from
        # _sync_broker_snapshot (authoritative), not by this trade ledger — trade
        # history here is best-effort/partial (see get_spot_trade_candidates), so
        # replaying it as a full ledger via recalculate_position could understate
        # real holdings. sync_binance_holdings applies cost basis for every synced
        # spot symbol afterward (_apply_trade_cost_basis), not just ones with a
        # newly-imported trade this round.
        return committed

    def _apply_trade_cost_basis(self, portfolio_id: uuid.UUID, symbol: str) -> None:
        """Derives avg_buy_price from kind="broker_trade" transactions for `symbol`
        (same running-average math as recalculate_position) and applies it to the
        existing Position without touching its quantity."""
        pos = (
            self.session.query(Position)
            .filter(Position.portfolio_id == portfolio_id, Position.symbol == symbol)
            .first()
        )
        if not pos:
            return

        trades = (
            self.session.query(Transaction)
            .filter(
                Transaction.portfolio_id == portfolio_id,
                Transaction.symbol == symbol,
                Transaction.kind == "broker_trade",
                Transaction.transaction_type.in_({"BUY", "SELL"}),
            )
            .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
            .all()
        )
        if not trades:
            return

        net_qty = 0.0
        running_avg = 0.0
        for t in trades:
            qty = float(t.quantity)
            price = float(t.price)
            if t.transaction_type.upper() == "BUY":
                new_qty = net_qty + qty
                if new_qty > 0:
                    running_avg = (net_qty * running_avg + qty * price) / new_qty
                net_qty = new_qty
            else:
                net_qty = max(net_qty - qty, 0.0)

        if running_avg > 0:
            pos.avg_buy_price = running_avg
            self.session.flush()

    def sync_groww_holdings(
        self,
        portfolio_id: uuid.UUID,
        holdings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """holdings: Groww GET /holdings/user "holdings" list — each includes
        trading_symbol, quantity, average_price (see GrowwClient.get_holdings)."""
        self.get_portfolio(portfolio_id)

        rows = []
        for h in holdings:
            raw_symbol = (h.get("trading_symbol") or "").upper().strip()
            if not raw_symbol:
                continue
            symbol = raw_symbol if raw_symbol.endswith(".NS") or raw_symbol.endswith(".BO") else f"{raw_symbol}.NS"
            rows.append({
                "symbol": symbol,
                "quantity": float(h.get("quantity") or 0),
                "avg_price": float(h.get("average_price") or 0),
                "name": raw_symbol,
                "asset_class": "equity",
            })

        result = self._sync_broker_snapshot(portfolio_id, "groww", rows)
        self._invalidate_portfolio_caches(portfolio_id)
        return result

    def create_manual_asset(
        self,
        portfolio_id: uuid.UUID,
        name: str,
        symbol: str,
        asset_class: str,
        quantity: float,
        price: float,
        transaction_date: Optional[datetime] = None,
        notes: Optional[str] = None,
        tier: Optional[int] = None,
    ) -> str:
        from app.modules.market.entities.market import Asset

        symbol_clean = symbol.upper().strip()
        asset = self.session.scalar(select(Asset).filter_by(symbol=symbol_clean))
        if not asset:
            asset = Asset(
                id=uuid.uuid5(uuid.NAMESPACE_DNS, symbol_clean),
                symbol=symbol_clean,
                name=name,
                asset_class=asset_class,
                tier=tier,
                metadata_payload={"sector": "Manual"}
            )
            self.session.add(asset)
            self.session.flush()
        elif tier is not None and asset.tier != tier:
            asset.tier = tier
            self.session.flush()

        ensure_asset_exists(self.session, symbol_clean)

        txn = Transaction(
            portfolio_id=portfolio_id,
            symbol=symbol_clean,
            asset_id=asset.id,
            transaction_type="BUY",
            quantity=quantity,
            price=price,
            transaction_date=transaction_date or datetime.now(timezone.utc),
            notes=notes or "Manual asset creation",
            broker="manual",
            kind="trade"
        )
        self.transactions_repo.create(txn)
        self.session.commit()

        self.recalculate_position(portfolio_id, symbol_clean)
        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return symbol_clean

    def update_manual_valuation(
        self,
        portfolio_id: uuid.UUID,
        symbol: str,
        new_value: float,
        notes: Optional[str] = None,
    ) -> float:
        symbol_clean = symbol.upper().strip()

        pos = self.positions_repo.get_by_portfolio_symbol(portfolio_id, symbol_clean)
        if not pos:
            raise NotFoundError("Manual position not found")

        qty = float(pos.quantity)
        new_unit_price = new_value / qty if qty > 0 else new_value

        quote = self.session.scalar(select(LatestQuote).filter_by(symbol=symbol_clean))
        if quote:
            quote.price = new_unit_price
        else:
            self.session.add(LatestQuote(
                symbol=symbol_clean,
                asset_id=pos.asset_id,
                price=new_unit_price,
                volume=None,
            ))

        txn = Transaction(
            portfolio_id=portfolio_id,
            symbol=symbol_clean,
            asset_id=pos.asset_id,
            transaction_type="VALUATION",
            quantity=qty,
            price=new_unit_price,
            transaction_date=datetime.now(timezone.utc),
            notes=notes or f"Valuation update: {new_value}",
            broker="manual",
            kind="trade"
        )
        self.transactions_repo.create(txn)
        self.session.commit()
        self._invalidate_portfolio_caches(portfolio_id)
        return new_unit_price

    def count_broker_positions(self, broker: str) -> int:
        return (
            self.session.query(Position)
            .join(Transaction, (Transaction.portfolio_id == Position.portfolio_id) & (Transaction.symbol == Position.symbol))
            .filter(Transaction.broker == broker, Transaction.kind == "broker_snapshot")
            .distinct()
            .count()
        )
