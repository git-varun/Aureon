"""Analytics services."""
import logging

from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.modules.analytics.models import AnalyticsResult, Fundamentals, TechnicalIndicators

logger = logging.getLogger("analytics.service")


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db
        logger.debug("AnalyticsService initialised with db session id=%s", id(db))

    def run_fundamentals_analysis(self, symbol: str) -> Dict[str, Any]:
        logger.info("run_fundamentals_analysis: symbol=%s", symbol)

        result = {
            "symbol": symbol,
            "pe_ratio": None,
            "eps": None,
            "market_cap": None,
            "recommendation": "HOLD"
        }
        logger.debug("run_fundamentals_analysis: built placeholder result=%s", result)

        analytics = AnalyticsResult(
            symbol=symbol,
            analysis_type="fundamentals",
            data=str(result),
            recommendation=result["recommendation"]
        )
        logger.debug("run_fundamentals_analysis: persisting AnalyticsResult for symbol=%s recommendation=%s",
                     symbol, result["recommendation"])
        self.db.add(analytics)
        self.db.commit()
        logger.info("run_fundamentals_analysis: committed AnalyticsResult id=%s for symbol=%s",
                    analytics.id, symbol)
        return result

    def run_technical_analysis(self, symbol: str) -> Dict[str, Any]:
        logger.info("run_technical_analysis: symbol=%s", symbol)

        result = {
            "symbol": symbol,
            "rsi": None,
            "macd": None,
            "bollinger_upper": None,
            "bollinger_lower": None,
            "recommendation": "HOLD"
        }
        logger.debug("run_technical_analysis: built placeholder result=%s", result)

        analytics = AnalyticsResult(
            symbol=symbol,
            analysis_type="technical",
            data=str(result),
            recommendation=result["recommendation"]
        )
        logger.debug("run_technical_analysis: persisting AnalyticsResult for symbol=%s", symbol)
        self.db.add(analytics)
        self.db.commit()
        logger.info("run_technical_analysis: committed AnalyticsResult id=%s for symbol=%s",
                    analytics.id, symbol)
        return result

    def get_analytics_history(self, symbol: str, analysis_type: str = None) -> List[AnalyticsResult]:
        logger.debug("get_analytics_history: symbol=%s analysis_type=%s", symbol, analysis_type)

        query = self.db.query(AnalyticsResult).filter(AnalyticsResult.symbol == symbol)
        if analysis_type:
            logger.debug("get_analytics_history: filtering by analysis_type=%s", analysis_type)
            query = query.filter(AnalyticsResult.analysis_type == analysis_type)

        results = query.all()
        logger.info("get_analytics_history: symbol=%s analysis_type=%s → %d records",
                    symbol, analysis_type, len(results))
        return results
