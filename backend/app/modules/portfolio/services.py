"""Portfolio business logic."""

import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, AuditLog, AssetValuation, Position, PriceHistory, Transaction
from app.modules.portfolio.repositories import AssetRepository, PositionRepository
from app.modules.portfolio.schemas import (AssetCreate, AssetResponse, PortfolioResponse, PositionCreate,
                                           PositionResponse)
from app.shared.constants import AssetType, TransactionType
from app.shared.exceptions import NotFoundError
from app.shared.interfaces import AssetSource

logger = logging.getLogger("portfolio.service")


class PortfolioService:
    """Manage portfolio, positions, and cost basis."""

    def __init__(self, session: Session):
        self.session = session
        self.asset_repo = AssetRepository(session)
        self.position_repo = PositionRepository(session)
        logger.debug("PortfolioService initialised with session id=%s", id(session))

    def create_asset(self, data: AssetCreate | dict) -> Asset:
        if isinstance(data, dict):
            data = AssetCreate(**data)
        logger.debug("create_asset: symbol=%s name=%s type=%s", data.symbol, data.name, data.asset_type)

        from app.modules.portfolio.metadata_schemas import ILLIQUID_TYPES
        asset_type_val = str(data.asset_type.value if hasattr(data.asset_type, "value") else data.asset_type)
        is_tradeable = asset_type_val not in ILLIQUID_TYPES

        asset = self.asset_repo.upsert(
            symbol=data.symbol,
            name=data.name,
            asset_type=data.asset_type,
            exchange=data.exchange,
            sub_type=getattr(data, "sub_type", None),
        )

        asset.is_tradeable = is_tradeable
        if asset_type_val == AssetType.CRYPTO.value:
            asset.currency = "USD"
        if data.asset_metadata is not None:
            asset.asset_metadata = data.asset_metadata.model_dump()

        self.session.commit()
        logger.info("create_asset: symbol=%s id=%s is_tradeable=%s committed",
                    data.symbol, asset.id, is_tradeable)
        return asset

    def get_asset(self, symbol: str) -> Optional[Asset]:
        logger.debug("get_asset: symbol=%s", symbol)
        asset = self.session.query(Asset).filter(Asset.symbol == symbol).first()
        if asset:
            logger.debug("get_asset: symbol=%s found id=%s type=%s", symbol, asset.id, asset.asset_type)
        else:
            logger.debug("get_asset: symbol=%s not found", symbol)
        return asset

    def list_assets(self, asset_type: Optional[AssetType] = None) -> List[Asset]:
        logger.debug("list_assets: filter_type=%s", asset_type)
        query = self.session.query(Asset)
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)
        assets = query.all()
        logger.info("list_assets: returned %d assets (filter_type=%s)", len(assets), asset_type)
        return assets

    def create_position(self, data: PositionCreate | dict, user_id: Optional[int] = None) -> Position:
        if isinstance(data, dict):
            data = PositionCreate(**data)
        pos_data = data.dict()

        # Seed current_value from cost basis until a price refresh updates it
        default_value = pos_data["quantity"] * pos_data["avg_buy_price"]
        pos_data.setdefault("current_value", default_value)
        logger.debug(
            "create_position: asset_id=%s qty=%.4f avg_buy_price=%.4f seeded_value=%.2f",
            pos_data.get("asset_id"), pos_data["quantity"], pos_data["avg_buy_price"], pos_data["current_value"]
        )

        pos = Position(**pos_data)
        if user_id is not None:
            pos.user_id = user_id
        self.session.add(pos)
        self.session.commit()
        logger.info("create_position: id=%s asset_id=%s qty=%.4f committed", pos.id, pos.asset_id, pos.quantity)
        return pos

    def get_position(self, position_id: int, user_id: Optional[int] = None) -> Optional[Position]:
        from sqlalchemy import or_
        logger.debug("get_position: id=%s user_id=%s", position_id, user_id)
        query = self.session.query(Position).filter(Position.id == position_id)
        if user_id is not None:
            query = query.filter(or_(Position.user_id == user_id, Position.user_id.is_(None)))
        pos = query.first()
        if pos:
            logger.debug("get_position: id=%s found asset_id=%s qty=%.4f", position_id, pos.asset_id, pos.quantity)
        else:
            logger.debug("get_position: id=%s not found (user_id=%s)", position_id, user_id)
        return pos

    def list_positions(self, asset_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Position]:
        from sqlalchemy import or_
        logger.debug("list_positions: filter_asset_id=%s user_id=%s", asset_id, user_id)
        query = self.session.query(Position)
        if asset_id:
            query = query.filter(Position.asset_id == asset_id)
        if user_id is not None:
            query = query.filter(or_(Position.user_id == user_id, Position.user_id.is_(None)))
        positions = query.all()
        logger.info("list_positions: returned %d positions (filter_asset_id=%s user_id=%s)", len(positions), asset_id, user_id)
        return positions

    def _normalize_asset_type(self, raw_type: str, symbol: str) -> AssetType:
        normalized = str(raw_type or "").strip().lower()
        if normalized in AssetType._value2member_map_:
            return AssetType(normalized)
        if normalized.startswith("crypto") or symbol.upper().endswith("-USD"):
            return AssetType.CRYPTO
        if normalized.startswith("mutual") or "mf" in normalized:
            return AssetType.MUTUAL_FUND
        if normalized.startswith("commodity"):
            return AssetType.COMMODITY
        return AssetType.EQUITY

    def _guess_exchange(self, provider_name: str, asset_type: AssetType) -> str:
        if asset_type == AssetType.CRYPTO:
            return provider_name.upper()
        return "NSE"

    def _update_or_create_position(self, asset: Asset, qty: float, avg_buy_price: float, user_id: Optional[int] = None, current_price: Optional[float] = None) -> Position:
        existing = self.position_repo.find_by_asset(asset.id, user_id=user_id)
        if existing:
            cost_basis = qty * avg_buy_price
            existing.quantity = qty
            existing.avg_buy_price = avg_buy_price
            if current_price is not None:
                existing.current_value = round(qty * current_price, 2)
            elif not existing.current_value:
                existing.current_value = cost_basis
            existing.pnl = existing.current_value - cost_basis if avg_buy_price else None
            existing.pnl_percent = (existing.pnl / cost_basis * 100) if avg_buy_price > 0 else 0.0
            self.session.commit()
            logger.info("_update_or_create_position: updated position id=%s asset_id=%s", existing.id, asset.id)
            return existing

        current_value = round(qty * current_price, 2) if current_price is not None else qty * avg_buy_price
        return self.create_position({
            "asset_id": asset.id,
            "quantity": qty,
            "avg_buy_price": avg_buy_price,
            "current_value": current_value,
        }, user_id=user_id)

    def sync_portfolio(self, provider: AssetSource, force_refresh: bool = True, dry_run: bool = False, user_id: Optional[int] = None) -> dict:
        logger.info(
            "sync_portfolio: provider=%s force_refresh=%s dry_run=%s",
            provider.provider_name,
            force_refresh,
            dry_run,
        )

        provider.validate_credentials()
        holdings = provider.fetch_holdings()
        logger.info("sync_portfolio: fetched %d holdings from %s", len(holdings), provider.provider_name)

        if dry_run:
            return {
                "status": "dry_run",
                "broker": provider.provider_name,
                "force_refresh": force_refresh,
                "holdings_count": len(holdings),
                "updated_assets": 0,
                "errors": [],
            }

        updated_assets = 0
        errors: List[str] = []

        for holding in holdings:
            try:
                asset_type = self._normalize_asset_type(holding.type, holding.symbol)
                exchange = self._guess_exchange(provider.provider_name, asset_type)
                asset = self.create_asset({
                    "symbol": holding.symbol,
                    "name": holding.name or holding.symbol,
                    "asset_type": asset_type,
                    "exchange": exchange,
                    "sub_type": holding.sub_type or holding.type,
                })
                if holding.current_price is not None:
                    asset.current_price = holding.current_price
                    self.session.flush()

                # Upsert a broker_snapshot transaction so recalculate_position has a
                # source of truth even when no manual transactions exist. Re-syncing
                # updates the same row rather than inserting a duplicate.
                existing_snap = (
                    self.session.query(Transaction)
                    .filter_by(
                        asset_id=asset.id,
                        user_id=user_id,
                        broker=provider.provider_name,
                        kind="broker_snapshot",
                    )
                    .first()
                )
                if existing_snap:
                    existing_snap.quantity = holding.qty
                    existing_snap.price = holding.avg_buy_price
                    existing_snap.total_value = holding.qty * holding.avg_buy_price
                    existing_snap.transaction_date = datetime.utcnow()
                else:
                    self.session.add(Transaction(
                        asset_id=asset.id,
                        user_id=user_id,
                        transaction_type=TransactionType.BUY.value,
                        quantity=holding.qty,
                        price=holding.avg_buy_price,
                        total_value=holding.qty * holding.avg_buy_price,
                        transaction_date=datetime.utcnow(),
                        broker=provider.provider_name,
                        kind="broker_snapshot",
                    ))
                self.session.flush()

                self.recalculate_position(asset.id, user_id)
                updated_assets += 1
            except Exception as exc:
                logger.exception("sync_portfolio: failed to persist holding %s: %s", holding.symbol, exc)
                errors.append(str(exc))
                try:
                    self.session.rollback()
                except Exception:
                    pass

        # Commit all snapshot upserts and recalculated positions in one shot.
        # create_asset() commits per-asset (to flush the upsert), leaving the
        # snapshot + recalculate writes in an uncommitted transaction that must
        # be committed here or they are lost when the session is closed.
        if updated_assets > 0:
            self.session.commit()

        return {
            "status": "success",
            "broker": provider.provider_name,
            "force_refresh": force_refresh,
            "holdings_count": len(holdings),
            "updated_assets": updated_assets,
            "errors": errors,
        }

    def update_position_price(self, position_id: int, new_price: float):
        logger.debug("update_position_price: position_id=%s new_price=%.4f", position_id, new_price)

        pos = self.get_position(position_id)
        if not pos:
            logger.error("update_position_price: position_id=%s not found", position_id)
            raise NotFoundError(f"Position {position_id} not found")

        # For non-tradeable assets, route through valuation provider instead of market price
        asset = pos.asset
        if asset and not getattr(asset, "is_tradeable", True):
            from app.modules.valuation.factory import get_valuation_provider
            asset_type = str(asset.asset_type.value if hasattr(asset.asset_type, "value") else asset.asset_type)
            provider = get_valuation_provider(asset_type, self.session)
            if provider:
                metadata = asset.asset_metadata or {}
                computed = provider.compute_current_value(metadata, [])
                new_price = computed / pos.quantity if pos.quantity else computed
                logger.debug("update_position_price: non-tradeable %s routed through %s → value=%.2f",
                             asset.symbol, provider.provider_name, computed)

        old_value = pos.current_value
        pos.current_value = pos.quantity * new_price
        pos.pnl = pos.current_value - (pos.quantity * pos.avg_buy_price)
        pos.pnl_percent = (pos.pnl / (pos.quantity * pos.avg_buy_price) * 100) if pos.avg_buy_price > 0 else 0

        logger.debug(
            "update_position_price: position_id=%s old_value=%.2f new_value=%.2f pnl=%.2f pnl_pct=%.2f%%",
            position_id, old_value, pos.current_value, pos.pnl, pos.pnl_percent
        )
        self.session.commit()
        self.session.add(AuditLog(
            entity="position", entity_id=position_id, action="update",
            before_json={"current_value": old_value},
            after_json={"current_value": pos.current_value, "pnl": pos.pnl},
        ))
        self.session.commit()
        logger.info("update_position_price: position_id=%s updated price=%.4f pnl=%.2f", position_id, new_price,
                    pos.pnl)
        return pos

    def update_manual_valuation(self, asset_id: int, new_value: float, notes: str = None) -> Position:
        """Update current value for a manually-valued illiquid asset and record history."""
        from datetime import timezone, date
        asset = self.session.query(Asset).filter(Asset.id == asset_id).first()
        if not asset:
            raise NotFoundError(f"Asset {asset_id} not found")

        pos = self.session.query(Position).filter(Position.asset_id == asset_id).first()
        if not pos:
            raise NotFoundError(f"No position found for asset {asset_id}")

        old_value = pos.current_value
        quantity = pos.quantity or 1.0
        unit_price = new_value / quantity

        pos.current_value = new_value
        pos.pnl = new_value - (quantity * pos.avg_buy_price)
        pos.pnl_percent = (pos.pnl / (quantity * pos.avg_buy_price) * 100) if pos.avg_buy_price > 0 else 0
        pos.last_valued_at = datetime.now(timezone.utc)

        self.session.add(AssetValuation(
            asset_id=asset_id,
            valuation_amount=new_value,
            valuation_date=date.today(),
            valuation_method="manual",
            notes=notes,
        ))
        self.session.add(AuditLog(
            entity="position", entity_id=pos.id, action="manual_valuation",
            before_json={"current_value": old_value},
            after_json={"current_value": new_value},
        ))
        self.session.commit()
        logger.info("update_manual_valuation: asset_id=%s new_value=%.2f committed", asset_id, new_value)
        return pos

    def get_portfolio_by_type(self, user_id: Optional[int] = None) -> dict:
        """Return allocation breakdown by asset type."""
        positions = self.list_positions(user_id=user_id)
        allocation: dict = {}
        total = sum(p.current_value or 0.0 for p in positions)

        for pos in positions:
            asset_type = str(pos.asset.asset_type) if pos.asset else "unknown"
            allocation.setdefault(asset_type, {"value": 0.0, "count": 0})
            allocation[asset_type]["value"] += pos.current_value or 0.0
            allocation[asset_type]["count"] += 1

        for at, data in allocation.items():
            data["pct"] = round(data["value"] / total * 100, 2) if total > 0 else 0.0

        return {"total_value": total, "by_type": allocation}

    def record_transaction(self, asset_id: int, trans_type: TransactionType,
                           quantity: float, price: float, date: datetime, broker: str = None,
                           user_id: Optional[int] = None) -> Transaction:
        total_value = quantity * price
        logger.info(
            "record_transaction: asset_id=%s type=%s qty=%.4f price=%.4f total=%.2f broker=%s",
            asset_id, trans_type, quantity, price, total_value, broker
        )

        trans = Transaction(
            asset_id=asset_id,
            transaction_type=trans_type,
            quantity=quantity,
            price=price,
            transaction_date=date,
            total_value=total_value,
            broker=broker,
            user_id=user_id,
        )
        self.session.add(trans)
        self.session.commit()
        self.session.add(AuditLog(
            entity="transaction", entity_id=trans.id, action="create",
            after_json={"asset_id": asset_id, "type": str(trans_type), "qty": quantity, "price": price,
                        "total": total_value},
        ))
        self.session.commit()
        logger.info("record_transaction: committed id=%s asset_id=%s type=%s total=%.2f",
                    trans.id, asset_id, trans_type, total_value)
        return trans

    def save_price_history(self, asset_id: int, date: datetime, close: float,
                           open_price: float = None, high: float = None,
                           low: float = None, volume: float = None) -> PriceHistory:
        logger.debug("save_price_history: asset_id=%s date=%s close=%.4f", asset_id, date.date(), close)

        existing = self.session.query(PriceHistory).filter(
            PriceHistory.asset_id == asset_id,
            func.date(PriceHistory.date) == date.date()
        ).first()

        if existing:
            logger.debug("save_price_history: asset_id=%s date=%s — updating existing record id=%s",
                         asset_id, date.date(), existing.id)
            existing.close = close
            existing.open_price = open_price
            existing.high = high
            existing.low = low
            existing.volume = volume
            price = existing
        else:
            logger.debug("save_price_history: asset_id=%s date=%s — inserting new record", asset_id, date.date())
            price = PriceHistory(
                asset_id=asset_id,
                date=date,
                close=close,
                open_price=open_price,
                high=high,
                low=low,
                volume=volume
            )
            self.session.add(price)

        self.session.commit()
        logger.debug("save_price_history: committed asset_id=%s date=%s close=%.4f", asset_id, date.date(), close)
        return price

    def get_portfolio_summary(self, user_id: Optional[int] = None) -> PortfolioResponse:
        logger.info("get_portfolio_summary: loading positions user_id=%s", user_id)
        positions = self.list_positions(user_id=user_id)

        total_value = sum(p.current_value for p in positions)
        total_invested = sum(p.quantity * p.avg_buy_price for p in positions)
        total_pnl = total_value - total_invested
        pnl_percent = (total_pnl / total_invested * 100) if total_invested > 0 else 0

        logger.info(
            "get_portfolio_summary: positions=%d total_value=%.2f total_invested=%.2f "
            "total_pnl=%.2f pnl_pct=%.2f%%",
            len(positions), total_value, total_invested, total_pnl, pnl_percent
        )

        pos_responses = [
            PositionResponse(
                id=p.id,
                quantity=p.quantity,
                avg_buy_price=p.avg_buy_price,
                current_value=p.current_value,
                pnl=p.pnl,
                pnl_percent=p.pnl_percent,
                asset=AssetResponse.from_orm(p.asset),
                created_at=p.created_at
            )
            for p in positions
        ]

        return PortfolioResponse(
            total_value=total_value,
            total_invested=total_invested,
            total_pnl=total_pnl,
            pnl_percent=pnl_percent,
            positions_count=len(positions),
            positions=pos_responses
        )

    def recompute_avg_buy_price(self, position_id: int, user_id: Optional[int] = None) -> dict:
        """Recompute avg_buy_price via AVCO and update P&L. Delegates to recalculate_position."""
        from sqlalchemy import or_

        pos_q = self.session.query(Position).filter(Position.id == position_id)
        if user_id is not None:
            pos_q = pos_q.filter(or_(Position.user_id == user_id, Position.user_id.is_(None)))
        pos = pos_q.first()
        if not pos:
            raise NotFoundError(f"Position {position_id} not found")

        old_avg = float(pos.avg_buy_price)
        effective_user_id = user_id if user_id is not None else pos.user_id
        self.recalculate_position(pos.asset_id, effective_user_id)

        # recalculate_position deletes the position when net_qty <= 0 and flushes,
        # so we must re-query rather than refresh the (potentially deleted) object.
        from sqlalchemy import or_
        refreshed = (
            self.session.query(Position)
            .filter(Position.id == position_id)
            .first()
        )
        if refreshed is None:
            self.session.add(AuditLog(
                entity="position", entity_id=position_id, action="recompute_cost",
                before_json={"avg_buy_price": old_avg},
                after_json={"deleted": True},
            ))
            self.session.commit()
            logger.info("recompute_avg_buy_price: position_id=%s deleted (net_qty<=0)", position_id)
            return {"position_id": position_id, "updated": True, "old_avg_buy_price": old_avg, "new_avg_buy_price": 0.0, "deleted": True}

        new_avg = float(refreshed.avg_buy_price)
        self.session.add(AuditLog(
            entity="position", entity_id=position_id, action="recompute_cost",
            before_json={"avg_buy_price": old_avg},
            after_json={"avg_buy_price": new_avg},
        ))
        self.session.commit()
        logger.info("recompute_avg_buy_price: position_id=%s old=%.4f new=%.4f", position_id, old_avg, new_avg)
        return {"position_id": position_id, "updated": True, "old_avg_buy_price": old_avg, "new_avg_buy_price": new_avg}

    def recalculate_position(self, asset_id: int, user_id: int) -> None:
        """Recompute position qty and avg_buy_price from BUY/SELL transactions using AVCO.

        AVCO (Average Cost): on BUY, running weighted average is updated; on SELL, qty drops
        and the average is unchanged. Deletes the position if net quantity is ≤ 0.
        """
        from sqlalchemy import or_

        buy_sell = {TransactionType.BUY.value, TransactionType.SELL.value}
        txns = (
            self.session.query(Transaction)
            .filter(
                Transaction.asset_id == asset_id,
                Transaction.transaction_type.in_(buy_sell),
                # Exclude broker_snapshot rows: they represent the broker's reported
                # total position, not incremental trades. Including them alongside
                # manual transactions would double-count every share.
                Transaction.kind != "broker_snapshot",
            )
            .filter(or_(Transaction.user_id == user_id, Transaction.user_id.is_(None)))
            .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
            .all()
        )

        # If no manual transactions exist, fall back to the broker snapshot so
        # that broker-only portfolios still compute a valid position.
        if not txns:
            snap = (
                self.session.query(Transaction)
                .filter(
                    Transaction.asset_id == asset_id,
                    Transaction.kind == "broker_snapshot",
                )
                .filter(or_(Transaction.user_id == user_id, Transaction.user_id.is_(None)))
                .order_by(Transaction.transaction_date.desc())
                .first()
            )
            if snap:
                txns = [snap]

        net_qty = 0.0
        running_avg = 0.0
        for t in txns:
            qty = float(t.quantity)
            if t.transaction_type == TransactionType.BUY.value:
                new_qty = net_qty + qty
                if new_qty > 0:
                    running_avg = (net_qty * running_avg + qty * float(t.price)) / new_qty
                net_qty = new_qty
            else:
                net_qty = max(net_qty - qty, 0.0)

        pos = (
            self.session.query(Position)
            .filter(Position.asset_id == asset_id)
            .filter(or_(Position.user_id == user_id, Position.user_id.is_(None)))
            .first()
        )

        if net_qty <= 0:
            if pos:
                self.session.delete(pos)
                self.session.flush()
                logger.info("recalculate_position: deleted position asset_id=%s user_id=%s", asset_id, user_id)
            return

        asset = self.session.query(Asset).filter(Asset.id == asset_id).first()
        current_price = asset.current_price if asset and asset.current_price else running_avg
        current_value = net_qty * current_price
        cost_basis = net_qty * running_avg
        pnl = round(current_value - cost_basis, 4) if running_avg > 0 else None
        pnl_pct = round(pnl / cost_basis * 100, 4) if running_avg > 0 and cost_basis > 0 else None

        if pos:
            pos.quantity = net_qty
            pos.avg_buy_price = running_avg
            pos.current_value = current_value
            pos.pnl = pnl
            pos.pnl_percent = pnl_pct
        else:
            pos = Position(
                asset_id=asset_id,
                user_id=user_id,
                quantity=net_qty,
                avg_buy_price=running_avg,
                current_value=current_value,
                pnl=pnl,
                pnl_percent=pnl_pct,
            )
            self.session.add(pos)

        self.session.flush()
        logger.info(
            "recalculate_position: asset_id=%s user_id=%s net_qty=%.4f avco=%.4f",
            asset_id, user_id, net_qty, running_avg,
        )

    def sync_assets(self, assets_data: List[dict]) -> List[Asset]:
        logger.info("sync_assets: syncing %d assets from broker", len(assets_data))
        synced = []
        for asset_data in assets_data:
            symbol = asset_data.get("symbol", "?")
            logger.debug("sync_assets: upserting symbol=%s", symbol)
            asset = self.create_asset(AssetCreate(**asset_data))
            synced.append(asset)
        logger.info("sync_assets: completed — %d assets upserted", len(synced))
        return synced
