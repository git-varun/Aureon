from app.domain.services.base import BaseService
import json
import logging
import os
import re
import time
import uuid
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ProviderError, ValidationError
from app.core.redis import get_redis_client
from app.domain.entities.ai import AIBriefing, AIEvaluation, AIGeneration
from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.domain.entities.news import News
from app.domain.entities.portfolio import Portfolio, Position, Transaction
from app.domain.entities.recommendation import Recommendation, RecommendationExplanation
from app.domain.entities.system import Organization
from app.domain.services.config import ConfigService
from app.infrastructure.repositories.config import ConfigRepository

logger = logging.getLogger("ai.service")

# ── Cooldown Tracker ──────────────────────────────────────────────────────────

class RateLimitTracker:
    def __init__(self):
        self._cooldowns: dict[str, float] = {}

    def _get_redis_key(self, key: str) -> str:
        return f"ai:ratelimit:{key}"

    def mark_cooldown(self, key: str, seconds: float) -> None:
        logger.warning(f"Rate limit hit: cooling down {key} for {seconds}s")
        try:
            client = get_redis_client()
            client.set(self._get_redis_key(key), "1", ex=int(seconds))
            return
        except Exception as e:
            logger.warning(f"Failed to set rate limit cooldown in Redis: {e}. Falling back to memory.")
        self._cooldowns[key] = time.monotonic() + seconds

    def is_limited(self, key: str) -> bool:
        try:
            client = get_redis_client()
            val = client.get(self._get_redis_key(key))
            if val is not None:
                return True
        except Exception as e:
            logger.warning(f"Failed to check rate limit cooldown in Redis: {e}. Falling back to memory.")
        
        expiry = self._cooldowns.get(key)
        if expiry is None:
            return False
        if time.monotonic() >= expiry:
            del self._cooldowns[key]
            return False
        return True

    def filter_available(self, keys: list[str]) -> list[str]:
        return [k for k in keys if not self.is_limited(k)]

_rate_limit_tracker = RateLimitTracker()

# ── Prompts ───────────────────────────────────────────────────────────────────

_QA_PROMPT = """\
You are Aureon, a professional investment AI assistant. Answer the following question concisely and specifically, \
based only on the provided context. Be direct and practical. Maximum 3 paragraphs.
Every conclusion you make must explicitly reference numbers, percentages, indicators, or specific dates from the context.

Context:
{context}

Question: {question}

Answer:"""

_GLOBAL_BRIEFING_PROMPT = """\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Perform 3-tier analysis (Macro, Fundamental, Technical) on the ENTIRE portfolio context.
Position sizing rule: CRITICAL — use the provided Qty to give exact numbers (e.g. "SELL 50% / 45 shares" or "HOLD all 90 shares").
Directive count rule: CRITICAL — generate directives for the assets.
CRITICAL Rule: Do not generate recommendations other than the supported actions: BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference underlying data from the context (PE, RSI, MACD, prices, or news titles).

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "market_vibe": "<2-sentence Global Market Pulse>",
  "macro_analysis": "<Deep analysis of sector contagion and macro impacts>",
  "global_score": <float 0.0-1.0 overall market health>,
  "confidence_score": <float 0.0-1.0 confidence in this briefing>,
  "future_projections": {{
    "estimated_30d_trend": "<Bullish / Bearish / Sideways / Volatile>",
    "portfolio_risk_level": "<LOW | MEDIUM | MEDIUM-HIGH | HIGH | EXTREME>",
    "catalyst_watch": "<Specific upcoming global event to watch>"
  }},
  "directives": [
    {{
      "symbol": "<exact ticker symbol from portfolio>",
      "action": "<BUY | HOLD | REDUCE | AVOID>",
      "conviction_level": <integer 1-5>,
      "financial_impact": "<expected return or risk in % over timeframe>",
      "position_sizing": "<exact explicit instructions based on Qty Owned>",
      "time_horizon": "<Short-Term | Medium-Term | Long-Term>",
      "risk_reward_ratio": "<e.g. 1:2, 1:3>",
      "technical_analysis": "<explicit RSI, MACD, and Bollinger Band status>",
      "fundamental_analysis": "<explicit P/E, 52w distance, and financial health>",
      "news_sentiment": {{
        "bias": "<Bullish | Bearish | Neutral>",
        "confidence": <integer 0-100>,
        "impact_summary": "<how this specific news moves the asset>"
      }},
      "the_why": "<high-conviction paragraph justifying the action>"
    }}
  ],
  "skipped_assets_summary": "<list tickers skipped and why>"
}}

Portfolio context:
{context}
"""

