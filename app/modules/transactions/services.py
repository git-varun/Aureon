"""Transactions services."""
import csv
import io
import logging
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, CostBasis, Transaction
from app.modules.transactions.models import Transaction  # noqa: F811 – alias re-export
from app.shared.constants import AssetType, TransactionType
from app.shared.exceptions import NotFoundError

logger = logging.getLogger("transactions.service")


class TransactionService:
    def __init__(self, db: Session):
        self.db = db
        logger.debug("TransactionService initialised with session id=%s", id(db))

    def get_all_transactions(
        self,
        limit: int = 100,
        offset: int = 0,
        asset_id: Optional[int] = None,
        broker: Optional[str] = None,
        transaction_type: Optional[TransactionType] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> List[Transaction]:
        logger.debug(
            "get_all_transactions: limit=%d offset=%d asset_id=%s broker=%s type=%s from=%s to=%s",
            limit, offset, asset_id, broker, transaction_type, from_date, to_date
        )

        q = self.db.query(Transaction)
        if asset_id is not None:
            q = q.filter(Transaction.asset_id == asset_id)
        if broker:
            q = q.filter(Transaction.broker == broker)
        if transaction_type:
            q = q.filter(Transaction.transaction_type == transaction_type)
        if from_date:
            q = q.filter(Transaction.transaction_date >= from_date)
        if to_date:
            q = q.filter(Transaction.transaction_date <= to_date)

        results = q.order_by(Transaction.transaction_date.desc()).offset(offset).limit(limit).all()
        logger.info("get_all_transactions: returned %d transactions (limit=%d offset=%d)", len(results), limit, offset)
        return results

    def create_transaction(self, **data) -> Transaction:
        logger.info(
            "create_transaction: asset_id=%s type=%s qty=%s price=%s broker=%s",
            data.get("asset_id"), data.get("transaction_type"),
            data.get("quantity"), data.get("price"), data.get("broker")
        )
        transaction = Transaction(**data)
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)
        logger.info("create_transaction: committed id=%s total_value=%s",
                    transaction.id, getattr(transaction, "total_value", "?"))
        return transaction

    def get_transaction_by_id(self, transaction_id: int) -> Transaction:
        logger.debug("get_transaction_by_id: id=%s", transaction_id)
        transaction = self.db.query(Transaction).filter(Transaction.id == transaction_id).first()
        if not transaction:
            logger.warning("get_transaction_by_id: id=%s not found", transaction_id)
            raise NotFoundError(f"Transaction {transaction_id} not found")
        logger.debug("get_transaction_by_id: id=%s found type=%s asset_id=%s",
                     transaction_id, transaction.transaction_type, transaction.asset_id)
        return transaction

    def update_transaction(self, transaction_id: int, **updates) -> Transaction:
        logger.info("update_transaction: id=%s updates=%s", transaction_id, list(updates.keys()))
        transaction = self.get_transaction_by_id(transaction_id)
        for key, value in updates.items():
            if hasattr(transaction, key):
                old = getattr(transaction, key)
                setattr(transaction, key, value)
                logger.debug("update_transaction: id=%s field=%s old=%r new=%r", transaction_id, key, old, value)
        self.db.commit()
        self.db.refresh(transaction)
        logger.info("update_transaction: committed id=%s", transaction_id)
        return transaction

    def delete_transaction(self, transaction_id: int) -> None:
        logger.info("delete_transaction: id=%s", transaction_id)
        transaction = self.get_transaction_by_id(transaction_id)
        self.db.delete(transaction)
        self.db.commit()
        logger.info("delete_transaction: id=%s deleted", transaction_id)


