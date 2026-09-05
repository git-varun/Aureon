import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { prisma } from "../../prisma";
import { Prisma } from "../../generated/prisma";
import { NotFoundError, ProviderError, RateLimitError, ValidationError } from "../errors";
import { logAuditAction } from "../audit";
import { getDecryptedKey } from "../settings/providers";
import { aiCircuitBreaker } from "./circuitBreaker";
import { GEMINI_MODELS, geminiFetch, type FetchUsage } from "./providers/gemini";
import { GROQ_MODELS, groqFetch } from "./providers/groq";
import { buildGlobalContext, buildQaContext } from "./contextBuilder";
import { logger } from "../logger";

// Port of app/modules/ai/services/ai.py's AIService (execute_completion,
// generate_briefing, ask_aureon, explain_recommendation, submit_feedback,
// get_briefing_history, get_single_asset_take, get_usage_summary).

// ── Prompts (byte-identical JSON schema keys to the Python originals) ──────

const QA_PROMPT = (context: string, question: string) => `\
You are Aureon, a professional investment AI assistant. Answer the following question concisely and specifically, \
based only on the provided context. Be direct and practical. Maximum 3 paragraphs.
Every conclusion you make must explicitly reference numbers, percentages, indicators, or specific dates from the context.

Context:
${context}

Question: ${question}

Answer:`;

const GLOBAL_BRIEFING_PROMPT = (context: string) => `\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Perform 3-tier analysis (Macro, Fundamental, Technical) on the ENTIRE portfolio context.
Position sizing rule: CRITICAL — use the provided Qty to give exact numbers (e.g. "SELL 50% / 45 shares" or "HOLD all 90 shares").
Directive count rule: CRITICAL — generate directives for the assets.
CRITICAL Rule: Do not generate recommendations other than the supported actions: BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference underlying data from the context (PE, RSI, MACD, prices, or news titles).

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{
  "market_vibe": "<2-sentence Global Market Pulse>",
  "macro_analysis": "<Deep analysis of sector contagion and macro impacts>",
  "global_score": <float 0.0-1.0 overall market health>,
  "confidence_score": <float 0.0-1.0 confidence in this briefing>,
  "future_projections": {
    "estimated_30d_trend": "<Bullish / Bearish / Sideways / Volatile>",
    "portfolio_risk_level": "<LOW | MEDIUM | MEDIUM-HIGH | HIGH | EXTREME>",
    "catalyst_watch": "<Specific upcoming global event to watch>"
  },
  "directives": [
    {
      "symbol": "<exact ticker symbol from portfolio>",
      "action": "<BUY | HOLD | REDUCE | AVOID>",
      "conviction_level": <integer 1-5>,
      "financial_impact": "<expected return or risk in % over timeframe>",
      "position_sizing": "<exact explicit instructions based on Qty Owned>",
      "time_horizon": "<Short-Term | Medium-Term | Long-Term>",
      "risk_reward_ratio": "<e.g. 1:2, 1:3>",
      "technical_analysis": "<explicit RSI, MACD, and Bollinger Band status>",
      "fundamental_analysis": "<explicit P/E, 52w distance, and financial health>",
      "news_sentiment": {
        "bias": "<Bullish | Bearish | Neutral>",
        "confidence": <integer 0-100>,
        "impact_summary": "<how this specific news moves the asset>"
      },
      "the_why": "<high-conviction paragraph justifying the action>"
    }
  ],
  "skipped_assets_summary": "<list tickers skipped and why>"
}

Portfolio context:
${context}
`;

const WEEKLY_BRIEFING_PROMPT = (context: string) => `\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Generate a weekly investment briefing summarizing macro movements and asset behaviors.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{
  "vibe": "<1-sentence summary of the week>",
  "macro_summary": "<Macro trend updates>",
  "directives": [
     {
       "symbol": "<exact ticker symbol>",
       "action": "<BUY | HOLD | REDUCE | AVOID>",
       "rationale": "<Concise data-backed explanation>"
     }
  ]
}

Portfolio context:
${context}
`;

