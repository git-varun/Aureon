import logging


class PortfolioAnalytics:
    def __init__(self):
        self.logger = logging.getLogger("analytics.portfolio")
        self.benchmark_ticker = "^NSEI"

    def analyze_health(self, assets: list, total_inr: float) -> dict:
        self.logger.info("analyze_health: assets=%d total_inr=%.2f", len(assets), total_inr)

        health_report = {
            "allocation": {},
            "beta": 1.0,
            "high_correlation_warning": None,
            "correlation_matrix": {}
        }

        if total_inr == 0 or not assets:
            self.logger.warning("analyze_health: skipped — total_inr=%.2f assets=%d", total_inr, len(assets))
            return health_report

        allocation: dict = {}
        for a in assets:
            atype = a.get("type", "stock").upper()
            weight = (abs(a.get("value_inr", 0)) / total_inr) * 100 if total_inr > 0 else 0
            prev = allocation.get(atype, 0)
            allocation[atype] = prev + weight
            self.logger.debug(
                "analyze_health: symbol=%s type=%s value_inr=%.2f weight=%.2f%% cumulative=%s=%.2f%%",
                a.get("symbol", "?"), atype, a.get("value_inr", 0), weight, atype, allocation[atype]
            )

        health_report["allocation"] = {k: round(v, 2) for k, v in allocation.items()}
        self.logger.info("analyze_health: allocation breakdown=%s", health_report["allocation"])

        # Historical price data for correlation and beta must come from price_repo
        # Defaults provided when data is unavailable
        self.logger.debug("analyze_health: beta/correlation not computed — price data not wired; using defaults")
        return health_report
