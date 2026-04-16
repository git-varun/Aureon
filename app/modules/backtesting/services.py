"""Backtesting services."""
import logging

from sqlalchemy.orm import Session
from typing import Dict, Any
from app.modules.backtesting.models import BacktestRun, BacktestResult
from app.shared.exceptions import NotFoundError

logger = logging.getLogger("backtesting.service")


class BacktestingService:
    def __init__(self, db: Session):
        self.db = db
        logger.debug("BacktestingService initialised with session id=%s", id(db))

    def create_backtest_run(
        self, user_id: int, strategy_name: str, symbols: str,
        start_date, end_date, initial_capital: float
    ) -> BacktestRun:
        logger.info(
            "create_backtest_run: user_id=%s strategy=%s symbols=%s start=%s end=%s capital=%.2f",
            user_id, strategy_name, symbols, start_date, end_date, initial_capital
        )

        run = BacktestRun(
            user_id=user_id,
            strategy_name=strategy_name,
            symbols=symbols,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        logger.info("create_backtest_run: committed id=%s strategy=%s", run.id, strategy_name)
        return run

    def run_backtest(self, run_id: int) -> Dict[str, Any]:
        logger.info("run_backtest: run_id=%s", run_id)

        run = self.db.query(BacktestRun).filter(BacktestRun.id == run_id).first()
        if not run:
            logger.error("run_backtest: run_id=%s not found", run_id)
            raise NotFoundError(f"Backtest run {run_id} not found")

        logger.debug(
            "run_backtest: run_id=%s strategy=%s symbols=%s capital=%.2f date_range=%s→%s",
            run_id, run.strategy_name, run.symbols, run.initial_capital, run.start_date, run.end_date
        )

        # Placeholder strategy execution
        result_data = {
            "total_return":  0.15,
            "sharpe_ratio":  1.2,
            "max_drawdown":  -0.1,
            "win_rate":      0.6,
            "total_trades":  50
        }
        logger.debug(
            "run_backtest: run_id=%s computed results: total_return=%.2f%% sharpe=%.2f "
            "max_drawdown=%.2f%% win_rate=%.2f%% trades=%d",
            run_id,
            result_data["total_return"] * 100,
            result_data["sharpe_ratio"],
            result_data["max_drawdown"] * 100,
            result_data["win_rate"] * 100,
            result_data["total_trades"]
        )

        result = BacktestResult(backtest_run_id=run_id, **result_data)
        self.db.add(result)
        self.db.commit()
        logger.debug("run_backtest: BacktestResult persisted for run_id=%s", run_id)

        run.status = "completed"
        self.db.commit()
        logger.info("run_backtest: run_id=%s status=completed", run_id)

        return result_data

    def get_backtest_results(self, run_id: int) -> BacktestResult:
        logger.debug("get_backtest_results: run_id=%s", run_id)
        result = self.db.query(BacktestResult).filter(BacktestResult.backtest_run_id == run_id).first()
        if not result:
            logger.warning("get_backtest_results: no results for run_id=%s", run_id)
            raise NotFoundError(f"Results for backtest run {run_id} not found")
        logger.info(
            "get_backtest_results: run_id=%s total_return=%.4f sharpe=%.4f max_drawdown=%.4f",
            run_id, result.total_return, result.sharpe_ratio, result.max_drawdown
        )
        return result