const MONTHLY_BRIEFING_PROMPT = (context: string) => `\
Role: Elite Multi-Strategy Portfolio Manager.
Objective: Generate a monthly portfolio health summary.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON (no markdown, no extra text) using exactly these keys:
{
  "vibe": "<1-sentence summary of the month>",
  "macro_summary": "<Macro trends over the month>",
  "directives": [
     {
       "symbol": "<exact ticker symbol>",
       "action": "<BUY | HOLD | REDUCE | AVOID>",
       "rationale": "<Concise data-backed explanation>"
     }
  ]
}

Portfolio context:
${context}
`;

const RECOMMENDATION_EXPLANATION_PROMPT = (context: string) => `\
Role: Elite Quantitative Analyst.
Objective: Provide a detailed, data-backed explanation for why a specific recommendation was generated.
Do not recommend states other than BUY, HOLD, REDUCE, AVOID.
Every conclusion you make must explicitly reference numbers or percentages from the context.

Respond with ONLY valid JSON using exactly these keys:
{
  "reasoning": "<1-2 sentence detailed reasoning referencing RSI/MACD/PE/Scores/News>",
  "rules_matched": {
     "condition": "<e.g. oversold_momentum_uptrend>"
  },
  "confidence_factors": {
     "technical": <float 0.0-1.0>,
     "fundamental": <float 0.0-1.0>,
     "news_sentiment": <float 0.0-1.0>
  }
}

Context:
${context}
`;

const SINGLE_ASSET_TAKE_PROMPT = (symbol: string, context: string) => `\
Role: Investment Advisor.
Analyze this asset: ${symbol}.
Context:
${context}

Provide 3 sentences of technical/fundamental analysis. Any metric marked N/A is genuinely unavailable — do not invent or assume a value for it; note it as unavailable if relevant instead. Return JSON only with key: 'take'.`;

// ── Compliance & Evaluation Engine ──────────────────────────────────────────

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(stripCodeFence(text));
  }
}

export interface EvalMetrics {
  actions_valid: boolean;
  data_reference_validated: boolean;
  faithfulness_score: number;
  relevance_score: number;
}

/** Port of evaluate_response. */
export function evaluateResponse(responseText: string, contextText: string): EvalMetrics {
  let actionsValid = true;
  let parsedJson: Record<string, unknown> | null = null;

  try {
    parsedJson = JSON.parse(stripCodeFence(responseText));
  } catch {
    // Not JSON — leave parsedJson null, matching Python's bare except: pass.
  }

  if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
    const directives = parsedJson.directives;
    if (Array.isArray(directives)) {
      for (const d of directives) {
        if (d && typeof d === "object" && "action" in d) {
          if (!["BUY", "HOLD", "REDUCE", "AVOID"].includes(d.action)) actionsValid = false;
        }
      }
    }
    if ("recommended_action" in parsedJson) {
      if (!["BUY", "HOLD", "REDUCE", "AVOID"].includes(String(parsedJson.recommended_action))) actionsValid = false;
    }
  }

  const hasDataReferences =
    /\d+(?:\.\d+)?%?/.test(responseText) ||
    ["RSI", "MACD", "PE", "P/E", "PRICE", "COST", "SCORE"].some((w) => responseText.toUpperCase().includes(w));

  let faithfulnessScore = 1.0;
  const tickerPattern = /\b[A-Z]{3,5}(?:\.[A-Z]{2})?\b/g;
  const tickersInContext = new Set(contextText.match(tickerPattern) ?? []);
  let tickersInOutput = new Set(responseText.match(tickerPattern) ?? []);

  const excludeWords = new Set(["BUY", "HOLD", "SELL", "USD", "INR", "AND", "THE", "PE", "RSI", "MACD", "PNL", "QTY", "INFO", "DATE", "JSON", "ONLY", "ROLE"]);
  tickersInOutput = new Set([...tickersInOutput].filter((t) => !excludeWords.has(t)));

  if (tickersInOutput.size > 0) {
    const matching = [...tickersInOutput].filter((t) => tickersInContext.has(t));
    faithfulnessScore = matching.length / tickersInOutput.size;
  }

  return {
    actions_valid: actionsValid,
    data_reference_validated: hasDataReferences,
    faithfulness_score: faithfulnessScore,
    relevance_score: parsedJson ? 1.0 : 0.5,
  };
}

