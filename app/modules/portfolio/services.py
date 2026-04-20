"""Portfolio business logic."""

import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, Position, PriceHistory, Transaction
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
        asset = self.asset_repo.upsert(
            symbol=data.symbol,
            name=data.name,
            asset_type=data.asset_type,
            exchange=data.exchange,
            sub_type=getattr(data, "sub_type", None),
        )
        logger.info("create_asset: symbol=%s id=%s committed", data.symbol, asset.id)
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
            existing.quantity = qty
            existing.avg_buy_price = avg_buy_price
            existing.current_value = qty * avg_buy_price
            existing.pnl = existing.current_value - (qty * avg_buy_price)
            existing.pnl_percent = 0.0 if avg_buy_price == 0 else (existing.pnl / (qty * avg_buy_price) * 100)
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

        old_value = pos.current_value
        pos.current_value = pos.quantity * new_price
        pos.pnl           = pos.current_value - (pos.quantity * pos.avg_buy_price)
        pos.pnl_percent   = (pos.pnl / (pos.quantity * pos.avg_buy_price) * 100) if pos.avg_buy_price > 0 else 0

        logger.debug(
            "update_position_price: position_id=%s old_value=%.2f new_value=%.2f pnl=%.2f pnl_pct=%.2f%%",
            position_id, old_value, pos.current_value, pos.pnl, pos.pnl_percent
        )
        self.session.commit()
        logger.info("update_position_price: position_id=%s updated price=%.4f pnl=%.2f", position_id, new_price, pos.pnl)
        return pos

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
            existing.close       = close
            existing.open_price  = open_price
            existing.high        = high
            existing.low         = low
            existing.volume      = volume
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

        total_value    = sum(p.current_value for p in positions)
        total_invested = sum(p.quantity * p.avg_buy_price for p in positions)
        total_pnl      = total_value - total_invested
        pnl_percent    = (total_pnl / total_invested * 100) if total_invested > 0 else 0

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