_WEEKLY_BRIEFING_PROMPT = """\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Generate a weekly investment briefing summarizing macro movements and asset behaviors.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "vibe": "<1-sentence summary of the week>",
  "macro_summary": "<Macro trend updates>",
  "directives": [
     {{
       "symbol": "<exact ticker symbol>",
       "action": "<BUY | HOLD | REDUCE | AVOID>",
       "rationale": "<Concise data-backed explanation>"
     }}
  ]
}}

Portfolio context:
{context}
"""

_MONTHLY_BRIEFING_PROMPT = """\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Generate a monthly portfolio health summary.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{{
  "vibe": "<1-sentence summary of the month>",
  "macro_summary": "<Macro trends over the month>",
  "directives": [
     {{
       "symbol": "<exact ticker symbol>",
       "action": "<BUY | HOLD | REDUCE | AVOID>",
       "rationale": "<Concise data-backed explanation>"
     }}
  ]
}}

Portfolio context:
{context}
"""

_RECOMMENDATION_EXPLANATION_PROMPT = """\
Role: Elite Quantitative Analyst.
Objective: Provide a detailed, data-backed explanation for why a specific recommendation was generated.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON using exactly these keys:
{{
  "reasoning": "<1-2 sentence detailed reasoning referencing RSI/MACD/PE/Scores/News>",
  "rules_matched": {{
     "condition": "<e.g. oversold_momentum_uptrend>"
  }},
  "confidence_factors": {{
     "technical": <float 0.0-1.0>,
     "fundamental": <float 0.0-1.0>,
     "news_sentiment": <float 0.0-1.0>
  }}
}}

Context:
{context}
"""

# ── Context Builder ───────────────────────────────────────────────────────────