// ── Mock briefing (test-only escape hatch, gated by AUREON_TEST_MOCK_AI) ───

function mockBriefing(briefingType: string): string {
  if (briefingType === "global") {
    return JSON.stringify({
      market_vibe: "Stable markets with selective stock buying.",
      macro_analysis: "Contagion risk remains low; tech sector leading gains.",
      global_score: 0.75,
      confidence_score: 0.85,
      future_projections: {
        estimated_30d_trend: "Bullish",
        portfolio_risk_level: "LOW",
        catalyst_watch: "Fed interest rate decision.",
      },
      directives: [
        {
          symbol: "AAPL",
          action: "BUY",
          conviction_level: 4,
          financial_impact: "+5% impact expected",
          position_sizing: "Increase allocation by 2%",
          time_horizon: "Medium-Term",
          risk_reward_ratio: "1:2",
          technical_analysis: "RSI at 52, MACD bullish crossover",
          fundamental_analysis: "Strong balance sheet, stable PE 28.5",
          news_sentiment: { bias: "Bullish", confidence: 80, impact_summary: "Relaunch of device upgrades drives momentum." },
          the_why: "Solid technical signals aligned with underpricing.",
        },
      ],
      skipped_assets_summary: "No assets skipped.",
    });
  } else if (briefingType === "weekly") {
    return JSON.stringify({
      vibe: "Constructive weekly bounce.",
      macro_summary: "Declining inflation metrics supporting stock indices.",
      directives: [{ symbol: "AAPL", action: "BUY", rationale: "High quality score combined with constructive technical indicator levels." }],
    });
  } else if (briefingType === "monthly") {
    return JSON.stringify({
      vibe: "Strong monthly close.",
      macro_summary: "Growth indicators continue to look resilient.",
      directives: [{ symbol: "AAPL", action: "HOLD", rationale: "Stable macro variables and solid performance trends." }],
    });
  } else if (briefingType === "recommendation_explanation") {
    return JSON.stringify({
      reasoning: "RSI indicators at 42 suggest an attractive valuation window with positive momentum.",
      rules_matched: { condition: "valuation_rebound" },
      confidence_factors: { technical: 0.8, fundamental: 0.7, news_sentiment: 0.6 },
    });
  }
  return "Mock plain text answer.";
}

// ── execute_completion ──────────────────────────────────────────────────────

export interface ExecuteCompletionResult {
  responseText: string;
  generationId: string;
}

/** Port of AIService.execute_completion. Returns (response_text,
 * generation_id) — the generation_id lets callers attach user feedback
 * (ai_feedback.generation_id) to the exact row that produced this response. */
