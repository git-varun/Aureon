from app.core.services.base import BaseService
import bisect
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.modules.market.entities.market import Asset, PriceHistory
from app.modules.portfolio.entities.portfolio import Transaction
from app.modules.portfolio.services.portfolio import resolve_position_price
from app.modules.ai.repositories.intelligence import IntelligenceRepository


class FinancialIntelligenceService(BaseService):
    def __init__(self, db: Session):
        self.db = db
        self.repo = IntelligenceRepository(db)

    def _get_config(self) -> Dict[str, Any]:
        """Loads configuration from ProviderConfig for financial_intelligence, falling back to defaults."""
        default_config = {
            "expected_return_default": 0.11,
            "expected_return_high_risk": 0.14,
            "expected_return_low_risk": 0.07,
            "benchmark_annual_return": 0.10,
            "single_stock_concentration_threshold": 15.0,
            "sector_concentration_threshold": 30.0,
            "theme_concentration_threshold": 25.0,
            "diversification_asset_count_threshold": 10.0,
            "diversification_sector_count_threshold": 5.0,
            "diversification_target_score": 80.0,
            "risk_high_crypto_threshold": 20.0,
            "risk_high_equity_threshold": 75.0,
            "risk_low_crypto_threshold": 5.0,
            "risk_low_equity_threshold": 35.0
        }
        try:
            provider = self.repo.get_provider_config("financial_intelligence")
            if provider and provider.config:
                parsed = json.loads(provider.config)
                for k, v in parsed.items():
                    default_config[k] = v
        except Exception:
            pass
        return default_config

    def _get_allocation_targets(self) -> Dict[str, float]:
        """Loads target allocations from AllocationTarget table, falling back to defaults."""
        default_targets = {
            "stocks": 0.45,
            "funds": 0.25,
            "crypto": 0.10,
            "bonds": 0.10,
            "retirement": 0.05,
            "insurance": 0.05
        }
        try:
            targets = self.repo.list_allocation_targets()
            if targets:
                db_targets = {}
                for t in targets:
                    db_targets[t.asset_class] = t.target_pct / 10000.0
                return db_targets
        except Exception:
            pass
        return default_targets

    def _get_asset_price_at_time(self, asset_id: uuid.UUID, dt: datetime) -> Optional[float]:
        """Finds the asset price closest to the specified datetime in PriceHistory.

        Returns None if no real price data exists from any source — callers must
        handle absence explicitly rather than assume a float is always returned.
        """
        # Find closest price history entry
        price_history = self.repo.get_closest_price_history(asset_id, dt)
        if price_history:
            return float(price_history.price)

        # Fallback to current asset snapshot price
        snapshot = self.repo.get_snapshot(asset_id)
        if snapshot and snapshot.price is not None:
            return float(snapshot.price)

        # Fallback to latest quote
        quote = self.repo.get_quote_by_asset(asset_id)
        if quote and quote.price is not None:
            return float(quote.price)

        return None

    def get_recommendation_quality_metrics(self) -> Dict[str, Any]:
        """Initiative 1: Recommendation Quality Metrics"""
        recs = self.repo.get_all_recommendations()
        total = len(recs)
        
        applied = 0
        dismissed = 0
        expired = 0
        
        for r in recs:
            if r.status == "applied":
                applied += 1
            elif r.status == "dismissed":
                dismissed += 1
            elif r.status == "active":
                # Classify as expired if active and older than 30 days
                if r.created_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc) - timedelta(days=30):
                    expired += 1
                    
        acceptance_rate = applied / total if total > 0 else 0.0
        dismissal_rate = dismissed / total if total > 0 else 0.0
        expired_rate = expired / total if total > 0 else 0.0
        
        # Execution rate: applied vs decided
        decided = applied + dismissed + expired
        execution_rate = applied / decided if decided > 0 else 0.0
        
        return {
            "total_recommendations": total,
            "accepted_count": applied,
            "dismissed_count": dismissed,
            "expired_count": expired,
            "acceptance_rate": round(acceptance_rate, 4),
            "dismissal_rate": round(dismissal_rate, 4),
            "expired_rate": round(expired_rate, 4),
            "execution_rate": round(execution_rate, 4)
        }

    def get_recommendation_performance(self) -> List[Dict[str, Any]]:
        """Initiative 1: Recommendation Performance (30d, 90d, 180d)"""
        recs = self.repo.get_all_recommendations()

        config = self._get_config()
        bench_rate = 1.0 + config.get("benchmark_annual_return", 0.10)
        
        performance_list = []
        for r in recs:
            asset_id = r.asset_id
            created_at = r.created_at
            
            p0 = self._get_asset_price_at_time(asset_id, created_at)

            perf = {"recommendation_id": str(r.id), "symbol": "", "state": r.recommendation_state}

            # Find symbol
            quote = self.repo.get_quote_by_asset(asset_id)
            if quote:
                perf["symbol"] = quote.symbol

            if p0 is None:
                # No real price data at all at recommendation time — surface as
                # unavailable rather than fabricate a return off a made-up price.
                perf["performance_available"] = False
                perf["unavailable_reason"] = "insufficient price history"
                performance_list.append(perf)
                continue

            perf["performance_available"] = True
            intervals = [30, 90, 180]
            for days in intervals:
                target_date = created_at + timedelta(days=days)
                # If target date is in the future, return latest or skip
                if target_date.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
                    p_target = self._get_asset_price_at_time(asset_id, datetime.now(timezone.utc))
                else:
                    p_target = self._get_asset_price_at_time(asset_id, target_date)

                if p_target is None:
                    perf[f"realized_return_{days}d"] = None
                    perf[f"benchmark_return_{days}d"] = None
                    perf[f"excess_return_{days}d"] = None
                    continue

                raw_return = (p_target - p0) / p0 if p0 > 0 else 0.0

                # Adjust return based on recommendation state (BUY vs REDUCE/AVOID)
                if r.recommendation_state in ["REDUCE", "AVOID"]:
                    realized_return = -raw_return  # Outperformance is when the asset price drops
                else:
                    realized_return = raw_return

                # Benchmark return: annualized return compounded daily
                benchmark_return = (bench_rate) ** (days / 365.0) - 1.0
                excess_return = realized_return - benchmark_return

                perf[f"realized_return_{days}d"] = round(realized_return, 4)
                perf[f"benchmark_return_{days}d"] = round(benchmark_return, 4)
                perf[f"excess_return_{days}d"] = round(excess_return, 4)

            performance_list.append(perf)
            
        return performance_list

    def get_recommendation_explainability_v2(self, recommendation_id: uuid.UUID) -> str:
        """Initiative 1: Explainability V2 using persisted features and scores only"""
        rec = self.repo.get_recommendation(recommendation_id)
        if not rec:
            return "Recommendation not found."

        features = self.repo.get_features(rec.asset_id)
        score = self.repo.get_score(rec.asset_id)
        
        explanation_lines = []

        if features and features.momentum_score is not None:
            mom = float(features.momentum_score)
            mom_status = "above threshold 0.70" if mom >= 0.70 else "below threshold 0.70"
            explanation_lines.append(f"Momentum: {mom:.2f} ({mom_status})")
        else:
            explanation_lines.append("Momentum: data unavailable")

        if features and features.sentiment_score is not None:
            sent = float(features.sentiment_score)
            sent_status = "positive" if sent >= 0.50 else "negative"
            explanation_lines.append(f"Sentiment: {sent:.2f} ({sent_status})")
        else:
            explanation_lines.append("Sentiment: data unavailable")

        if features and features.volatility_score is not None:
            vol = float(features.volatility_score)
            vol_status = "acceptable" if vol <= 0.40 else "elevated"
            explanation_lines.append(f"Volatility: {vol:.2f} ({vol_status})")
        else:
            explanation_lines.append("Volatility: data unavailable")


        if score:
            rec_score_line = f"{float(score.recommendation_score):.2f}" if score.recommendation_score is not None else "unavailable"
            explanation_lines.append(f"Recommendation Score: {rec_score_line}")
            val_score_line = f"{float(score.valuation_score):.2f}" if score.valuation_score is not None else "unavailable"
            explanation_lines.append(f"Valuation Score: {val_score_line}")
            qual_score_line = f"{float(score.quality_score):.2f}" if score.quality_score is not None else "unavailable"
            explanation_lines.append(f"Quality Score: {qual_score_line}")
            
        return "\n".join(explanation_lines)

    def get_portfolio_concentration_analysis(self, portfolio_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 2: Concentration Analysis (single stock, sector, theme)"""
        positions = self.repo.get_positions(portfolio_id)

        total_val = 0.0
        stock_values = {}
        sector_values = {}
        theme_values = {}

        # Calculate asset values
        for pos in positions:
            price = resolve_position_price(self.db, pos).price or 0.0
            qty = float(pos.quantity)
            val = qty * price
            total_val += val

            stock_values[pos.symbol] = stock_values.get(pos.symbol, 0.0) + val

            asset = self.repo.get_asset(pos.asset_id)
            if asset:
                meta = asset.metadata_payload or {}
                sector = meta.get("sector", "General") if isinstance(meta, dict) else "General"
                sector_values[sector] = sector_values.get(sector, 0.0) + val

                # Check theme weights
                t_weights = self.repo.get_theme_weights_by_symbol(pos.symbol)
                for tw in t_weights:
                    theme = self.repo.get_theme(tw.theme_id)
                    if theme:
                        theme_name = theme.name
                        weight_in_theme = float(tw.weight)
                        theme_values[theme_name] = theme_values.get(theme_name, 0.0) + (val * weight_in_theme)
                        
        warnings = []
        config = self._get_config()
        single_stock_thresh = config.get("single_stock_concentration_threshold", 15.0)
        sector_thresh = config.get("sector_concentration_threshold", 30.0)
        theme_thresh = config.get("theme_concentration_threshold", 25.0)
        
        if total_val > 0:
            # Single stock concentration threshold
            for sym, val in stock_values.items():
                pct = (val / total_val) * 100
                if pct > single_stock_thresh:
                    warnings.append(f"Single stock concentration in {sym}: {pct:.1f}% exceeds {single_stock_thresh}% threshold.")
                    
            # Sector concentration threshold
            for sec, val in sector_values.items():
                pct = (val / total_val) * 100
                if pct > sector_thresh:
                    warnings.append(f"Sector concentration in {sec}: {pct:.1f}% exceeds {sector_thresh}% threshold.")
                    
            # Theme concentration threshold
            for thm, val in theme_values.items():
                pct = (val / total_val) * 100
                if pct > theme_thresh:
                    warnings.append(f"Theme concentration in {thm}: {pct:.1f}% exceeds {theme_thresh}% threshold.")
                    
        return {
            "total_value": round(total_val, 2),
            "stock_allocations": {k: round(v / total_val, 4) if total_val > 0 else 0.0 for k, v in stock_values.items()},
            "sector_allocations": {k: round(v / total_val, 4) if total_val > 0 else 0.0 for k, v in sector_values.items()},
            "theme_allocations": {k: round(v / total_val, 4) if total_val > 0 else 0.0 for k, v in theme_values.items()},
            "warnings": warnings
        }

    def get_portfolio_diversification_score(self, portfolio_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 2: Diversification Score (0-100)"""
        positions = self.repo.get_positions(portfolio_id)

        config = self._get_config()
        asset_count_thresh = config.get("diversification_asset_count_threshold", 10.0)
        sector_count_thresh = config.get("diversification_sector_count_threshold", 5.0)

        # 2. Sector Spread component
        sectors = set()
        total_val = 0.0
        symbol_values: Dict[str, float] = {}
        class_values: Dict[str, float] = {}

        for pos in positions:
            asset = self.repo.get_asset(pos.asset_id)
            if asset:
                meta = asset.metadata_payload or {}
                sector = meta.get("sector", "General") if isinstance(meta, dict) else "General"
                sectors.add(sector)

            price = resolve_position_price(self.db, pos).price or 0.0
            val = float(pos.quantity) * price
            total_val += val
            # Keyed by symbol, not appended per-Position, so a symbol split
            # across wallets (e.g. Binance spot + earn) counts as one asset
            # in asset_count/weights rather than being double-counted.
            symbol_values[pos.symbol] = symbol_values.get(pos.symbol, 0.0) + val

            if asset:
                class_values[asset.asset_class] = class_values.get(asset.asset_class, 0.0) + val

        # 1. Asset Count component
        asset_count = len(symbol_values)
        s_count = min(100.0, asset_count * (100.0 / asset_count_thresh) if asset_count_thresh > 0 else 10.0)
        weights = list(symbol_values.values())

        s_sector = min(100.0, len(sectors) * (100.0 / sector_count_thresh) if sector_count_thresh > 0 else 20.0)

        top_class, top_class_value = max(class_values.items(), key=lambda kv: kv[1]) if class_values else (None, 0.0)
        top_class_weight = (top_class_value / total_val) if total_val > 0 else 0.0
        
        # 3. Herfindahl-Hirschman Index (HHI) for allocation balance
        hhi = 0.0
        if total_val > 0:
            hhi = sum((w / total_val) ** 2 for w in weights)
            s_balance = 100.0 * (1.0 - hhi)
        else:
            s_balance = 0.0
            
        # Composite score
        score = 0.3 * s_count + 0.3 * s_sector + 0.4 * s_balance
        
        return {
            "diversification_score": round(score, 1),
            "asset_count_score": round(s_count, 1),
            "sector_spread_score": round(s_sector, 1),
            "allocation_balance_score": round(s_balance, 1),
            "hhi": round(hhi, 4),
            "position_count": asset_count,
            "asset_class_count": len(class_values),
            "sector_count": len(sectors),
            "top_asset_class": top_class,
            "top_asset_class_weight": round(top_class_weight, 4),
        }

    def get_portfolio_risk_summary(self, portfolio_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 2: Risk Summary (low, medium, high)"""
        positions = self.repo.get_positions(portfolio_id)

        total_val = 0.0
        crypto_val = 0.0
        stablecoin_val = 0.0
        equity_val = 0.0
        bond_val = 0.0

        sectors = set()

        for pos in positions:
            price = resolve_position_price(self.db, pos).price or 0.0
            val = float(pos.quantity) * price
            total_val += val

            asset = self.repo.get_asset(pos.asset_id)
            if asset:
                cls = asset.asset_class.lower()
                # Stablecoins are cash-equivalents, not volatile crypto — tracked
                # separately so they don't inflate crypto_pct/risk scoring.
                if cls == "stablecoin":
                    stablecoin_val += val
                elif cls == "crypto":
                    crypto_val += val
                elif cls in ["stocks", "equity"]:
                    equity_val += val
                elif cls in ["bonds", "debt"]:
                    bond_val += val

                meta = asset.metadata_payload or {}
                sector = meta.get("sector", "General") if isinstance(meta, dict) else "General"
                sectors.add(sector)

        crypto_pct = (crypto_val / total_val) * 100 if total_val > 0 else 0.0
        stablecoin_pct = (stablecoin_val / total_val) * 100 if total_val > 0 else 0.0
        equity_pct = (equity_val / total_val) * 100 if total_val > 0 else 0.0
        
        factors = []
        if crypto_pct > 15.0:
            factors.append(f"Significant allocation to highly volatile crypto assets ({crypto_pct:.1f}%).")
        if equity_pct > 60.0:
            factors.append(f"High equity concentration ({equity_pct:.1f}%), increasing market drawdown sensitivity.")
        if bond_val == 0.0 and total_val > 0:
            factors.append("Lack of stable income / debt buffer (bonds) to hedge equity volatility.")
        if len(sectors) < 3 and total_val > 0:
            factors.append(f"Low sector spread (only {len(sectors)} sectors represented).")
            
        if len(factors) == 0:
            factors.append("Balanced asset allocation with appropriate defensive buffers.")
            
        # Determine risk class from configuration thresholds
        config = self._get_config()
        risk_high_crypto = config.get("risk_high_crypto_threshold", 20.0)
        risk_high_equity = config.get("risk_high_equity_threshold", 75.0)
        risk_low_crypto = config.get("risk_low_crypto_threshold", 5.0)
        risk_low_equity = config.get("risk_low_equity_threshold", 35.0)
        
        if crypto_pct > risk_high_crypto or equity_pct > risk_high_equity:
            risk_class = "HIGH RISK"
        elif crypto_pct < risk_low_crypto and equity_pct < risk_low_equity:
            risk_class = "LOW RISK"
        else:
            risk_class = "MEDIUM RISK"
            
        return {
            "risk_class": risk_class,
            "crypto_percentage": round(crypto_pct, 1),
            "stablecoin_percentage": round(stablecoin_pct, 1),
            "equity_percentage": round(equity_pct, 1),
            "contributing_factors": factors
        }

    def get_cash_deployment_opportunities(self, portfolio_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 2: Cash Deployment Opportunities"""
        snapshot = self.repo.get_portfolio_snapshot(portfolio_id)
        positions = self.repo.get_positions(portfolio_id)
        
        # Calculate cash ratio
        cash = float(snapshot.cash_balance) if snapshot and snapshot.cash_balance is not None else 0.0
        mkt_val = float(snapshot.market_value) if snapshot and snapshot.market_value is not None else 0.0
        net_worth = cash + mkt_val
        
        cash_ratio = cash / net_worth if net_worth > 0 else 0.0
        
        suggestions = []
        if cash_ratio > 0.10:
            suggestions.append(f"Large cash balance detected ({cash_ratio*100:.1f}% of net worth). Consider investing.")
            
        # Target classes from database config
        class_target = self._get_allocation_targets()
        
        # Current allocations
        alloc = {}
        for pos in positions:
            asset = self.repo.get_asset(pos.asset_id)
            if asset:
                price = resolve_position_price(self.db, pos).price or 0.0
                val = float(pos.quantity) * price

                # Classify
                cls = asset.asset_class.lower()
                if cls in ["stocks", "equity"]:
                    cls_key = "stocks"
                elif cls in ["bonds", "debt"]:
                    cls_key = "bonds"
                elif cls in ["funds", "mutual_funds"]:
                    cls_key = "funds"
                else:
                    cls_key = cls
                    
                alloc[cls_key] = alloc.get(cls_key, 0.0) + val
                
        # Check underweight and missing allocations
        for cls, target in class_target.items():
            current_val = alloc.get(cls, 0.0)
            current_pct = current_val / net_worth if net_worth > 0 else 0.0
            
            if current_pct == 0.0:
                suggestions.append(f"Missing allocation: You have no holdings in the {cls.upper()} asset class (Target: {target*100:.0f}%).")
            elif current_pct < target - 0.05:
                suggestions.append(f"Underweight asset class: {cls.upper()} is currently {current_pct*100:.1f}% (Target: {target*100:.0f}%).")
                
        return {
            "cash_balance": round(cash, 2),
            "cash_ratio": round(cash_ratio, 4),
            "suggestions": suggestions
        }

    def get_recommendation_scorecard(self) -> Dict[str, Any]:
        """Initiative 3: Recommendation Scorecard"""
        recs = self.repo.get_all_recommendations()
        
        states = ["BUY", "HOLD", "REDUCE", "AVOID"]
        card = {}
        
        for state in states:
            state_recs = [r for r in recs if r.recommendation_state == state]
            gen = len(state_recs)
            acc = len([r for r in state_recs if r.status == "applied"])
            ign = len([r for r in state_recs if r.status in ["dismissed", "expired"]])
            
            # Outcome win rate
            applied_recs = [r for r in state_recs if r.status == "applied"]
            wins = 0
            for r in applied_recs:
                outcome = self.repo.get_outcome(r.id)
                if outcome and outcome.realized_impact is not None and outcome.realized_impact > 0.0:
                    wins += 1
                    
            win_rate = wins / len(applied_recs) if len(applied_recs) > 0 else 0.0
            
            card[state] = {
                "generated": gen,
                "accepted": acc,
                "ignored": ign,
                "win_rate": round(win_rate, 4)
            }
            
        return card

    def get_rule_performance(self) -> Dict[str, Any]:
        """Initiative 3: Rule Performance"""
        recs = self.repo.get_all_recommendations()
        
        states = ["BUY", "HOLD", "REDUCE", "AVOID"]
        perf = {}
        
        for state in states:
            applied_recs = [r for r in recs if r.recommendation_state == state and r.status == "applied"]
            
            wins = 0
            tot_ret = 0.0
            false_pos = 0
            
            for r in applied_recs:
                outcome = self.repo.get_outcome(r.id)
                val = float(outcome.realized_impact) if outcome and outcome.realized_impact is not None else 0.0
                tot_ret += val
                
                if val > 0.0:
                    wins += 1
                else:
                    false_pos += 1
                    
            win_rate = wins / len(applied_recs) if len(applied_recs) > 0 else 0.0
            avg_ret = tot_ret / len(applied_recs) if len(applied_recs) > 0 else 0.0
            
            perf[state] = {
                "win_rate": round(win_rate, 4),
                "average_return": round(avg_ret, 4),
                "false_positives": false_pos
            }
            
        return perf

    def get_confidence_calibration(self) -> Dict[str, Any]:
        """Initiative 3: Recommendation Confidence Calibration"""
        recs = self.repo.get_all_recommendations()
        
        bands = {
            "high": [r for r in recs if float(r.confidence_score) >= 0.8],
            "medium": [r for r in recs if 0.5 <= float(r.confidence_score) < 0.8],
            "low": [r for r in recs if float(r.confidence_score) < 0.5]
        }
        
        calibration = {}
        for band_name, band_recs in bands.items():
            tot = len(band_recs)
            applied = [r for r in band_recs if r.status == "applied"]
            wins = 0
            tot_ret = 0.0
            
            for r in applied:
                outcome = self.repo.get_outcome(r.id)
                val = float(outcome.realized_impact) if outcome and outcome.realized_impact is not None else 0.0
                tot_ret += val
                if val > 0.0:
                    wins += 1
                    
            win_rate = wins / len(applied) if len(applied) > 0 else 0.0
            avg_ret = tot_ret / len(applied) if len(applied) > 0 else 0.0
            
            calibration[band_name] = {
                "total_recommendations": tot,
                "win_rate": round(win_rate, 4),
                "average_return": round(avg_ret, 4)
            }
            
        return calibration

    def get_investor_health_score(self, portfolio_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 6: Investor Health Score (0-100)"""
        div_data = self.get_portfolio_diversification_score(portfolio_id)
        s_div = div_data["diversification_score"]
        
        snapshot = self.repo.get_portfolio_snapshot(portfolio_id)
        positions = self.repo.get_positions(portfolio_id)
        # cash_balance is None (not tracked) whenever it isn't a real computed
        # value — see generate_portfolio_snapshot — so it must not be added
        # directly here or this crashes on float + None.
        net_worth = float(snapshot.market_value + (snapshot.cash_balance or 0)) if snapshot else 10000.0

        class_target = self._get_allocation_targets()
        alloc = {}
        for pos in positions:
            asset = self.repo.get_asset(pos.asset_id)
            if asset:
                price = resolve_position_price(self.db, pos).price or 0.0
                val = float(pos.quantity) * price
                cls = asset.asset_class.lower()
                if cls in ["stocks", "equity"]:
                    cls_key = "stocks"
                elif cls in ["bonds", "debt"]:
                    cls_key = "bonds"
                elif cls in ["funds", "mutual_funds"]:
                    cls_key = "funds"
                else:
                    cls_key = cls
                alloc[cls_key] = alloc.get(cls_key, 0.0) + val
                
        total_drift = 0.0
        for cls, target in class_target.items():
            curr_pct = alloc.get(cls, 0.0) / net_worth if net_worth > 0 else 0.0
            total_drift += abs(curr_pct - target)
            
        s_discipline = max(0.0, 100.0 - (total_drift * 50.0))
        
        quality_metrics = self.get_recommendation_quality_metrics()
        has_outcomes_data = quality_metrics["total_recommendations"] > 0
        s_outcomes = quality_metrics["acceptance_rate"] * 100.0 if has_outcomes_data else None

        recent_txns = self.repo.count_recent_transactions(portfolio_id, datetime.now(timezone.utc) - timedelta(days=90))
        s_consistency = min(100.0, recent_txns * 33.3)

        # Composite score is a weighted average over whichever components have
        # real data, renormalizing the base weights (0.3/0.3/0.2/0.2) over just
        # the available ones — never a fabricated neutral substitute for a
        # missing one. See Fix 1a in recommendation.py for the same pattern.
        weighted_terms = [(0.3, s_div), (0.3, s_discipline), (0.2, s_consistency)]
        if has_outcomes_data:
            weighted_terms.append((0.2, s_outcomes))
        total_weight = sum(w for w, _ in weighted_terms)
        composite_score = sum(w * v for w, v in weighted_terms) / total_weight

        return {
            "investor_health_score": round(composite_score, 1),
            "diversification_score": round(s_div, 1),
            "allocation_discipline_score": round(s_discipline, 1),
            "recommendation_outcomes_score": round(s_outcomes, 1) if s_outcomes is not None else None,
            "activity_consistency_score": round(s_consistency, 1),
            "position_count": len(positions),
        }

    def get_goal_progress_metrics(self, portfolio_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 6: Goal Progress Metrics"""
        snapshot = self.repo.get_portfolio_snapshot(portfolio_id)
        # cash_balance is None (not tracked) whenever it isn't a real computed
        # value — see generate_portfolio_snapshot — so it must not be added
        # directly here or this crashes on float + None.
        current_net_worth = float(snapshot.market_value + (snapshot.cash_balance or 0)) if snapshot else 10000.0

        # monthly_saving lives on UserPreference, not User (see
        # serialize_user_profile in app/api/dependencies.py) — same field
        # backing GoalProgress.jsx and the Settings UI. Match its established
        # 25000.0 default-at-creation convention rather than inventing a new
        # unavailable state for a field that already has a real one.
        pref = self.repo.get_user_preference(user_id)
        monthly_saving = float(pref.monthly_saving) if pref and pref.monthly_saving is not None else 25000.0

        # No schema field backs a user-set target corpus (see
        # INTELLIGENCE_MODULE_AUDIT.md §6 Tier 2) — surface it as
        # unavailable rather than invent a number, and skip any projection
        # that depends on it.
        target_corpus = None

        config = self._get_config()
        expected_annual_return = config.get("expected_return_default", 0.11)

        risk_summary = self.get_portfolio_risk_summary(portfolio_id)
        if risk_summary["risk_class"] == "HIGH RISK":
            expected_annual_return = config.get("expected_return_high_risk", 0.14)
        elif risk_summary["risk_class"] == "LOW RISK":
            expected_annual_return = config.get("expected_return_low_risk", 0.07)

        div_score = self.get_portfolio_diversification_score(portfolio_id)["diversification_score"]
        target_div = config.get("diversification_target_score", 80.0)

        return {
            "wealth_goals": {
                "current_net_worth": round(current_net_worth, 2),
                "target_corpus": target_corpus,
                "target_corpus_available": False,
                "monthly_saving": monthly_saving,
                "projected_months_to_target": None,
                "projected_years_to_target": None,
                "expected_annual_return": round(expected_annual_return * 100, 1)
            },
            "allocation_goals": {
                "current_diversification_score": div_score,
                "target_diversification_score": target_div,
                "status": "Achieved" if div_score >= target_div else "In Progress"
            },
            "savings_goals": {
                "monthly_saving_target": monthly_saving,
                "status": "Active" if monthly_saving > 0 else "Inactive"
            }
        }

    # ── Trend Calculation Methods (Task 8) ───────────────────────────────────

    def _index_price_history_by_asset(self, price_history: List[PriceHistory]) -> Dict[uuid.UUID, List[Tuple[datetime, float]]]:
        # Normalize tzinfo and sort once per asset (ascending by timestamp) so
        # _get_portfolio_state_at_date can binary-search for the closest price
        # instead of linearly scanning every point on every trend day — the
        # linear scan was O(days * assets * price_points) and dominated trend
        # endpoint latency (seconds for 90 days, timeouts for "All").
        by_asset: Dict[uuid.UUID, List[Tuple[datetime, float]]] = {}
        for p in price_history:
            ts = p.timestamp.replace(tzinfo=timezone.utc) if p.timestamp.tzinfo is None else p.timestamp
            by_asset.setdefault(p.asset_id, []).append((ts, float(p.price)))
        for asset_id, points in by_asset.items():
            points.sort(key=lambda pt: pt[0])
        return by_asset

    def _closest_price(self, points: List[Tuple[datetime, float]], dt: datetime) -> Optional[float]:
        if not points:
            return None
        timestamps = [pt[0] for pt in points]
        idx = bisect.bisect_left(timestamps, dt)
        candidates = [i for i in (idx - 1, idx) if 0 <= i < len(points)]
        best = min(candidates, key=lambda i: abs((points[i][0] - dt).total_seconds()))
        return points[best][1]

    def _get_portfolio_state_at_date(self, dt: datetime, transactions: List[Transaction], price_history_by_asset: Dict[uuid.UUID, List[Tuple[datetime, float]]], assets_by_symbol: Dict[str, Asset]) -> Dict[str, Any]:
        positions = {}
        for tx in transactions:
            tx_date = tx.transaction_date.replace(tzinfo=timezone.utc) if tx.transaction_date.tzinfo is None else tx.transaction_date
            if tx_date > dt:
                continue
            symbol = tx.symbol
            qty = float(tx.quantity)
            price = float(tx.price)
            
            if symbol not in positions:
                positions[symbol] = {"quantity": 0.0, "total_cost": 0.0, "asset_id": tx.asset_id}
                
            if tx.transaction_type == "BUY":
                positions[symbol]["quantity"] += qty
                positions[symbol]["total_cost"] += qty * price
            elif tx.transaction_type == "SELL":
                positions[symbol]["quantity"] = max(0.0, positions[symbol]["quantity"] - qty)
        
        # Calculate avg buy price
        for sym, pos in positions.items():
            if pos["quantity"] > 0:
                pos["avg_buy_price"] = pos["total_cost"] / pos["quantity"]
            else:
                pos["avg_buy_price"] = 0.0

        # Calculate values closest to dt
        total_val = 0.0
        stock_values = {}
        sector_values = {}
        weights = []
        sectors = set()
        
        for sym, pos in list(positions.items()):
            qty = pos["quantity"]
            if qty <= 0:
                continue
            asset_id = pos["asset_id"]
            price = None
            if asset_id and asset_id in price_history_by_asset:
                # BACKLOG: shared by get_portfolio_health_trend/get_diversification_trend/
                # get_goal_progress_trend, all of which read total_value day-over-day as an
                # implicit return. For .NS assets, market.price_history spans the NSE-direct
                # cutover (yfinance-adjusted before, NSE-direct raw/unadjusted after — see
                # NseDirectAdapter) — a future split on a held Indian equity will show a real,
                # correct price drop here that these trends can't tell apart from a genuine
                # portfolio-value crash. Not fixed in Phase A/B — flagged at the lookup point.
                price = self._closest_price(price_history_by_asset[asset_id], dt)

            if price is None:
                # No real price history for this asset as of dt — skip it
                # rather than fabricate a value into the aggregate, matching
                # _get_asset_price_at_time's None-safe pattern above.
                continue

            val = qty * price
            total_val += val
            stock_values[sym] = val
            weights.append(val)
            
            asset = assets_by_symbol.get(sym)
            if asset:
                meta = asset.metadata_payload or {}
                sector = meta.get("sector", "General") if isinstance(meta, dict) else "General"
                sectors.add(sector)
                sector_values[sector] = sector_values.get(sector, 0.0) + val
                
        return {
            "total_value": total_val,
            "positions": positions,
            "stock_values": stock_values,
            "sector_values": sector_values,
            "sectors": sectors,
            "weights": weights
        }

    def _clamp_trend_dates(self, days: int, transactions: List[Transaction]) -> List[datetime]:
        """Builds the day-by-day date list for a trend series, clamped to the
        portfolio's actual start so no point predates its first real
        transaction — same max(requested_start, earliest_txn_date) discipline
        as PortfolioService.get_history (portfolio.py:764-767), rather than
        flat-lining a "0" score for dates before the portfolio existed.
        Returns [] when there are no transactions at all, matching
        get_history's "no txns -> empty series" behavior.
        """
        if not transactions:
            return []
        now = datetime.now(timezone.utc)
        earliest_txn_date = min(
            t.transaction_date.replace(tzinfo=timezone.utc) if t.transaction_date.tzinfo is None else t.transaction_date
            for t in transactions
        )
        requested_start = now - timedelta(days=days - 1)
        start = max(requested_start, earliest_txn_date)
        total_days = max(1, (now - start).days + 1)
        return [now - timedelta(days=i) for i in range(total_days - 1, -1, -1)]

    def get_portfolio_health_trend(self, portfolio_id: uuid.UUID, days: int = 30) -> List[Dict[str, Any]]:
        # Known gap, deliberately deferred: get_transactions_by_portfolio
        # doesn't filter kind="broker_snapshot" the way get_history does
        # (portfolio.py:702-708) — a broker-synced holding with no real
        # trade ledger will show a false "sudden appearance" in this trend
        # at its sync date instead of being excluded. Display-skew, not
        # fabrication; not fixed in this pass.
        transactions = self.repo.get_transactions_by_portfolio(portfolio_id)
        dates = self._clamp_trend_dates(days, transactions)
        if not dates:
            return []

        symbols = list(set(t.symbol for t in transactions))
        assets = self.repo.get_assets_by_symbols(symbols)
        assets_by_symbol = {a.symbol: a for a in assets}
        asset_ids = [a.id for a in assets]

        price_history = self.repo.get_price_history_by_assets(asset_ids)
        price_history_by_asset = self._index_price_history_by_asset(price_history)
            
        # Hoisted out of the per-day loop below: allocation targets don't vary
        # by date, and this was issuing a DB query on every iteration (N+1),
        # part of what made this endpoint slow for large day ranges.
        class_target = self._get_allocation_targets()

        trend = []
        for d in dates:
            state = self._get_portfolio_state_at_date(d, transactions, price_history_by_asset, assets_by_symbol)
            # s_div
            asset_count = len([p for p in state["positions"].values() if p["quantity"] > 0])
            s_count = min(100.0, asset_count * 10.0)
            s_sector = min(100.0, len(state["sectors"]) * 20.0)
            hhi = sum((w / state["total_value"]) ** 2 for w in state["weights"]) if state["total_value"] > 0 else 0.0
            s_balance = 100.0 * (1.0 - hhi) if state["total_value"] > 0 else 0.0
            s_div = 0.3 * s_count + 0.3 * s_sector + 0.4 * s_balance

            # s_discipline — reuse state["stock_values"], which already
            # excludes assets with no real price history as of d, rather
            # than re-deriving from state["positions"] with a fabricated
            # 100.0 price fallback (same anti-pattern already fixed in
            # _get_asset_price_at_time / _get_portfolio_state_at_date).
            alloc = {}
            for sym, val in state["stock_values"].items():
                asset = assets_by_symbol.get(sym)
                if not asset:
                    continue
                cls = asset.asset_class.lower()
                if cls in ["stocks", "equity"]:
                    cls_key = "stocks"
                elif cls in ["bonds", "debt"]:
                    cls_key = "bonds"
                elif cls in ["funds", "mutual_funds"]:
                    cls_key = "funds"
                else:
                    cls_key = cls
                alloc[cls_key] = alloc.get(cls_key, 0.0) + val

            total_drift = 0.0
            for cls, target in class_target.items():
                curr_pct = alloc.get(cls, 0.0) / state["total_value"] if state["total_value"] > 0 else 0.0
                total_drift += abs(curr_pct - target)
            s_discipline = max(0.0, 100.0 - (total_drift * 50.0))

            # consistency
            recent_txns = len([t for t in transactions if (d - timedelta(days=90)) <= (t.transaction_date.replace(tzinfo=timezone.utc) if t.transaction_date.tzinfo is None else t.transaction_date) <= d])
            s_consistency = min(100.0, recent_txns * 33.3)

            # Recommendation status (applied/dismissed) isn't a dated field —
            # only the current status is stored, not what it was on day d —
            # so there's no real point-in-time "outcomes" signal to compute
            # here. Exclude it and renormalize, matching the no-fabricated-
            # neutral-default precedent in get_investor_health_score, rather
            # than reinstating the removed 75.0 constant.
            weighted_terms = [(0.3, s_div), (0.3, s_discipline), (0.2, s_consistency)]
            total_weight = sum(w for w, _ in weighted_terms)
            health_score = sum(w * v for w, v in weighted_terms) / total_weight
            trend.append({
                "date": d.strftime("%Y-%m-%d"),
                "investor_health_score": round(health_score, 1),
                "diversification_score": round(s_div, 1),
                "allocation_discipline_score": round(s_discipline, 1),
                "activity_consistency_score": round(s_consistency, 1)
            })
        return trend

    def get_diversification_trend(self, portfolio_id: uuid.UUID, days: int = 30) -> List[Dict[str, Any]]:
        # Known gap, deliberately deferred: same broker_snapshot filtering
        # gap noted in get_portfolio_health_trend above.
        transactions = self.repo.get_transactions_by_portfolio(portfolio_id)
        dates = self._clamp_trend_dates(days, transactions)
        if not dates:
            return []

        symbols = list(set(t.symbol for t in transactions))
        assets = self.repo.get_assets_by_symbols(symbols)
        assets_by_symbol = {a.symbol: a for a in assets}
        asset_ids = [a.id for a in assets]

        price_history = self.repo.get_price_history_by_assets(asset_ids)
        price_history_by_asset = self._index_price_history_by_asset(price_history)
            
        trend = []
        for d in dates:
            state = self._get_portfolio_state_at_date(d, transactions, price_history_by_asset, assets_by_symbol)
            asset_count = len([p for p in state["positions"].values() if p["quantity"] > 0])
            s_count = min(100.0, asset_count * 10.0)
            s_sector = min(100.0, len(state["sectors"]) * 20.0)
            hhi = sum((w / state["total_value"]) ** 2 for w in state["weights"]) if state["total_value"] > 0 else 0.0
            s_balance = 100.0 * (1.0 - hhi) if state["total_value"] > 0 else 0.0
            score = 0.3 * s_count + 0.3 * s_sector + 0.4 * s_balance
            
            trend.append({
                "date": d.strftime("%Y-%m-%d"),
                "diversification_score": round(score, 1),
                "asset_count": asset_count,
                "sector_count": len(state["sectors"]),
                "hhi": round(hhi, 4)
            })
        return trend

    def get_recommendation_performance_trend(self, days: int = 30) -> List[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        dates = [now - timedelta(days=i) for i in range(days - 1, -1, -1)]

        recs = self.repo.get_all_recommendations()

        trend = []
        for d in dates:
            active_recs = [r for r in recs if r.created_at.replace(tzinfo=timezone.utc) <= d]
            if not active_recs:
                trend.append({
                    "date": d.strftime("%Y-%m-%d"),
                    "average_realized_return": 0.0,
                    "average_excess_return": 0.0,
                    "total_recommendations": 0
                })
                continue
                
            tot_realized = 0.0
            tot_excess = 0.0
            count = 0

            for r in active_recs:
                p0 = self._get_asset_price_at_time(r.asset_id, r.created_at)
                p_t = self._get_asset_price_at_time(r.asset_id, d)
                if p0 is None or p_t is None:
                    # No real price data available — exclude from the average
                    # rather than fabricate a zero/placeholder return.
                    continue
                raw_return = (p_t - p0) / p0 if p0 > 0 else 0.0

                realized = -raw_return if r.recommendation_state in ["REDUCE", "AVOID"] else raw_return
                bench_return = 0.10 * ((d - r.created_at.replace(tzinfo=timezone.utc)).days / 365.0)
                excess = realized - bench_return

                tot_realized += realized
                tot_excess += excess
                count += 1

            if count == 0:
                trend.append({
                    "date": d.strftime("%Y-%m-%d"),
                    "average_realized_return": None,
                    "average_excess_return": None,
                    "total_recommendations": 0
                })
                continue

            trend.append({
                "date": d.strftime("%Y-%m-%d"),
                "average_realized_return": round(tot_realized / count, 4),
                "average_excess_return": round(tot_excess / count, 4),
                "total_recommendations": count
            })
        return trend

    def get_goal_progress_trend(self, portfolio_id: uuid.UUID, user_id: uuid.UUID, days: int = 30) -> List[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        dates = [now - timedelta(days=i) for i in range(days - 1, -1, -1)]
        
        transactions = self.repo.get_transactions_by_portfolio(portfolio_id)

        symbols = list(set(t.symbol for t in transactions))
        assets = self.repo.get_assets_by_symbols(symbols)
        assets_by_symbol = {a.symbol: a for a in assets}
        asset_ids = [a.id for a in assets]

        price_history = self.repo.get_price_history_by_assets(asset_ids)
        price_history_by_asset = self._index_price_history_by_asset(price_history)
            
        trend = []
        for d in dates:
            state = self._get_portfolio_state_at_date(d, transactions, price_history_by_asset, assets_by_symbol)
            net_worth = state["total_value"]

            # No schema field backs a user-set target corpus (see
            # INTELLIGENCE_MODULE_AUDIT.md §6 Tier 2), so there's nothing
            # real to project a time-to-target from.
            trend.append({
                "date": d.strftime("%Y-%m-%d"),
                "net_worth": round(net_worth, 2),
                "years_to_target": None,
                "projected_months": None
            })
        return trend

    # ── Dashboard Aggregation (Task 6) ───────────────────────────────────────

    def get_dashboard_aggregation(self, portfolio_id: uuid.UUID, user_id: uuid.UUID) -> Dict[str, Any]:
        """Initiative 6: Dashboard Aggregation Service"""
        # 1. Health
        health = self.get_investor_health_score(portfolio_id)

        # 2. Diversification
        div = self.get_portfolio_diversification_score(portfolio_id)

        # 3. Concentration Warnings
        conc = self.get_portfolio_concentration_analysis(portfolio_id)

        # 4. Cash Opportunities
        cash = self.get_cash_deployment_opportunities(portfolio_id)

        # 5. Recommendation Summary & Performance
        quality = self.get_recommendation_quality_metrics()
        perf = self.get_recommendation_performance()

        # 6. Recent Outcomes
        recent_outcomes = self.repo.get_recent_applied_outcomes(5)
        serialized_outcomes = []
        for o in recent_outcomes:
            rec = self.repo.get_recommendation(o.recommendation_id)
            quote = self.repo.get_quote_by_asset(rec.asset_id)
            serialized_outcomes.append({
                "recommendation_id": str(o.recommendation_id),
                "symbol": quote.symbol if quote else "Unknown",
                "action_taken_at": o.action_taken_at.isoformat() if o.action_taken_at else None,
                "predicted_impact": float(o.predicted_impact) if o.predicted_impact is not None else None,
                "realized_impact": float(o.realized_impact) if o.realized_impact is not None else None
            })
            
        # 7. Goal Progress
        goals = self.get_goal_progress_metrics(portfolio_id, user_id)

        # 8. Latest Briefing Summary
        briefing = self.repo.get_latest_briefing()
        briefing_summary = None
        if briefing and briefing.content:
            briefing_summary = {
                "briefing_id": str(briefing.id),
                "briefing_type": briefing.briefing_type,
                "created_at": briefing.created_at.isoformat() if briefing.created_at else None,
                "market_vibe": briefing.content.get("market_vibe") if isinstance(briefing.content, dict) else None,
                "vibe": briefing.content.get("vibe") if isinstance(briefing.content, dict) else None
            }
            
        return {
            "investor_health": health,
            "diversification": div,
            "concentration": conc,
            "cash_opportunities": cash,
            "recommendation_summary": quality,
            "recommendation_performance": perf,
            "recent_outcomes": serialized_outcomes,
            "goal_progress": goals,
            "latest_briefing": briefing_summary
        }