class PortfolioContextBuilder:
    @staticmethod
    def build_intelligence_context(session: Session, org_id: uuid.UUID, portfolio_id: Optional[uuid.UUID] = None, user_id: Optional[uuid.UUID] = None) -> str:
        from app.domain.entities.ai import AIBriefing
        from app.domain.entities.portfolio import Portfolio
        from app.domain.entities.system import OrganizationMember
        from app.domain.services.intelligence import FinancialIntelligenceService

        if not portfolio_id:
            portfolio = session.query(Portfolio).filter(Portfolio.organization_id == org_id).first()
            portfolio_id = portfolio.id if portfolio else None

        if not portfolio_id:
            return ""

        if not user_id:
            member = session.query(OrganizationMember).filter(OrganizationMember.organization_id == org_id).first()
            user_id = member.user_id if member else uuid.UUID("00000000-0000-0000-0000-000000000000")

        intel_svc = FinancialIntelligenceService(session)

        # 1. Health Score
        health = intel_svc.get_investor_health_score(portfolio_id, org_id)

        # 2. Diversification
        div = intel_svc.get_portfolio_diversification_score(portfolio_id)

        # 3. Concentration
        conc = intel_svc.get_portfolio_concentration_analysis(portfolio_id)

        # 4. Cash Opportunities
        cash = intel_svc.get_cash_deployment_opportunities(portfolio_id)

        # 5. Risk Summary
        risk = intel_svc.get_portfolio_risk_summary(portfolio_id)

        # 6. Recommendation Analytics & Performance
        quality = intel_svc.get_recommendation_quality_metrics(org_id)
        performance = intel_svc.get_recommendation_performance(org_id)
        scorecard = intel_svc.get_recommendation_scorecard(org_id)
        calibration = intel_svc.get_confidence_calibration(org_id)
        rule_perf = intel_svc.get_rule_performance(org_id)

        # 7. Goal Progress
        goals = intel_svc.get_goal_progress_metrics(portfolio_id, org_id, user_id)

        # 8. Recent Briefings
        briefings = (
            session.query(AIBriefing)
            .filter(AIBriefing.organization_id == org_id)
            .order_by(AIBriefing.created_at.desc())
            .limit(3)
            .all()
        )

        lines = [
            "=== PORTFOLIO INTELLIGENCE & ANALYTICS CONTEXT ===",
            f"Investor Health Score: {health.get('investor_health_score')} (Diversification: {health.get('diversification_score')}, Discipline: {health.get('allocation_discipline_score')}, Outcomes: {health.get('recommendation_outcomes_score')}, Consistency: {health.get('activity_consistency_score')})",
            f"Portfolio Diversification Score: {div.get('diversification_score')} (HHI: {div.get('hhi')})",
            f"Risk Class: {risk.get('risk_class')} (Crypto %: {risk.get('crypto_percentage')}%, Equity %: {risk.get('equity_percentage')}%)",
            "Concentration Warnings:",
        ]
        for w in conc.get("warnings", []):
            lines.append(f"  - {w}")
        if not conc.get("warnings"):
            lines.append("  - No concentration warnings.")

        lines.append("Cash Deployment Suggestions:")
        for s in cash.get("suggestions", []):
            lines.append(f"  - {s}")
        if not cash.get("suggestions"):
            lines.append("  - No cash opportunities detected.")

        lines.append("Goal Progress:")
        lines.append(f"  - Wealth Goal: Current Net Worth {goals.get('wealth_goals', {}).get('current_net_worth')}, Target {goals.get('wealth_goals', {}).get('target_corpus')}. Projected Years to Target: {goals.get('wealth_goals', {}).get('projected_years_to_target')} years.")
        lines.append(f"  - Allocation Goal: Status {goals.get('allocation_goals', {}).get('status')}")

        lines.append("Recommendation Analytics & Outcomes:")
        lines.append(f"  - Quality Metrics: Total Recommendations {quality.get('total_recommendations')}, Acceptance Rate {quality.get('acceptance_rate')*100:.1f}%, Execution Rate {quality.get('execution_rate')*100:.1f}%")
        lines.append("  - Scorecard (Win Rates):")
        for state, details in scorecard.items():
            lines.append(f"    * {state}: Win Rate {details.get('win_rate')*100:.1f}% (Generated: {details.get('generated')}, Accepted: {details.get('accepted')})")
        lines.append("  - Confidence Calibration:")
        for band, details in calibration.items():
            lines.append(f"    * {band.upper()} Confidence: Win Rate {details.get('win_rate')*100:.1f}% (Avg Return: {details.get('average_return')*100:.1f}%)")
        lines.append("  - Rule Performance (Avg Returns):")
        for state, details in rule_perf.items():
            lines.append(f"    * {state} Rule: Avg Return {details.get('average_return')*100:.1f}% (Win Rate: {details.get('win_rate')*100:.1f}%)")

        lines.append("Recent Recommendation Performance:")
        for p in performance[:5]:
            lines.append(f"  - Rec {p.get('recommendation_id')} ({p.get('symbol')}): 30d Excess Return {p.get('excess_return_30d')*100:.1f}%, 90d {p.get('excess_return_90d')*100:.1f}%")

        lines.append("Recent AI Briefing Vibes:")
        for b in briefings:
            vibe = b.content.get("vibe") or b.content.get("market_vibe") if isinstance(b.content, dict) else ""
            lines.append(f"  - {b.created_at.strftime('%Y-%m-%d')} ({b.briefing_type}): {vibe}")

        return "\n".join(lines)

    @staticmethod
    def build_global_context(session: Session, organization_id: uuid.UUID) -> str:
        portfolios = session.query(Portfolio).filter(Portfolio.organization_id == organization_id).all()
        port_ids = [p.id for p in portfolios]
        
        positions = []
        if port_ids:
            positions = session.query(Position).filter(Position.portfolio_id.in_(port_ids)).all()
            
        lines = [
            "=== PORTFOLIO GLOBAL CONTEXT ===",
            f"Organization ID: {organization_id}",
            f"Total Portfolios: {len(portfolios)}",
            f"Total Positions: {len(positions)}",
            "",
            "--- Holdings & Signals ---"
        ]
        
        symbols = []
        for pos in positions:
            symbol = pos.symbol
            symbols.append(symbol)
            
            # Find latest quote
            quote = session.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()
            asset_id = quote.asset_id if quote else None
            
            avg_cost = float(pos.avg_buy_price) if pos.avg_buy_price is not None else 0.0
            qty = float(pos.quantity) if pos.quantity is not None else 0.0
            live_price = float(quote.price) if quote else 0.0
            pnl_pct = ((live_price - avg_cost) / avg_cost * 100.0) if avg_cost > 0.0 else 0.0
            
            # Features & scores
            rsi, macd, val_score, qual_score = "N/A", "N/A", "N/A", "N/A"
            if asset_id:
                session.query(AssetFeatures).filter(AssetFeatures.asset_id == asset_id).first()
                snap = session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset_id).first()
                if snap:
                    rsi = f"{snap.rsi:.2f}" if snap.rsi is not None else "N/A"
                    if snap.payload and isinstance(snap.payload, dict):
                        macd = f"{snap.payload.get('macd'):.2f}" if snap.payload.get('macd') is not None else "N/A"
                
                score = session.query(AssetScore).filter(AssetScore.asset_id == asset_id).order_by(AssetScore.generated_at.desc()).first()
                if score:
                    val_score = f"{score.valuation_score:.2f}" if score.valuation_score is not None else "N/A"
                    qual_score = f"{score.quality_score:.2f}" if score.quality_score is not None else "N/A"
                    
            lines.append(
                f"Asset: {symbol} | Qty Owned: {qty} | Avg Cost: {avg_cost:.2f} | Current Price: {live_price:.2f} | PnL: {pnl_pct:.2f}% | "
                f"RSI: {rsi} | MACD: {macd} | Valuation Score: {val_score} | Quality Score: {qual_score}"
            )
            
        # Recent Transactions
        lines.append("")
        lines.append("--- Recent Transactions ---")
        if port_ids:
            txns = session.query(Transaction).filter(Transaction.portfolio_id.in_(port_ids)).order_by(Transaction.transaction_date.desc()).limit(10).all()
            for t in txns:
                lines.append(f"{t.transaction_date.strftime('%Y-%m-%d')} - {t.symbol}: {t.transaction_type} {t.quantity} @ {t.price:.2f} (Notes: {t.notes or ''})")
        else:
            lines.append("No recent transactions.")
            
        # Active Recommendations
        lines.append("")
        lines.append("--- Active Recommendations ---")
        recs = session.query(Recommendation).filter(Recommendation.organization_id == organization_id, Recommendation.status == "active").all()
        for r in recs:
            q = session.query(LatestQuote).filter(LatestQuote.asset_id == r.asset_id).first()
            lines.append(f"Recommendation: {q.symbol if q else 'Unknown'} -> state: {r.recommendation_state} (Confidence: {float(r.confidence_score):.2f})")
            
        # News
        lines.append("")
        lines.append("--- Recent News ---")
        if symbols:
            from sqlalchemy import or_
            news_q = session.query(News).filter(or_(*[News.symbols.contains(s) for s in symbols])).order_by(News.published_at.desc()).limit(5).all()
            for n in news_q:
                lines.append(f"Title: {n.title} | Source: {n.source} | Sentiment: {n.sentiment_score if n.sentiment_score is not None else 'N/A'}")
        else:
            lines.append("No news items found.")
            
        global_context_str = "\n".join(lines)
        intel_context = PortfolioContextBuilder.build_intelligence_context(session, organization_id)
        if intel_context:
            global_context_str += "\n\n" + intel_context
        return global_context_str

    @staticmethod
    def build_qa_context(session: Session, context_type: str, context_id: uuid.UUID) -> str:
        lines = []
        org_id = None
        portfolio_id = None
        
        if context_type == "signal":
            quote = session.query(LatestQuote).filter(LatestQuote.id == context_id).first()
            if not quote:
                # Try fallback by symbol
                quote = session.query(LatestQuote).filter(LatestQuote.symbol == str(context_id)).first()
            if not quote:
                raise NotFoundError("Quote not found")
            feat = session.query(AssetFeatures).filter(AssetFeatures.asset_id == quote.asset_id).first()
            snap = session.query(AssetSnapshot).filter(AssetSnapshot.asset_id == quote.asset_id).first()
            lines.append("=== SIGNAL CONTEXT ===")
            lines.append(f"Symbol: {quote.symbol}")
            lines.append(f"Price: {quote.price}")
            rsi, macd, volatility = "N/A", "N/A", "N/A"
            if snap:
                rsi = f"{snap.rsi:.2f}" if snap.rsi is not None else "N/A"
                if snap.payload and isinstance(snap.payload, dict):
                    macd = f"{snap.payload.get('macd'):.2f}" if snap.payload.get('macd') is not None else "N/A"
            if feat:
                volatility = f"{feat.volatility_score:.2f}" if feat.volatility_score is not None else "N/A"
            lines.append(f"RSI: {rsi} | MACD: {macd} | Volatility: {volatility}")
            
            # Find default org
            org = session.query(Organization).first()
            if org:
                org_id = org.id
        elif context_type == "recommendation":
            rec = session.query(Recommendation).filter(Recommendation.id == context_id).first()
            if not rec:
                raise NotFoundError("Recommendation not found")
            quote = session.query(LatestQuote).filter(LatestQuote.asset_id == rec.asset_id).first()
            expl = session.query(RecommendationExplanation).filter(RecommendationExplanation.recommendation_id == rec.id).first()
            lines.append("=== RECOMMENDATION CONTEXT ===")
            lines.append(f"Symbol: {quote.symbol if quote else 'Unknown'}")
            lines.append(f"State: {rec.recommendation_state}")
            lines.append(f"Confidence: {float(rec.confidence_score):.2f}")
            if expl:
                lines.append(f"Reasoning: {expl.reasoning}")
                lines.append(f"Matched Rules: {expl.rules_matched}")
            org_id = rec.organization_id
        elif context_type == "portfolio":
            portfolio = session.query(Portfolio).filter(Portfolio.id == context_id).first()
            if not portfolio:
                raise NotFoundError("Portfolio not found")
            lines.append("=== PORTFOLIO CONTEXT ===")
            lines.append(f"Portfolio Name: {portfolio.name}")
            portfolio_id = portfolio.id
            org_id = portfolio.organization_id
            
        qa_context_str = "\n".join(lines)
        if org_id:
            intel_context = PortfolioContextBuilder.build_intelligence_context(session, org_id, portfolio_id)
            if intel_context:
                qa_context_str += "\n\n" + intel_context
        return qa_context_str

