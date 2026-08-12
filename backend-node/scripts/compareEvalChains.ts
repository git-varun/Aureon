import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { prisma } from "../src/prisma";
import type { TechnicalIndicators } from "../src/lib/marketProviders/yahoo";
import { buildAssetSnapshot } from "../src/lib/evaluation/snapshot";
import { generateFeaturesFor } from "../src/lib/evaluation/features";
import { generateAndScoreAsset } from "../src/lib/evaluation/scoring";
import { computeAssetHealthFor } from "../src/lib/evaluation/assetHealth";
import {
  cacheAssetSnapshot,
  cacheAssetFeatures,
  cacheAssetSignals,
  cacheAssetHealth,
  getCachedAssetSignals,
} from "../src/lib/evaluation/cache";

/**
 * Task 2 Step 3 dual-run comparison harness.
 *
 * For a real sample of tracked assets, runs Python's real evaluation chain
 * (process_asset_snapshot -> generate_features -> generate_signals ->
 * generate_scores -> compute_asset_health, via Celery eager execution — same
 * technique as task2-step1-report.md's live reproduction) followed
 * immediately by Node's equivalent chain for the SAME asset, and diffs every
 * numeric output field: AssetSnapshot, AssetFeatures, FeatureSnapshot,
 * AssetScore, Recommendation.confidence_score, AssetHealth.
 *
 * WHY SEQUENTIAL, NOT CONCURRENT: AssetSnapshot/AssetFeatures/AssetScore/
 * AssetHealth are all single-row-per-asset upserts, and Recommendation
 * reuses an existing active row's id — both backends write the SAME row for
 * a given asset. Running them concurrently would race those writes and
 * produce meaningless output. Running them concurrently across DIFFERENT
 * assets would be safe but isn't needed at this sample size — this harness
 * processes assets one at a time, Python-then-Node, capturing each side's
 * output immediately after it runs and before the other side overwrites it.
 *
 * WHY INDICATORS ARE PINNED (not just the `action` field the brief calls
 * out): buildAssetSnapshot derives rsi/momentum_score/volatility_score
 * directly from the live technical-indicators fetch, and every downstream
 * field (AssetFeatures, AssetScore.recommendation_score,
 * Recommendation.confidence_score) is a deterministic function of those. If
 * each side made its own independent live Yahoo call, a market-data delta
 * between the two calls (seconds apart) would contaminate every diffed
 * field, making it impossible to tell "live data moved" apart from "the
 * port has a bug". So: Python's leg runs for real (its own live fetch);
 * Node's leg reuses the EXACT indicators payload Python's run persisted to
 * AssetSnapshot.payload (real market data, just not re-fetched a second
 * time) — this isolates the comparison to the transform/scoring logic,
 * which is what this harness exists to verify. The `action` field
 * (BUY/SELL/HOLD, read from the cached market:signals:* key by
 * generate_and_score_asset/generateAndScoreAsset) is nested inside that same
 * payload, so pinning the whole indicators object pins `action` too — no
 * separate step needed.
 *
 * WHY aggregateAssetSentiment IS SKIPPED ON NODE'S LEG: both chains
 * recompute+upsert the day's rolling AssetSentimentSnapshot row immediately
 * before reading it (see task2-step1-report.md — this recency-weighted
 * aggregate shifts by a few thousandths every time it's recomputed, purely
 * from elapsed wall-clock time). Running it a second time on Node's leg
 * would reintroduce exactly the kind of un-diagnosable drift the indicator
 * pin above avoids. Node's leg instead reads the same
 * asset_sentiment_snapshots row Python's own aggregate call already wrote
 * moments earlier. Node's aggregateAssetSentiment function itself is not
 * exercised by this harness as a result — it's a real, separately portable
 * unit (see backend-node/src/lib/news/sentiment.ts) but out of scope for
 * this comparison.
 *
 * WHAT ISN'T PINNED, DELIBERATELY: LatestQuote.price (read directly, not
 * re-fetched by this chain) and AssetFundamentals (static reference data) —
 * both are already-persisted DB state shared identically by both legs
 * without any pinning needed, so no drift is possible there regardless.
 *
 * WHAT IS NOT COMPARABLE: AssetHealth.quote_age_seconds/
 * fundamentals_age_seconds/signal_age_seconds/news_age_seconds are all
 * `now - some_timestamp` computed at the moment each leg runs — Node's leg
 * always runs some seconds after Python's, so these will *always* differ by
 * roughly that elapsed time. Only AssetHealth.status (the derived
 * categorical SLA verdict) is meaningfully diffable.
 *
 * SIDE EFFECTS: this is real evaluation-chain execution against real DB
 * rows, not a dry run. Each asset processed gets 2 fresh AssetSnapshot
 * upserts (1 per leg), 2 new PriceHistory rows (buildAssetSnapshot always
 * inserts one — matches Python's real behavior, see snapshot.ts's own doc
 * comment), 2 new FeatureSnapshot rows (insert-only), and its
 * AssetScore/Recommendation/AssetHealth rows end up holding Node's leg's
 * values (the later, overwriting write) once the harness finishes. No
 * portfolio/transaction data is touched.
 *
 * Usage:
 *   cd backend-node
 *   REDIS_URL=redis://localhost:6379/0 npx tsx scripts/compareEvalChains.ts <assetId> [assetId ...]
 *
 * REDIS_URL must point at the SAME Redis instance backend/'s local dev
 * environment uses (see task2-step1-report.md — backend-node/.env's default
 * points at a stopped Docker container). DATABASE_URL is read from
 * backend-node/.env as-is (port 5433, the populated Docker aureon_postgres
 * instance) and passed through to the Python subprocess explicitly so both
 * legs are guaranteed to hit the same database regardless of backend/'s own
 * .env defaults (root cause of task2-step1-report.md's investigation).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PYTHON_DRIVER = path.join(REPO_ROOT, "backend", "scripts", "dual_run_chain_driver.py");
const PYTHON_BIN = path.join(REPO_ROOT, "backend", ".venv", "bin", "python3");

interface PyResult {
  asset_id: string;
  asset_snapshot: Record<string, unknown> | null;
  asset_features: Record<string, unknown> | null;
  feature_snapshot: { id: string; snapshot_at: string; model_version: string; feature_schema_version: string; features: Record<string, unknown> } | null;
  asset_score: Record<string, unknown> | null;
  recommendation: { id: string; recommendation_state: string; confidence_score: number; status: string; version: string } | null;
  asset_health: Array<{ provider_name: string; status: string; quote_age_seconds: number | null; fundamentals_age_seconds: number | null; signal_age_seconds: number | null; news_age_seconds: number | null }>;
  sentiment_snapshot: { snapshot_date: string; avg_sentiment_7d: number | null } | null;
  signals_cache: Record<string, unknown> | null;
}

interface NodeResult {
  asset_snapshot: Record<string, unknown> | null;
  asset_features: Record<string, unknown> | null;
  feature_snapshot: { id: string; snapshot_at: string; model_version: string; feature_schema_version: string; features: Record<string, unknown> } | null;
  asset_score: Record<string, unknown> | null;
  recommendation: { id: string; recommendation_state: string; confidence_score: number; status: string; version: string } | null;
  asset_health: { provider_name: string; status: string; quote_age_seconds: number | null; fundamentals_age_seconds: number | null; signal_age_seconds: number | null; news_age_seconds: number | null } | null;
}

function runPythonLeg(assetId: string): PyResult {
  const env = {
    ...process.env,
    REPO_ROOT,
    DATABASE_URL: "postgresql+psycopg://postgres:postgres@localhost:5433/aureon",
    REDIS_URL: process.env.REDIS_URL,
    PYTHONPATH: path.join(REPO_ROOT, "backend"),
  };
  const stdout = execFileSync(PYTHON_BIN, [PYTHON_DRIVER, assetId], { env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const line = stdout.split("\n").find((l) => l.startsWith("RESULT_JSON:"));
  if (!line) throw new Error(`Python leg produced no RESULT_JSON line for ${assetId}. Full output:\n${stdout}`);
  return JSON.parse(line.slice("RESULT_JSON:".length)) as PyResult;
}

async function runNodeLeg(assetId: string, pinnedIndicators: Partial<TechnicalIndicators>, pinnedAction: unknown): Promise<NodeResult> {
  // Reconstructed from the same lib functions processAssetSnapshot/
  // generateFeatures/generateSignals/generateScores/computeAssetHealth call
  // (backend-node/src/jobs/*.ts) — not the job wrappers themselves, since
  // they don't offer a seam to inject the indicator pin without editing
  // production code. Every function called below is the literal one the
  // real job chain calls.
  const snapshotResult = await buildAssetSnapshot(assetId, pinnedIndicators);
  await cacheAssetSnapshot(assetId, snapshotResult);

  // aggregateAssetSentiment deliberately NOT called here — see module doc
  // comment above ("WHY aggregateAssetSentiment IS SKIPPED").
  const featuresResult = await generateFeaturesFor(assetId);
  if (featuresResult) await cacheAssetFeatures(assetId, featuresResult);

  const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
  const symbol = quote?.symbol ?? null;
  const signalsDict: Record<string, unknown> = { ...pinnedIndicators, asset_id: assetId, symbol, updated_at: new Date().toISOString() };
  await cacheAssetSignals(assetId, signalsDict);

  // Readback assertion (per review): confirms the pin actually took, rather
  // than silently defaulting to "HOLD" on a dead/misconfigured Redis
  // connection (cache.ts swallows Redis errors and returns null).
  const readback = await getCachedAssetSignals<{ action?: unknown }>(assetId);
  if (readback?.action !== pinnedAction) {
    throw new Error(
      `Signals pin verification failed for ${assetId}: wrote action=${JSON.stringify(pinnedAction)}, read back action=${JSON.stringify(readback?.action)}. Check REDIS_URL points at the same Redis Python's leg used.`,
    );
  }

  const scored = await generateAndScoreAsset(assetId);
  let healthResult: NodeResult["asset_health"] = null;
  if (scored) {
    const h = await computeAssetHealthFor(assetId);
    await cacheAssetHealth(assetId, h);
    healthResult = {
      provider_name: "default",
      status: h.status,
      quote_age_seconds: h.quote_age_seconds,
      fundamentals_age_seconds: h.fundamentals_age_seconds,
      signal_age_seconds: h.signal_age_seconds,
      news_age_seconds: h.news_age_seconds,
    };
  }

  const [snap, feat, fs, score, rec] = await Promise.all([
    prisma.assetSnapshot.findUnique({ where: { assetId } }),
    prisma.asset_features.findUnique({ where: { asset_id: assetId } }),
    prisma.feature_snapshots.findFirst({ where: { asset_id: assetId }, orderBy: { snapshot_at: "desc" } }),
    prisma.assetScore.findFirst({ where: { assetId }, orderBy: { generatedAt: "desc" } }),
    prisma.recommendations.findFirst({ where: { asset_id: assetId, status: "active" }, orderBy: { updated_at: "desc" } }),
  ]);

  return {
    asset_snapshot: snap && {
      price: snap.price != null ? Number(snap.price) : null,
      market_cap: snap.marketCap != null ? Number(snap.marketCap) : null,
      pe_ratio: snap.peRatio != null ? Number(snap.peRatio) : null,
      rsi: snap.rsi != null ? Number(snap.rsi) : null,
      momentum_score: snap.momentumScore != null ? Number(snap.momentumScore) : null,
      volatility_score: snap.volatilityScore != null ? Number(snap.volatilityScore) : null,
      sentiment_score: snap.sentimentScore != null ? Number(snap.sentimentScore) : null,
      payload: snap.payload,
    },
    asset_features: feat && {
      price: feat.price != null ? Number(feat.price) : null,
      market_cap: feat.market_cap != null ? Number(feat.market_cap) : null,
      momentum_score: feat.momentum_score != null ? Number(feat.momentum_score) : null,
      volatility_score: feat.volatility_score != null ? Number(feat.volatility_score) : null,
      sentiment_score: feat.sentiment_score != null ? Number(feat.sentiment_score) : null,
    },
    feature_snapshot: fs && {
      id: fs.id,
      snapshot_at: fs.snapshot_at.toISOString(),
      model_version: fs.model_version,
      feature_schema_version: fs.feature_schema_version,
      features: fs.features as Record<string, unknown>,
    },
    asset_score: score && {
      model_version: score.modelVersion,
      recommendation_score: score.recommendationScore != null ? Number(score.recommendationScore) : null,
      quality_score: score.qualityScore != null ? Number(score.qualityScore) : null,
      valuation_score: score.valuationScore != null ? Number(score.valuationScore) : null,
      unavailable_inputs: score.unavailableInputs,
    },
    recommendation: rec && {
      id: rec.id,
      recommendation_state: rec.recommendation_state,
      confidence_score: Number(rec.confidence_score),
      status: rec.status,
      version: rec.version,
    },
    asset_health: healthResult,
  };
}

type DiffCategory = "MATCH" | "FLOAT_DRIFT" | "DISCREPANCY" | "NOT_COMPARABLE" | "NOT_EXERCISED";

interface DiffRow {
  field: string;
  python: unknown;
  node: unknown;
  category: DiffCategory;
}

const FLOAT_ABS_TOL = 1e-6;

function diffField(field: string, py: unknown, nd: unknown): DiffRow {
  if (py === null && nd === null) return { field, python: py, node: nd, category: "NOT_EXERCISED" };
  if (typeof py === "number" && typeof nd === "number") {
    const diff = Math.abs(py - nd);
    if (diff === 0) return { field, python: py, node: nd, category: "MATCH" };
    if (diff <= FLOAT_ABS_TOL) return { field, python: py, node: nd, category: "FLOAT_DRIFT" };
    return { field, python: py, node: nd, category: "DISCREPANCY" };
  }
  if (JSON.stringify(py) === JSON.stringify(nd)) return { field, python: py, node: nd, category: "MATCH" };
  return { field, python: py, node: nd, category: "DISCREPANCY" };
}

function diffAsset(assetId: string, symbol: string, assetClass: string, py: PyResult, nd: NodeResult): DiffRow[] {
  const rows: DiffRow[] = [];
  const prefix = `${symbol} (${assetClass})`;

  for (const f of ["price", "market_cap", "pe_ratio", "rsi", "momentum_score", "volatility_score", "sentiment_score"] as const) {
    rows.push(diffField(`${prefix} AssetSnapshot.${f}`, py.asset_snapshot?.[f] ?? null, nd.asset_snapshot?.[f] ?? null));
  }
  for (const f of ["price", "market_cap", "momentum_score", "volatility_score", "sentiment_score"] as const) {
    rows.push(diffField(`${prefix} AssetFeatures.${f}`, py.asset_features?.[f] ?? null, nd.asset_features?.[f] ?? null));
  }
  for (const f of ["price", "market_cap", "momentum_score", "volatility_score", "sentiment_score"] as const) {
    const pyFeat = py.feature_snapshot?.features as Record<string, unknown> | undefined;
    const ndFeat = nd.feature_snapshot?.features as Record<string, unknown> | undefined;
    rows.push(diffField(`${prefix} FeatureSnapshot.features.${f}`, pyFeat?.[f] ?? null, ndFeat?.[f] ?? null));
  }
  for (const f of ["recommendation_score", "quality_score", "valuation_score"] as const) {
    rows.push(diffField(`${prefix} AssetScore.${f}`, py.asset_score?.[f] ?? null, nd.asset_score?.[f] ?? null));
  }
  rows.push(diffField(`${prefix} AssetScore.unavailable_inputs`, py.asset_score?.unavailable_inputs ?? null, nd.asset_score?.unavailable_inputs ?? null));

  rows.push(diffField(`${prefix} Recommendation.confidence_score`, py.recommendation?.confidence_score ?? null, nd.recommendation?.confidence_score ?? null));
  rows.push(diffField(`${prefix} Recommendation.recommendation_state`, py.recommendation?.recommendation_state ?? null, nd.recommendation?.recommendation_state ?? null));
  // Not a wall-clock field like the AssetHealth age fields below — Python's
  // leg commits its recommendation row before Node's leg's `existingRec`
  // lookup ever runs, so when both sides have a recommendation, their ids
  // SHOULD be directly comparable and SHOULD match if Node correctly reused
  // Python's row (scoreAndMaterialize's existingRec lookup) instead of
  // creating a duplicate. A real id mismatch here is a genuine regression
  // (Node failing to reuse the existing recommendation), so it must land in
  // DISCREPANCY, not get filed as informational alongside the genuinely
  // time-dependent AssetHealth age fields.
  rows.push({
    field: `${prefix} Recommendation.id_reused`,
    python: py.recommendation?.id ?? null,
    node: nd.recommendation?.id ?? null,
    category:
      py.recommendation?.id && nd.recommendation?.id
        ? py.recommendation.id === nd.recommendation.id
          ? "MATCH"
          : "DISCREPANCY"
        : "NOT_EXERCISED",
  });

  const pyHealth = py.asset_health.find((h) => h.provider_name === "default") ?? null;
  rows.push(diffField(`${prefix} AssetHealth.status`, pyHealth?.status ?? null, nd.asset_health?.status ?? null));
  for (const f of ["quote_age_seconds", "fundamentals_age_seconds", "signal_age_seconds", "news_age_seconds"] as const) {
    rows.push({ field: `${prefix} AssetHealth.${f}`, python: pyHealth?.[f] ?? null, node: nd.asset_health?.[f] ?? null, category: "NOT_COMPARABLE" });
  }

  return rows;
}

async function main() {
  const assetIds = process.argv.slice(2);
  if (assetIds.length === 0) {
    console.error("Usage: tsx scripts/compareEvalChains.ts <assetId> [assetId ...]");
    process.exit(1);
  }
  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL must be set explicitly (see module doc comment) — refusing to run with an unverified Redis target.");
    process.exit(1);
  }

  const allRows: DiffRow[] = [];

  for (const assetId of assetIds) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      console.error(`Asset ${assetId} not found, skipping.`);
      continue;
    }
    console.log(`\n=== ${asset.symbol} (${asset.assetClass}) — ${assetId} ===`);

    console.log("Running Python leg (real process_asset_snapshot chain, Celery eager)...");
    const py = runPythonLeg(assetId);
    console.log(`  Python action=${(py.signals_cache?.action as string) ?? "N/A"} rec_state=${py.recommendation?.recommendation_state ?? "N/A"} confidence=${py.recommendation?.confidence_score ?? "N/A"}`);

    console.log("Running Node leg (pinned indicators from Python's payload)...");
    const pinnedIndicators = (py.asset_snapshot?.payload ?? {}) as Partial<TechnicalIndicators>;
    const nd = await runNodeLeg(assetId, pinnedIndicators, py.signals_cache?.action ?? null);
    console.log(`  Node   rec_state=${nd.recommendation?.recommendation_state ?? "N/A"} confidence=${nd.recommendation?.confidence_score ?? "N/A"}`);

    allRows.push(...diffAsset(assetId, asset.symbol, asset.assetClass, py, nd));
  }

  const byCategory: Record<DiffCategory, DiffRow[]> = { MATCH: [], FLOAT_DRIFT: [], DISCREPANCY: [], NOT_COMPARABLE: [], NOT_EXERCISED: [] };
  for (const row of allRows) byCategory[row.category].push(row);

  console.log("\n\n========== SUMMARY ==========");
  console.log(`MATCH: ${byCategory.MATCH.length}`);
  console.log(`FLOAT_DRIFT (<= ${FLOAT_ABS_TOL}): ${byCategory.FLOAT_DRIFT.length}`);
  console.log(`NOT_EXERCISED (both null): ${byCategory.NOT_EXERCISED.length}`);
  console.log(`NOT_COMPARABLE (wall-clock/id fields, informational): ${byCategory.NOT_COMPARABLE.length}`);
  console.log(`DISCREPANCY: ${byCategory.DISCREPANCY.length}`);

  if (byCategory.DISCREPANCY.length > 0) {
    console.log("\n--- DISCREPANCIES ---");
    for (const row of byCategory.DISCREPANCY) {
      console.log(`${row.field}: python=${JSON.stringify(row.python)} node=${JSON.stringify(row.node)}`);
    }
  }

  if (byCategory.FLOAT_DRIFT.length > 0) {
    console.log("\n--- FLOAT DRIFT ---");
    for (const row of byCategory.FLOAT_DRIFT) {
      console.log(`${row.field}: python=${JSON.stringify(row.python)} node=${JSON.stringify(row.node)}`);
    }
  }

  console.log("\n--- NOT_COMPARABLE (for reference) ---");
  for (const row of byCategory.NOT_COMPARABLE) {
    console.log(`${row.field}: python=${JSON.stringify(row.python)} node=${JSON.stringify(row.node)}`);
  }

  await prisma.$disconnect();
  // Force exit rather than letting the event loop drain naturally — the
  // shared ioredis client constructed at cache.ts's module load time (and
  // reused by every cache* call above) has no explicit close call available
  // to this script, and otherwise keeps the process alive indefinitely.
  process.exit(byCategory.DISCREPANCY.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