export async function executeCompletion(
  prompt: string,
  featureName: string,
  userId: string | null,
  contextPayload: Record<string, unknown> | null,
  retrievalMetadata: Record<string, unknown> | null,
  jsonMode: boolean,
): Promise<ExecuteCompletionResult> {
  const startTime = Date.now();
  let responseText = "";
  let modelUsed = "mock";
  let providerUsed = "mock";
  const executionTrace: Record<string, string> = {};
  let errorMsg: string | null = null;
  let usage: FetchUsage = { prompt_tokens: null, completion_tokens: null, total_tokens: null };

  if (process.env.AUREON_TEST_MOCK_AI === "true") {
    logger.info({ operation: "ai_completion", mock: true }, "AUREON_TEST_MOCK_AI is active; returning mock completion");
    responseText = mockBriefing(featureName);
  } else {
    const geminiKey = await getDecryptedKey("gemini", "api_key");
    const groqKey = await getDecryptedKey("groq", "api_key");

    if (!geminiKey && !groqKey) {
      throw new ProviderError("No AI credentials configured (gemini/groq)");
    }

    // Fallback chain: try every model of every AI provider, in priority
    // order, skipping whichever the circuit breaker currently has cooled
    // down.
    const providerChain: [string, string[], string | null, typeof geminiFetch | typeof groqFetch][] = [
      ["gemini", GEMINI_MODELS, geminiKey, geminiFetch],
      ["groq", GROQ_MODELS, groqKey, groqFetch],
    ];

    // BUG-B: each provider fetch has its own AbortSignal.timeout (60 s), but
    // nothing caps total wall-clock across the whole chain, so a series of
    // slow/hanging models stacks up (phase-1 saw an 11-min single-take).
    // This is the outer ceiling: once elapsed exceeds the budget, stop
    // trying further models and fall through to the exhaustion throw.
    const parsedBudget = Number(process.env.AI_COMPLETION_BUDGET_MS);
    const budgetMs = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 90_000;
    let budgetExceeded = false;

    for (const [pname, models, key, fetchFn] of providerChain) {
      if (responseText || !key || budgetExceeded) continue;
      for (const model of models) {
        if (Date.now() - startTime > budgetMs) {
          budgetExceeded = true;
          executionTrace.__budget__ = `wall-clock budget ${budgetMs}ms exceeded before ${pname}:${model}`;
          logger.error({ operation: "ai_completion", budgetMs }, "ai completion wall-clock budget exceeded");
          break;
        }
        const cooldownKey = `${pname}:${model}`;
        if (await aiCircuitBreaker.isOpen(cooldownKey)) continue;
        try {
          logger.info({ operation: "ai_completion", provider: pname, model }, "attempting model");
          const [text, u] = await fetchFn(key, prompt, jsonMode, model);
          responseText = text;
          usage = u;
          modelUsed = model;
          providerUsed = pname;
          break;
        } catch (e) {
          const msg = String((e as Error).message);
          executionTrace[cooldownKey] = msg;
          if (e instanceof RateLimitError) {
            await aiCircuitBreaker.trip(cooldownKey, 60.0);
            logger.error({ operation: "ai_completion", provider: pname, model, err: e }, "model rate limited");
          } else if (msg.includes("AUTH_FAILED:")) {
            // BUG-P: the stored key is bad (groq is live proof — 401 on every
            // model). Trip a modest cooldown so a dead provider isn't
            // re-hammered every request. Kept short (5 min) so a key the
            // operator fixes in Settings recovers on its own without a
            // manual Redis flush.
            await aiCircuitBreaker.trip(cooldownKey, 300.0);
            logger.error({ operation: "ai_completion", provider: pname, model, err: e }, "model auth failed — cooled down");
          } else {
            logger.error({ operation: "ai_completion", provider: pname, model, err: e }, "model failed");
          }
        }
      }
    }

    if (!responseText) {
      errorMsg = `All models exhausted. Trace: ${JSON.stringify(executionTrace)}`;
      logger.error({ operation: "ai_completion", executionTrace }, errorMsg);
      throw new ProviderError(errorMsg);
    }
  }

  const latency = Date.now() - startTime;
  const promptSha = crypto.createHash("sha256").update(prompt).digest("hex");

  const generationId = uuidv4();
  await prisma.ai_generations.create({
    data: {
      id: generationId,
      user_id: userId,
      feature_name: featureName,
      provider: providerUsed,
      model: modelUsed,
      prompt_text: prompt,
      response_text: responseText,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms: latency,
      error_message: errorMsg,
      context_payload: (contextPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      retrieval_metadata: (retrievalMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      prompt_sha256: promptSha,
      execution_trace: executionTrace as Prisma.InputJsonValue,
      payload_retention_state: "full",
      generation_parameters: {},
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  const contextStr = contextPayload ? JSON.stringify(contextPayload) : "";
  const evalMetrics = evaluateResponse(responseText, contextStr);

  await prisma.ai_evaluations.create({
    data: {
      id: uuidv4(),
      generation_id: generationId,
      faithfulness_score: evalMetrics.faithfulness_score,
      relevance_score: evalMetrics.relevance_score,
      data_reference_validated: evalMetrics.data_reference_validated,
      validation_details: { actions_valid: evalMetrics.actions_valid, raw_check: true },
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  return { responseText, generationId };
}

// ── High-level AI actions ───────────────────────────────────────────────────

/** Port of generate_briefing. */
export async function generateBriefing(briefingType: string, userId: string | null): Promise<Record<string, unknown>> {
  const context = await buildGlobalContext();

  let prompt: string;
  if (briefingType === "global") prompt = GLOBAL_BRIEFING_PROMPT(context);
  else if (briefingType === "weekly") prompt = WEEKLY_BRIEFING_PROMPT(context);
  else if (briefingType === "monthly") prompt = MONTHLY_BRIEFING_PROMPT(context);
  else throw new ValidationError(`Invalid briefing type: ${briefingType}`);

  const payload = { context_length: context.length };
  const meta = { symbols: [], context_type: "global" };

  const { responseText: rawResponse, generationId } = await executeCompletion(prompt, briefingType, userId, payload, meta, true);

  const parsed = parseJsonLoose(rawResponse) as Record<string, unknown>;

  // Attach generation_id so the frontend can submit feedback against this
  // exact ai_generations row; persisted in content so it survives into
  // get_briefing_history's read path too.
  parsed.generation_id = generationId;

  const genLog = await prisma.ai_generations.findUnique({ where: { id: generationId } });

  const briefingId = uuidv4();
  await prisma.ai_briefings.create({
    data: {
      id: briefingId,
      briefing_type: briefingType,
      content: parsed as Prisma.InputJsonValue,
      model_used: genLog?.model ?? "unknown",
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.$transaction(async (tx) => {
    await logAuditAction(tx, "generate_briefing", "ai_briefing", userId, briefingId, { briefing_type: briefingType });
  });

  return parsed;
}

/** Port of ask_aureon. */
export async function askAureon(
  contextType: string,
  contextId: string,
  question: string,
  userId: string | null,
): Promise<{ response: string; generationId: string }> {
  const context = await buildQaContext(contextType, contextId);
  const prompt = QA_PROMPT(context, question);

  const payload = { context_type: contextType, context_id: contextId, question };
  const meta = { target_id: contextId };

  const { responseText, generationId } = await executeCompletion(prompt, "ask_aureon", userId, payload, meta, false);

  await prisma.$transaction(async (tx) => {
    await logAuditAction(tx, "ask_aureon", "ai_qa", userId, contextId, { context_type: contextType, question });
  });

  return { response: responseText, generationId };
}

/** Port of explain_recommendation. */
export async function explainRecommendation(recommendationId: string, userId: string | null): Promise<Record<string, unknown>> {
  const rec = await prisma.recommendations.findUnique({ where: { id: recommendationId } });
  if (!rec) throw new NotFoundError("Recommendation not found");

  const context = await buildQaContext("recommendation", recommendationId);
  const prompt = RECOMMENDATION_EXPLANATION_PROMPT(context);

  const payload = { recommendation_id: recommendationId };
  const meta = { target_id: recommendationId };

  const { responseText: rawResponse, generationId } = await executeCompletion(
    prompt,
    "recommendation_explanation",
    userId,
    payload,
    meta,
    true,
  );

  const parsed = parseJsonLoose(rawResponse) as Record<string, unknown>;
  parsed.generation_id = generationId;

  const rulesMatched = (parsed.rules_matched ?? {}) as Prisma.InputJsonValue;
  const reasoning = (parsed.reasoning as string) ?? "AI generated explanation.";
  const confidenceFactors = (parsed.confidence_factors ?? {}) as Prisma.InputJsonValue;

  await prisma.recommendation_explanations.upsert({
    where: { recommendation_id: recommendationId },
    create: { recommendation_id: recommendationId, rules_matched: rulesMatched, reasoning, confidence_factors: confidenceFactors },
    update: { rules_matched: rulesMatched, reasoning, confidence_factors: confidenceFactors },
  });

  await prisma.$transaction(async (tx) => {
    await logAuditAction(tx, "explain_recommendation", "recommendation", userId, recommendationId, {
      confidence_factors: parsed.confidence_factors ?? {},
    });
  });

  return parsed;
}

/** Port of submit_feedback. */
export async function submitFeedback(
  generationId: string,
  rating: number,
  comment: string | null,
  userId: string | null,
): Promise<{ id: string; generation_id: string; rating: number }> {
  if (rating !== 1 && rating !== -1) throw new ValidationError("rating must be 1 (thumbs up) or -1 (thumbs down)");

  const gen = await prisma.ai_generations.findUnique({ where: { id: generationId } });
  if (!gen) throw new NotFoundError("AI generation not found");

  const feedback = await prisma.ai_feedback.create({
    data: {
      id: uuidv4(),
      generation_id: generationId,
      user_id: userId,
      rating,
      comment,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  return { id: feedback.id, generation_id: feedback.generation_id, rating: feedback.rating };
}

/** Port of get_briefing_history. Row id is spread *after* content so a
 * content.id can't shadow it. */
export async function getBriefingHistory(limit = 30): Promise<Record<string, unknown>[]> {
  const briefs = await prisma.ai_briefings.findMany({
    where: { briefing_type: "global" },
    orderBy: { created_at: "desc" },
    take: limit,
  });
  return briefs.map((b) => ({ ...(b.content as Record<string, unknown>), id: b.id }));
}

/** Port of get_single_asset_take. */
export async function getSingleAssetTake(symbolRaw: string, userId: string | null): Promise<Record<string, unknown>> {
  const symbol = symbolRaw.toUpperCase().trim();

  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  let context = "";
  if (quote) {
    const snap = quote.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
    const rsi = snap?.rsi !== null && snap?.rsi !== undefined ? Number(snap.rsi).toFixed(1) : "N/A";
    const pe = snap?.peRatio !== null && snap?.peRatio !== undefined ? Number(snap.peRatio).toFixed(1) : "N/A";
    context = `Asset: ${symbol} | Price: ${quote.price} | RSI: ${rsi} | PE Ratio: ${pe}`;
  }

  const prompt = SINGLE_ASSET_TAKE_PROMPT(symbol, context);
  const { responseText, generationId } = await executeCompletion(prompt, "single", userId, null, null, true);

  const parsed = parseJsonLoose(responseText) as Record<string, unknown>;
  parsed.generation_id = generationId;
  return parsed;
}

/** Port of get_usage_summary. Aggregate token usage over ai_generations,
 * grouped by provider/model. No dollar cost is computed — per-model pricing
 * isn't tracked anywhere in this codebase, and hardcoding a rate table would
 * be fabricating a number this system never actually observed. Rows written
 * before token capture was added have null token counts and are excluded
 * from the token sums but included in generation_count. */
export async function getUsageSummary(since: Date | null, until: Date | null): Promise<Record<string, unknown>> {
  const where: Prisma.ai_generationsWhereInput = {};
  if (since !== null || until !== null) {
    where.created_at = {};
    if (since !== null) where.created_at.gte = since;
    if (until !== null) where.created_at.lte = until;
  }

  const grouped = await prisma.ai_generations.groupBy({
    by: ["provider", "model"],
    where,
    _count: { _all: true, error_message: true },
    _sum: { prompt_tokens: true, completion_tokens: true, total_tokens: true },
    _avg: { latency_ms: true },
  });

  const byModel = grouped.map((r) => ({
    provider: r.provider,
    model: r.model,
    generation_count: r._count._all,
    prompt_tokens: r._sum.prompt_tokens,
    completion_tokens: r._sum.completion_tokens,
    total_tokens: r._sum.total_tokens,
    avg_latency_ms: r._avg.latency_ms !== null ? Math.round(r._avg.latency_ms * 10) / 10 : null,
    error_count: r._count.error_message,
  }));

  const totalTokens = byModel.reduce((sum, m) => (m.total_tokens !== null ? sum + m.total_tokens : sum), 0);
  const anyTotalTokens = byModel.some((m) => m.total_tokens !== null);

  return {
    since: since ? since.toISOString() : null,
    until: until ? until.toISOString() : null,
    by_model: byModel,
    total_generations: byModel.reduce((sum, m) => sum + m.generation_count, 0),
    total_tokens: anyTotalTokens ? totalTokens : null,
  };
}
