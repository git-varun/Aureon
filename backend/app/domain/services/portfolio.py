from app.domain.services.base import BaseService
"""Portfolio domain services."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.domain.entities.market import AssetSnapshot, LatestQuote
from app.domain.entities.portfolio import (
    Portfolio,
    PortfolioSnapshot,
    Position,
    Transaction,
)
from app.infrastructure.repositories import (
    PortfolioSnapshotRepository,
    PortfoliosRepository,
    PositionsRepository,
    TransactionsRepository,
)

logger = logging.getLogger("portfolio.service")

def _ensure_asset_exists(session: Session, symbol: str) -> uuid.UUID:
    symbol = symbol.upper().strip()
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, symbol)
    
    # We must ensure the LatestQuote and AssetSnapshot exist.
    quote = session.scalar(select(LatestQuote).filter_by(symbol=symbol))
    if not quote:
        quote = LatestQuote(
            symbol=symbol,
            asset_id=asset_id,
            price=0.0,
            volume=0.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(quote)
        session.flush()
        
    snapshot = session.scalar(select(AssetSnapshot).filter_by(asset_id=asset_id))
    if not snapshot:
        snapshot = AssetSnapshot(
            asset_id=asset_id,
            price=quote.price,
            market_cap=None,
            pe_ratio=None,
            rsi=None,
            momentum_score=None,
            volatility_score=None,
            sentiment_score=None,
            payload={},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(snapshot)
        session.flush()
        
    return asset_id


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

    def create_portfolio(self, name: str, organization_id: uuid.UUID, actor_id: Optional[uuid.UUID] = None) -> Portfolio:
        portfolio = Portfolio(name=name, organization_id=organization_id)
        self.portfolios_repo.create(portfolio)
        self.session.flush()
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_create",
            entity_type="portfolio",
            entity_id=str(portfolio.id),
            actor_id=actor_id,
            details={"name": name, "organization_id": str(organization_id)}
        )
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio

    def get_portfolio(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID) -> Portfolio:
        portfolio = self.portfolios_repo.get_by_id(portfolio_id)
        if not portfolio or portfolio.organization_id != organization_id:
            raise NotFoundError("Portfolio not found")
        return portfolio

    def list_portfolios(self, organization_id: uuid.UUID) -> List[Portfolio]:
        return self.portfolios_repo.get_by_org(organization_id)

    def update_portfolio(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID, name: str, actor_id: Optional[uuid.UUID] = None) -> Portfolio:
        portfolio = self.get_portfolio(portfolio_id, organization_id)
        old_name = portfolio.name
        portfolio.name = name
        self.portfolios_repo.update(portfolio)
        self.session.flush()
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_update",
            entity_type="portfolio",
            entity_id=str(portfolio.id),
            actor_id=actor_id,
            details={"old_name": old_name, "new_name": name, "organization_id": str(organization_id)}
        )
        self.session.commit()
        self.session.refresh(portfolio)
        return portfolio

    def delete_portfolio(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID, actor_id: Optional[uuid.UUID] = None) -> bool:
        portfolio = self.get_portfolio(portfolio_id, organization_id)
        portfolio_name = portfolio.name
        deleted = self.portfolios_repo.delete(portfolio.id)
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="portfolio_delete",
            entity_type="portfolio",
            entity_id=str(portfolio_id),
            actor_id=actor_id,
            details={"name": portfolio_name, "organization_id": str(organization_id)}
        )
        self.session.commit()
        return deleted

    def record_transaction(
        self,
        portfolio_id: uuid.UUID,
        organization_id: uuid.UUID,
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
        # Validate portfolio membership
        self.get_portfolio(portfolio_id, organization_id)

        symbol = symbol.upper().strip()
        transaction_type = transaction_type.upper().strip()
        asset_id = _ensure_asset_exists(self.session, symbol)

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
        return txn

    def get_transaction(self, txn_id: uuid.UUID, organization_id: uuid.UUID) -> Transaction:
        txn = self.transactions_repo.get_by_id(txn_id)
        if not txn:
            raise NotFoundError("Transaction not found")
        # Validate parent portfolio bounds
        self.get_portfolio(txn.portfolio_id, organization_id)
        return txn

    def list_transactions(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID) -> List[Transaction]:
        self.get_portfolio(portfolio_id, organization_id)
        return self.transactions_repo.get_by_portfolio(portfolio_id)

    def update_transaction(
        self,
        txn_id: uuid.UUID,
        organization_id: uuid.UUID,
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
        txn = self.get_transaction(txn_id, organization_id)
        old_symbol = txn.symbol
        old_portfolio_id = txn.portfolio_id

        if symbol is not None:
            txn.symbol = symbol.upper().strip()
            txn.asset_id = _ensure_asset_exists(self.session, txn.symbol)
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
        return txn

    def delete_transaction(self, txn_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
        txn = self.get_transaction(txn_id, organization_id)
        portfolio_id = txn.portfolio_id
        symbol = txn.symbol

        deleted = self.transactions_repo.delete(txn_id)
        if deleted:
            self.recalculate_position(portfolio_id, symbol)
            self.session.commit()
        return deleted

    def recalculate_position(self, portfolio_id: uuid.UUID, symbol: str) -> None:
        symbol = symbol.upper().strip()
        
        # Query manual transactions (kind != broker_snapshot)
        txns = (
            self.session.query(Transaction)
            .filter(
                Transaction.portfolio_id == portfolio_id,
                Transaction.symbol == symbol,
                Transaction.transaction_type.in_({"BUY", "SELL", "BONUS", "SPLIT"}),
                Transaction.kind != "broker_snapshot",
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

        pos = (
            self.session.query(Position)
            .filter(Position.portfolio_id == portfolio_id, Position.symbol == symbol)
            .first()
        )

        if net_qty <= 0:
            if pos:
                self.session.delete(pos)
                self.session.flush()
            return

        asset_id = _ensure_asset_exists(self.session, symbol)

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

    def generate_portfolio_snapshot(self, portfolio_id: uuid.UUID, organization_id: uuid.UUID) -> PortfolioSnapshot:
        # Validate portfolio
        self.get_portfolio(portfolio_id, organization_id)

        positions = self.positions_repo.get_by_portfolio(portfolio_id)
        market_value = 0.0
        total_invested = 0.0
        position_values = {}

        for pos in positions:
            quote = self.session.scalar(select(LatestQuote).filter_by(symbol=pos.symbol))
            price = float(quote.price) if quote and quote.price is not None else float(pos.avg_buy_price)

            qty = float(pos.quantity)
            val = qty * price
            cost = qty * float(pos.avg_buy_price)

            market_value += val
            total_invested += cost
            position_values[pos.symbol] = val

        allocation = {}
        for symbol, val in position_values.items():
            if symbol.endswith("_MF"):
                atype = "mutual_fund"
            elif symbol.endswith("-USD"):
                atype = "crypto"
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

    def import_transaction_file(
        self,
        portfolio_id: uuid.UUID,
        organization_id: uuid.UUID,
        file_bytes: bytes,
        filename: str,
        broker: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Validate portfolio membership
        self.get_portfolio(portfolio_id, organization_id)

        ext = filename.split(".")[-1].lower() if "." in filename else "csv"
        from app.domain.services.portfolio_importer import parse_transaction_file
        rows, errors = parse_transaction_file(file_bytes, ext, broker)
        if errors:
            raise ValidationError(f"File parsing errors: {'; '.join(errors[:5])}")

        committed = 0
        skipped = 0
        symbols_to_recalc = set()

        for row in rows:
            broker_ref = row.get("broker_reference")
            broker_name = row.get("broker") or "import"
            if broker_ref:
                stmt = select(Transaction).where(
                    (Transaction.portfolio_id == portfolio_id) &
                    (Transaction.broker == broker_name) &
                    (Transaction.broker_reference == broker_ref)
                )
                exists = self.session.execute(stmt).scalars().first()
                if exists:
                    skipped += 1
                    continue

            symbol = row["symbol"]
            asset_id = _ensure_asset_exists(self.session, symbol)

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
        return {"committed": committed, "skipped": skipped, "errors": errors}

    def import_cdsl_cas(
        self,
        portfolio_id: uuid.UUID,
        organization_id: uuid.UUID,
        file_bytes: bytes,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Validate portfolio membership
        self.get_portfolio(portfolio_id, organization_id)

        from app.domain.services.portfolio_importer import parse_cdsl_cas
        try:
            payloads, summary = parse_cdsl_cas(file_bytes, password)
        except Exception as e:
            raise ValidationError(str(e))

        symbols_to_recalc = set()
        for p in payloads:
            symbol = p["symbol"]
            asset_id = _ensure_asset_exists(self.session, symbol)

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

            symbols_to_recalc.add(symbol)

        for sym in symbols_to_recalc:
            self.recalculate_position(portfolio_id, sym)

        self.session.commit()
        return {
            "status": "success",
            "imported_holdings": len(payloads),
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
        from app.domain.entities.market import Asset

        seen_symbols = set()
        for row in rows:
            symbol = row["symbol"]
            quantity = row["quantity"]
            if quantity <= 0:
                continue
            avg_price = row["avg_price"]

            asset_id = _ensure_asset_exists(self.session, symbol)

            asset = self.session.scalar(select(Asset).filter_by(symbol=symbol))
            if not asset:
                self.session.add(Asset(id=asset_id, symbol=symbol, name=row.get("name", symbol), asset_class=row.get("asset_class", "equity")))
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
        organization_id: uuid.UUID,
        holdings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        self.get_portfolio(portfolio_id, organization_id)

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

        return self._sync_broker_snapshot(portfolio_id, "zerodha", rows)

    def sync_binance_holdings(
        self,
        portfolio_id: uuid.UUID,
        organization_id: uuid.UUID,
        balances: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """balances: Binance /api/v3/account "balances" list — each {"asset": str,
        "free": str, "locked": str}. Binance's account endpoint reports current
        balance only, not cost basis, so avg_price is 0 — accurate P&L for these
        positions requires importing trade history via the CSV/XLSX importer."""
        self.get_portfolio(portfolio_id, organization_id)

        rows = []
        for b in balances:
            asset = (b.get("asset") or "").upper().strip()
            if not asset or asset in ("USDT", "USD", "BUSD", "USDC"):
                continue
            quantity = float(b.get("free") or 0) + float(b.get("locked") or 0)
            rows.append({
                "symbol": f"{asset}-USD",
                "quantity": quantity,
                "avg_price": 0.0,
                "name": asset,
                "asset_class": "crypto",
            })

        return self._sync_broker_snapshot(portfolio_id, "binance", rows)

    def sync_groww_holdings(
        self,
        portfolio_id: uuid.UUID,
        organization_id: uuid.UUID,
        holdings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """holdings: Groww GET /holdings/user "holdings" list — each includes
        trading_symbol, quantity, average_price (see GrowwClient.get_holdings)."""
        self.get_portfolio(portfolio_id, organization_id)

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

        return self._sync_broker_snapshot(portfolio_id, "groww", rows)

    def create_manual_asset(
        self,
        portfolio_id: uuid.UUID,
        name: str,
        symbol: str,
        asset_class: str,
        quantity: float,
        price: float,
    ) -> str:
        from app.domain.entities.market import Asset

        symbol_clean = symbol.upper().strip()
        asset = self.session.scalar(select(Asset).filter_by(symbol=symbol_clean))
        if not asset:
            asset = Asset(
                id=uuid.uuid5(uuid.NAMESPACE_DNS, symbol_clean),
                symbol=symbol_clean,
                name=name,
                asset_class=asset_class,
                metadata_payload={"sector": "Manual"}
            )
            self.session.add(asset)
            self.session.flush()

        _ensure_asset_exists(self.session, symbol_clean)

        txn = Transaction(
            portfolio_id=portfolio_id,
            symbol=symbol_clean,
            asset_id=asset.id,
            transaction_type="BUY",
            quantity=quantity,
            price=price,
            transaction_date=datetime.now(timezone.utc),
            notes="Manual asset creation",
            broker="manual",
            kind="trade"
        )
        self.transactions_repo.create(txn)
        self.session.commit()

        self.recalculate_position(portfolio_id, symbol_clean)
        self.session.commit()
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

        txn = Transaction(
            portfolio_id=portfolio_id,
            symbol=symbol_clean,
            asset_id=pos.asset_id,
            transaction_type="SPLIT",
            quantity=qty,
            price=new_unit_price,
            transaction_date=datetime.now(timezone.utc),
            notes=notes or f"Valuation update: {new_value}",
            broker="manual",
            kind="trade"
        )
        self.transactions_repo.create(txn)
        self.session.commit()
        return new_unit_price

    def count_broker_positions(self, broker: str) -> int:
        return (
            self.session.query(Position)
            .join(Transaction, (Transaction.portfolio_id == Position.portfolio_id) & (Transaction.symbol == Position.symbol))
            .filter(Transaction.broker == broker, Transaction.kind == "broker_snapshot")
            .distinct()
            .count()
        )