# ── Compliance & Evaluation Engine ────────────────────────────────────────────

def evaluate_response(response_text: str, context_text: str) -> dict[str, Any]:
    actions_valid = True
    parsed_json = None
    
    # Try parsing JSON if structured output requested
    try:
        text = response_text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        parsed_json = json.loads(text)
    except Exception:
        pass

    if parsed_json:
        if isinstance(parsed_json, dict):
            directives = parsed_json.get("directives", [])
            if isinstance(directives, list):
                for d in directives:
                    if isinstance(d, dict) and "action" in d:
                        if d["action"] not in ("BUY", "HOLD", "REDUCE", "AVOID"):
                            actions_valid = False
            if "recommended_action" in parsed_json:
                if parsed_json["recommended_action"] not in ("BUY", "HOLD", "REDUCE", "AVOID"):
                    actions_valid = False

    # Check for data references (presence of numbers, percentages, or indicator keywords)
    has_data_references = False
    if re.search(r'\d+(?:\.\d+)?%?', response_text) or any(w in response_text.upper() for w in ("RSI", "MACD", "PE", "P/E", "PRICE", "COST", "SCORE")):
        has_data_references = True

    # Calculate faithfulness
    faithfulness_score = 1.0
    tickers_in_context = set(re.findall(r'\b[A-Z]{3,5}(?:\.[A-Z]{2})?\b', context_text))
    tickers_in_output = set(re.findall(r'\b[A-Z]{3,5}(?:\.[A-Z]{2})?\b', response_text))
    
    exclude_words = {"BUY", "HOLD", "SELL", "USD", "INR", "AND", "THE", "PE", "RSI", "MACD", "PNL", "QTY", "INFO", "DATE", "JSON", "ONLY", "ROLE"}
    tickers_in_output = tickers_in_output - exclude_words
    
    if tickers_in_output:
        matching = tickers_in_output.intersection(tickers_in_context)
        faithfulness_score = len(matching) / len(tickers_in_output)

    return {
        "actions_valid": actions_valid,
        "data_reference_validated": has_data_references,
        "faithfulness_score": faithfulness_score,
        "relevance_score": 1.0 if parsed_json else 0.5
    }