class TaxService:
    """Indian taxation (FIFO) capital gains calculator and CSV importer."""

    LTCG_EXEMPTION  = 100_000.0  # ₹1,00,000
    STCG_RATE       = 0.15       # 15%
    LTCG_RATE       = 0.10       # 10%
    LONG_TERM_DAYS  = 365        # >= 1 year → LTCG

    def __init__(self, db: Session):
        self.db = db
        logger.debug("TaxService initialised with session id=%s", id(db))

    # ------------------------------------------------------------------
    # Tax summary
    # ------------------------------------------------------------------

    def get_tax_summary(self, year: int) -> dict:
        """Compute FIFO capital gains for all SELL transactions in `year`."""
        logger.info("get_tax_summary: year=%d", year)

        sell_txns = (
            self.db.query(Transaction)
            .filter(
                Transaction.transaction_type == TransactionType.SELL,
                Transaction.transaction_date >= datetime(year, 1, 1),
                Transaction.transaction_date < datetime(year + 1, 1, 1),
            )
            .order_by(Transaction.transaction_date)
            .all()
        )
        logger.info("get_tax_summary: year=%d found %d SELL transactions", year, len(sell_txns))

        stcg_gains = 0.0
        ltcg_gains = 0.0

        for sell in sell_txns:
            remaining_sell_qty = sell.quantity
            sell_price         = sell.price
            logger.debug(
                "get_tax_summary: processing SELL id=%s asset_id=%s qty=%.4f price=%.4f date=%s",
                sell.id, sell.asset_id, sell.quantity, sell.price, sell.transaction_date.date()
            )

            lots = self._get_fifo_lots(sell.asset_id, sell.transaction_date)
            logger.debug("get_tax_summary: asset_id=%s — %d FIFO lots available", sell.asset_id, len(lots))

            for lot in lots:
                if remaining_sell_qty <= 0:
                    break

                lot_qty = lot["quantity"]
                if lot_qty <= 0:
                    continue

                matched_qty        = min(remaining_sell_qty, lot_qty)
                remaining_sell_qty -= matched_qty

                buy_price  = lot["purchase_price"]
                buy_date   = lot["purchase_date"]
                holding_days = (sell.transaction_date - buy_date).days
                gain         = (sell_price - buy_price) * matched_qty

                if holding_days >= self.LONG_TERM_DAYS:
                    ltcg_gains += gain
                    logger.debug(
                        "get_tax_summary: LTCG — held=%dd matched_qty=%.4f buy=%.4f sell=%.4f gain=%.2f",
                        holding_days, matched_qty, buy_price, sell_price, gain
                    )
                else:
                    stcg_gains += gain
                    logger.debug(
                        "get_tax_summary: STCG — held=%dd matched_qty=%.4f buy=%.4f sell=%.4f gain=%.2f",
                        holding_days, matched_qty, buy_price, sell_price, gain
                    )

        stcg_tax           = max(0.0, stcg_gains) * self.STCG_RATE
        ltcg_above_exemption = max(0.0, ltcg_gains - self.LTCG_EXEMPTION)
        ltcg_tax           = ltcg_above_exemption * self.LTCG_RATE

        logger.info(
            "get_tax_summary: year=%d stcg_gains=%.2f ltcg_gains=%.2f "
            "stcg_tax=%.2f ltcg_tax=%.2f (after ₹%.0f exemption)",
            year, stcg_gains, ltcg_gains, stcg_tax, ltcg_tax, self.LTCG_EXEMPTION
        )

        return {
            "year":                    year,
            "stcg_gains":              round(stcg_gains, 2),
            "ltcg_gains":              round(ltcg_gains, 2),
            "stcg_tax":                round(stcg_tax, 2),
            "ltcg_tax_above_exemption": round(ltcg_tax, 2),
            "transactions_analyzed":   len(sell_txns),
        }

    def _get_fifo_lots(self, asset_id: int, before_date: datetime) -> list:
        """Return buy lots in FIFO order for `asset_id` purchased before `before_date`."""
        logger.debug("_get_fifo_lots: asset_id=%s before_date=%s", asset_id, before_date.date())

        cost_basis_rows = (
            self.db.query(CostBasis)
            .filter(
                CostBasis.asset_id == asset_id,
                CostBasis.purchase_date < before_date,
            )
            .order_by(CostBasis.purchase_date)
            .all()
        )
        if cost_basis_rows:
            logger.debug("_get_fifo_lots: asset_id=%s — %d CostBasis lots (primary source)",
                         asset_id, len(cost_basis_rows))
            return [
                {
                    "quantity":       cb.quantity,
                    "purchase_price": cb.purchase_price,
                    "purchase_date":  cb.purchase_date,
                }
                for cb in cost_basis_rows
            ]

        # Fall back to BUY transactions
        logger.debug("_get_fifo_lots: asset_id=%s — no CostBasis rows, falling back to BUY transactions", asset_id)
        buy_txns = (
            self.db.query(Transaction)
            .filter(
                Transaction.asset_id == asset_id,
                Transaction.transaction_type == TransactionType.BUY,
                Transaction.transaction_date < before_date,
            )
            .order_by(Transaction.transaction_date)
            .all()
        )
        logger.debug("_get_fifo_lots: asset_id=%s — %d BUY transaction lots (fallback)", asset_id, len(buy_txns))
        return [
            {
                "quantity":       t.quantity,
                "purchase_price": t.price,
                "purchase_date":  t.transaction_date,
            }
            for t in buy_txns
        ]

    # ------------------------------------------------------------------
    # CSV import
    # ------------------------------------------------------------------

    def import_transactions_csv(self, content: bytes, broker: str) -> int:
        """Parse a CSV file and insert Transaction rows."""
        logger.info("import_transactions_csv: broker=%s content_bytes=%d", broker, len(content))

        text   = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))

        imported  = 0
        skipped   = 0
        row_index = 0

        for raw_row in reader:
            row_index += 1
            row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}
            try:
                symbol = row.get("symbol") or row.get("ticker") or row.get("scrip")
                if not symbol:
                    logger.debug("import_transactions_csv: row=%d — missing symbol, skipping", row_index)
                    skipped += 1
                    continue

                # Look up or create Asset
                asset = (
                    self.db.query(Asset)
                    .filter(Asset.symbol == symbol.upper())
                    .first()
                )
                if not asset:
                    logger.debug("import_transactions_csv: row=%d symbol=%s — new asset, inserting",
                                 row_index, symbol.upper())
                    asset = Asset(
                        symbol=symbol.upper(),
                        name=symbol.upper(),
                        asset_type=AssetType.EQUITY,
                    )
                    self.db.add(asset)
                    self.db.flush()

                raw_type = (row.get("type") or row.get("transaction_type") or "buy").lower()
                tx_type  = TransactionType.BUY if raw_type.startswith("b") else TransactionType.SELL

                raw_date = row.get("date") or row.get("transaction_date") or ""
                tx_date  = self._parse_date(raw_date)

                qty         = float(row.get("quantity") or row.get("qty") or 0)
                price       = float(row.get("price") or 0)
                total_value = qty * price

                logger.debug(
                    "import_transactions_csv: row=%d symbol=%s type=%s qty=%.4f price=%.4f total=%.2f date=%s",
                    row_index, symbol.upper(), tx_type, qty, price, total_value, tx_date.date()
                )

                txn = Transaction(
                    asset_id=asset.id,
                    transaction_type=tx_type,
                    quantity=qty,
                    price=price,
                    total_value=total_value,
                    transaction_date=tx_date,
                    broker=broker,
                )
                self.db.add(txn)
                imported += 1

            except Exception as exc:
                logger.warning("import_transactions_csv: row=%d — parse error: %s, skipping", row_index, exc)
                skipped += 1
                continue

        self.db.commit()
        logger.info("import_transactions_csv: broker=%s total_rows=%d imported=%d skipped=%d",
                    broker, row_index, imported, skipped)
        return imported

    @staticmethod
    def _parse_date(raw: str) -> datetime:
        """Try common date formats; fall back to utcnow."""
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y"):
            try:
                return datetime.strptime(raw.strip(), fmt)
            except ValueError:
                continue
        logger.debug("_parse_date: could not parse %r — using utcnow", raw)
        return datetime.utcnow()
