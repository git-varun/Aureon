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

    def create_position(self, data: PositionCreate | dict) -> Position:
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
        self.session.add(pos)
        self.session.commit()
        logger.info("create_position: id=%s asset_id=%s qty=%.4f committed", pos.id, pos.asset_id, pos.quantity)
        return pos

    def get_position(self, position_id: int) -> Optional[Position]:
        logger.debug("get_position: id=%s", position_id)
        pos = self.session.query(Position).filter(Position.id == position_id).first()
        if pos:
            logger.debug("get_position: id=%s found asset_id=%s qty=%.4f", position_id, pos.asset_id, pos.quantity)
        else:
            logger.debug("get_position: id=%s not found", position_id)
        return pos

    def list_positions(self, asset_id: Optional[int] = None) -> List[Position]:
        logger.debug("list_positions: filter_asset_id=%s", asset_id)
        query = self.session.query(Position)
        if asset_id:
            query = query.filter(Position.asset_id == asset_id)
        positions = query.all()
        logger.info("list_positions: returned %d positions (filter_asset_id=%s)", len(positions), asset_id)
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

    def _update_or_create_position(self, asset: Asset, qty: float, avg_buy_price: float) -> Position:
        existing = self.position_repo.find_by_asset(asset.id)
        if existing:
            cost_basis = qty * avg_buy_price
            existing.quantity = qty
            existing.avg_buy_price = avg_buy_price
            # Preserve current_value from last price refresh; seed to cost basis only if unset
            if not existing.current_value:
                existing.current_value = cost_basis
            existing.pnl = existing.current_value - cost_basis
            existing.pnl_percent = (existing.pnl / cost_basis * 100) if avg_buy_price > 0 else 0.0
            self.session.commit()
            logger.info("_update_or_create_position: updated position id=%s asset_id=%s", existing.id, asset.id)
            return existing

        return self.create_position({
            "asset_id": asset.id,
            "quantity": qty,
            "avg_buy_price": avg_buy_price,
        })

    def sync_portfolio(self, provider: AssetSource, force_refresh: bool = True, dry_run: bool = False) -> dict:
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
                    "name": holding.symbol,
                    "asset_type": asset_type,
                    "exchange": exchange,
                    "sub_type": holding.sub_type or holding.type,
                })
                self._update_or_create_position(asset, holding.qty, holding.avg_buy_price)
                updated_assets += 1
            except Exception as exc:
                logger.exception("sync_portfolio: failed to persist holding %s: %s", holding.symbol, exc)
                errors.append(str(exc))

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

    def get_portfolio_by_type(self) -> dict:
        """Return allocation breakdown by asset type."""
        positions = self.list_positions()
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
                           quantity: float, price: float, date: datetime, broker: str = None) -> Transaction:
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
            broker=broker
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

    def get_portfolio_summary(self) -> PortfolioResponse:
        logger.info("get_portfolio_summary: loading all positions")
        positions = self.list_positions()

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