# ── AI Service ────────────────────────────────────────────────────────────────

class AIService(BaseService):
    _GEMINI_MODELS = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]
    _GROQ_MODELS = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
    ]

    def __init__(self, session: Session):
        self.session = session
        self.cfg_repo = ConfigRepository(session)
        self.cfg_svc = ConfigService(self.cfg_repo)

    def _call_gemini(self, model: str, api_key: str, prompt: str, json_mode: bool) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        config = {}
        if json_mode:
            config["responseMimeType"] = "application/json"
            
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": config
        }
        
        resp = httpx.post(url, json=payload, headers=headers, timeout=60.0)
        if resp.status_code == 429:
            _rate_limit_tracker.mark_cooldown(f"gemini:{model}", 60.0)
            raise httpx.HTTPStatusError("429 Too Many Requests", request=resp.request, response=resp)
        resp.raise_for_status()
        
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    def _call_groq(self, model: str, api_key: str, prompt: str) -> str:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2
        }
        resp = httpx.post(url, json=payload, headers=headers, timeout=60.0)
        if resp.status_code == 429:
            _rate_limit_tracker.mark_cooldown(f"groq:{model}", 60.0)
            raise httpx.HTTPStatusError("429 Too Many Requests", request=resp.request, response=resp)
        resp.raise_for_status()
        
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def _mock_briefing(self, briefing_type: str) -> str:
        if briefing_type == "global":
            return json.dumps({
                "market_vibe": "Stable markets with selective stock buying.",
                "macro_analysis": "Contagion risk remains low; tech sector leading gains.",
                "global_score": 0.75,
                "confidence_score": 0.85,
                "future_projections": {
                    "estimated_30d_trend": "Bullish",
                    "portfolio_risk_level": "LOW",
                    "catalyst_watch": "Fed interest rate decision."
                },
                "directives": [
                    {
                        "symbol": "AAPL",
                        "action": "BUY",
                        "conviction_level": 4,
                        "financial_impact": "+5% impact expected",
                        "position_sizing": "Increase allocation by 2%",
                        "time_horizon": "Medium-Term",
                        "risk_reward_ratio": "1:2",
                        "technical_analysis": "RSI at 52, MACD bullish crossover",
                        "fundamental_analysis": "Strong balance sheet, stable PE 28.5",
                        "news_sentiment": {
                            "bias": "Bullish",
                            "confidence": 80,
                            "impact_summary": "Relaunch of device upgrades drives momentum."
                        },
                        "the_why": "Solid technical signals aligned with underpricing."
                    }
                ],
                "skipped_assets_summary": "No assets skipped."
            })
        elif briefing_type == "weekly":
            return json.dumps({
                "vibe": "Constructive weekly bounce.",
                "macro_summary": "Declining inflation metrics supporting stock indices.",
                "directives": [
                    {
                        "symbol": "AAPL",
                        "action": "BUY",
                        "rationale": "High quality score combined with constructive technical indicator levels."
                    }
                ]
            })
        elif briefing_type == "monthly":
            return json.dumps({
                "vibe": "Strong monthly close.",
                "macro_summary": "Growth indicators continue to look resilient.",
                "directives": [
                    {
                        "symbol": "AAPL",
                        "action": "HOLD",
                        "rationale": "Stable macro variables and solid performance trends."
                    }
                ]
            })
        elif briefing_type == "recommendation_explanation":
            return json.dumps({
                "reasoning": "RSI indicators at 42 suggest an attractive valuation window with positive momentum.",
                "rules_matched": {
                    "condition": "valuation_rebound"
                },
                "confidence_factors": {
                    "technical": 0.8,
                    "fundamental": 0.7,
                    "news_sentiment": 0.6
                }
            })
        return "Mock plain text answer."

    def execute_completion(
        self,
        prompt: str,
        feature_name: str,
        user_id: Optional[uuid.UUID] = None,
        context_payload: Optional[dict[str, Any]] = None,
        retrieval_metadata: Optional[dict[str, Any]] = None,
        json_mode: bool = False
    ) -> str:
        start_time = time.monotonic()
        response_text = ""
        model_used = "mock"
        provider_used = "mock"
        execution_trace = {}
        error_msg = None

        if os.environ.get("AUREON_TEST_MOCK_AI") == "true":
            logger.info("AUREON_TEST_MOCK_AI is active; returning mock completion")
            response_text = self._mock_briefing(feature_name)
        else:
            gemini_key = self.cfg_svc.get_decrypted_key("gemini", "api_key")
            groq_key = self.cfg_svc.get_decrypted_key("groq", "api_key")

            if not gemini_key and not groq_key:
                raise ProviderError("No AI credentials configured (gemini/groq)", retryable=False)
            else:
                # 1. Try Gemini rotation
                gemini_provider = self.cfg_repo.get_provider("gemini")
                if gemini_key and gemini_provider and gemini_provider.enabled:
                    available_gemini = _rate_limit_tracker.filter_available(self._GEMINI_MODELS)
                    for model in available_gemini:
                        try:
                            logger.info(f"Attempting Gemini model: {model}")
                            response_text = self._call_gemini(model, gemini_key, prompt, json_mode)
                            model_used = model
                            provider_used = "gemini"
                            break
                        except Exception as e:
                            execution_trace[f"gemini:{model}"] = str(e)
                            logger.error(f"Gemini {model} failed: {e}")

                # 2. Try Groq rotation fallback
                groq_provider = self.cfg_repo.get_provider("groq")
                if not response_text and groq_key and groq_provider and groq_provider.enabled:
                    available_groq = _rate_limit_tracker.filter_available(self._GROQ_MODELS)
                    for model in available_groq:
                        try:
                            logger.info(f"Attempting Groq model: {model}")
                            response_text = self._call_groq(model, groq_key, prompt)
                            model_used = model
                            provider_used = "groq"
                            break
                        except Exception as e:
                            execution_trace[f"groq:{model}"] = str(e)
                            logger.error(f"Groq {model} failed: {e}")

                if not response_text:
                    error_msg = f"All models exhausted. Trace: {execution_trace}"
                    logger.error(error_msg)
                    raise ProviderError(error_msg)

        latency = int((time.monotonic() - start_time) * 1000)

        # Record AI metrics and check slow warning
        try:
            from app.core.observability.metrics import ai_evaluation_duration_seconds, slo_evaluation_sla_status
            ai_evaluation_duration_seconds.observe(latency / 1000.0, feature_name=feature_name, model=model_used)
            slo_evaluation_sla_status.set(1.0 if latency <= 2000.0 else 0.0, feature_name=feature_name)
        except Exception:
            pass

        if latency > 2000.0:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("Evaluation", latency, details={"feature_name": feature_name, "model": model_used})

        # Observability Log
        import hashlib
        prompt_sha = hashlib.sha256(prompt.encode()).hexdigest()
        
        gen_log = AIGeneration(
            id=uuid.uuid4(),
            user_id=user_id,
            feature_name=feature_name,
            provider=provider_used,
            model=model_used,
            prompt_text=prompt,
            response_text=response_text,
            latency_ms=latency,
            error_message=error_msg,
            context_payload=context_payload,
            retrieval_metadata=retrieval_metadata,
            prompt_sha256=prompt_sha,
            execution_trace=execution_trace,
            payload_retention_state="full"
        )
        self.session.add(gen_log)
        self.session.flush()

        # Run compliance & evaluation checks
        context_str = json.dumps(context_payload) if context_payload else ""
        eval_metrics = evaluate_response(response_text, context_str)
        
        eval_record = AIEvaluation(
            id=uuid.uuid4(),
            generation_id=gen_log.id,
            faithfulness_score=eval_metrics["faithfulness_score"],
            relevance_score=eval_metrics["relevance_score"],
            data_reference_validated=eval_metrics["data_reference_validated"],
            validation_details={
                "actions_valid": eval_metrics["actions_valid"],
                "raw_check": True
            }
        )
        self.session.add(eval_record)
        self.session.commit()

        return response_text

    # ── High Level AI Actions ──────────────────────────────────────────────────

    def generate_briefing(self, organization_id: uuid.UUID, briefing_type: str, user_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        context = PortfolioContextBuilder.build_global_context(self.session, organization_id)
        
        if briefing_type == "global":
            prompt = _GLOBAL_BRIEFING_PROMPT.format(context=context)
        elif briefing_type == "weekly":
            prompt = _WEEKLY_BRIEFING_PROMPT.format(context=context)
        elif briefing_type == "monthly":
            prompt = _MONTHLY_BRIEFING_PROMPT.format(context=context)
        else:
            raise ValidationError(f"Invalid briefing type: {briefing_type}")
            
        payload = {"organization_id": str(organization_id), "context_length": len(context)}
        meta = {"symbols": [], "context_type": "global"}
        
        raw_response = self.execute_completion(
            prompt=prompt,
            feature_name=briefing_type,
            user_id=user_id,
            context_payload=payload,
            retrieval_metadata=meta,
            json_mode=True
        )

        try:
            parsed = json.loads(raw_response)
        except Exception:
            # Clean backup extraction
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw_response.strip(), flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = json.loads(cleaned)

        # Save briefing instance
        briefing = AIBriefing(
            id=uuid.uuid4(),
            organization_id=organization_id,
            briefing_type=briefing_type,
            content=parsed,
            model_used="multiple-fallback"
        )
        self.session.add(briefing)
        self.session.flush()
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="generate_briefing",
            entity_type="ai_briefing",
            entity_id=str(briefing.id),
            actor_id=user_id,
            details={"briefing_type": briefing_type, "organization_id": str(organization_id)}
        )
        self.session.commit()
        
        return parsed

    def ask_aureon(self, context_type: str, context_id: uuid.UUID, question: str, user_id: Optional[uuid.UUID] = None) -> str:
        context = PortfolioContextBuilder.build_qa_context(self.session, context_type, context_id)
        prompt = _QA_PROMPT.format(context=context, question=question)
        
        payload = {"context_type": context_type, "context_id": str(context_id), "question": question}
        meta = {"target_id": str(context_id)}
        
        res = self.execute_completion(
            prompt=prompt,
            feature_name="ask_aureon",
            user_id=user_id,
            context_payload=payload,
            retrieval_metadata=meta,
            json_mode=False
        )
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="ask_aureon",
            entity_type="ai_qa",
            entity_id=str(context_id),
            actor_id=user_id,
            details={"context_type": context_type, "question": question}
        )
        self.session.commit()
        return res

    def explain_recommendation(self, recommendation_id: uuid.UUID, user_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        rec = self.session.query(Recommendation).filter(Recommendation.id == recommendation_id).first()
        if not rec:
            raise NotFoundError("Recommendation not found")

        context = PortfolioContextBuilder.build_qa_context(self.session, "recommendation", recommendation_id)
        prompt = _RECOMMENDATION_EXPLANATION_PROMPT.format(context=context)
        
        payload = {"recommendation_id": str(recommendation_id)}
        meta = {"target_id": str(recommendation_id)}
        
        raw_response = self.execute_completion(
            prompt=prompt,
            feature_name="recommendation_explanation",
            user_id=user_id,
            context_payload=payload,
            retrieval_metadata=meta,
            json_mode=True
        )

        try:
            parsed = json.loads(raw_response)
        except Exception:
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw_response.strip(), flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = json.loads(cleaned)

        # Update or create explanation in database
        expl = self.session.query(RecommendationExplanation).filter(RecommendationExplanation.recommendation_id == recommendation_id).first()
        if not expl:
            expl = RecommendationExplanation(
                recommendation_id=recommendation_id,
                rules_matched=parsed.get("rules_matched", {}),
                reasoning=parsed.get("reasoning", "AI generated explanation."),
                confidence_factors=parsed.get("confidence_factors", {})
            )
            self.session.add(expl)
        else:
            expl.rules_matched = parsed.get("rules_matched", {})
            expl.reasoning = parsed.get("reasoning", expl.reasoning)
            expl.confidence_factors = parsed.get("confidence_factors", {})
            
        self.session.flush()
        from app.domain.services.audit import log_audit_action
        log_audit_action(
            self.session,
            action="explain_recommendation",
            entity_type="recommendation",
            entity_id=str(recommendation_id),
            actor_id=user_id,
            details={"confidence_factors": parsed.get("confidence_factors", {})}
        )
        self.session.commit()
        return parsed
