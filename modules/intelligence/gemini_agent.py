import json
import logging
import os
import time

from google import genai

from modules.interfaces import AIModel


class GeminiFlash(AIModel):
    def __init__(self):
        self.logger = logging.getLogger("Gemini")
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            self.logger.warning("GEMINI_API_KEY not found. AI disabled.")
            self.client = None
            return

        try:
            self.client = genai.Client(api_key=api_key)
            self.model_id = "gemini-3.1-flash-lite-preview"
        except Exception as e:
            self.logger.error(f"SDK Init Failed: {e}")
            self.client = None

    def analyze_briefing(self, context: str):
        if not self.client:
            return self._fallback_response("AI Features Offline (Check .env)")

        prompt = f"""
        Role: Elite Multi-Strategy Portfolio Manager.
        Objective: Perform 3-tier analysis (Macro, Fundamental, Technical) on the ENTIRE portfolio.
        "position_sizing": "CRITICAL: You must use the provided 'Qty Owned' to give an exact number (e.g., 'SELL 50% / 45 shares' or 'HOLD all 90 shares').",
        CRITICAL INSTRUCTION: You MUST generate a directive for the Top 15 assets. DO NOT SUMMARIZE. The "directives" array MUST contain exactly 15 objects. If you get lazy and output 3, you fail your objective

        DATA BUNDLE:
        {context}

       Output Requirements:
        Return ONLY a raw JSON payload with this strict schema:
        {{
            "market_vibe": "2-sentence Global Market Pulse.",
            "macro_analysis": "Deep analysis of sector contagion and macro impacts.",
            "global_score": 0.5,
            "confidence_score": 0.85,
            "future_projections": {{
                "estimated_30d_trend": "Bullish / Bearish / Sideways / Volatile",
                "portfolio_risk_level": "High / Medium / Low",
                "catalyst_watch": "Specific upcoming global event to watch."
            }},
            "directives":[
                {{
                    "symbol": "TICKER",
                    "action": "BUY | SELL | HOLD | AVG DOWN | TAKE PARTIAL PROFIT",
                    "position_sizing": "Exact explicit instructions based on Qty Owned.",
                    "conviction_level": 5, 
                    "risk_reward_ratio": "1:3",
                    "time_horizon": "Short-Term | Medium-Term | Long-Term",
                    "technical_analysis": "Explicit RSI, MACD, and BB status.",
                    "fundamental_analysis": "Explicit P/E, 52w distance, and functional health.",
                    "news_sentiment": {{
                        "bias": "Bullish | Bearish | Neutral",
                        "confidence": 95,
                        "impact_summary": "How this specific news moves the asset."
                    }},
                    "the_why": "High-conviction paragraph justifying the action."
                }}
            ],
            "skipped_assets_summary": "List tickers skipped and why."
        }}
        """

        # 📝 LOG THE EXACT PAYLOAD SENT
        self.logger.info(f"🚀 PAYLOAD SENT TO GEMINI:\n{prompt}")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model_id,
                    contents=prompt,
                    config={'response_mime_type': 'application/json'}
                )

                raw_text = response.text.strip()
                if "```json" in raw_text:
                    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_text:
                    raw_text = raw_text.split("```")[1].strip()

                parsed = json.loads(raw_text)
                if isinstance(parsed, str): parsed = json.loads(parsed)
                if not isinstance(parsed, dict): return self._fallback_response("Invalid structure.")

                return parsed

            except Exception as e:
                error_msg = str(e)
                # If Google is overloaded (503) or Rate Limited (429), Wait and Retry!
                if "503" in error_msg or "429" in error_msg:
                    if attempt < max_retries - 1:
                        sleep_time = 2 ** attempt  # Waits 1s, then 2s, then 4s
                        logging.getLogger("Gemini").warning(
                            f"Google Server Busy (503/429). Retrying in {sleep_time}s...")
                        time.sleep(sleep_time)
                        continue  # Try again

                logging.getLogger("Gemini").error(f"JSON Parsing Error: {error_msg}")
                return self._fallback_response("AI Output failed to parse or Google Servers Down.")
        return None

    def analyze_single_asset(self, context: str):
        """Dedicated deep-dive AI prompt for a single asset."""
        if not self.client: return {"error": "AI Offline"}

        prompt = f"""
        Role: Elite Proprietary Trader.
        Objective: Perform a highly detailed, laser-focused analysis on THIS SINGLE ASSET.
        
        DATA BUNDLE:
        {context}

        Return ONLY a JSON payload with this schema:
        {{
            "short_term_trend": "Bullish | Bearish | Neutral",
            "key_catalyst": "The main driver moving this stock based on the news.",
            "support_resistance": "Estimate support/resistance based on ATR, Bollinger Bands, and 52w high/low.",
            "recommended_action": "BUY | SELL | HOLD | AVG DOWN",
            "position_sizing": "Exact explicit instructions based on 'Qty Owned' (e.g., 'Sell 50% / 10 shares').",
            "deep_reasoning": "A thick, professional paragraph explaining the structural market setup."
        }}
        """
        try:
            # Reusing the retry logic we built earlier
            response = self.client.models.generate_content(model=self.model_id, contents=prompt,
                                                           config={'response_mime_type': 'application/json'})
            raw_text = response.text.strip().replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            return {"deep_reasoning": f"Analysis Failed: {e}"}

    def _fallback_response(self, reason: str):
        return {
            "future_projections": {"estimated_30d_trend": "Unknown", "portfolio_risk_level": "Unknown",
                                   "catalyst_watch": "Offline"},
            # "skipped_assets_summary": "Offline"
        }
