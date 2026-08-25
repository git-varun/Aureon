# Wave G: MF Price History Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill full historical NAV data for held mutual funds (via mfapi.in, not AMFI's unscrapeable history page), resolve ISIN for held slug-only MFs where an exact scheme-name match exists, and manually verify the app's existing FX mechanism is accurate — no FX code changes ship in this wave.

**Architecture:** A new `mfapi.ts` provider client (mirrors the existing `amfi.ts` pattern: plain `fetch`, throws `ProviderError` on failure) backs a new manually-triggered job, `backfillMutualFundNavHistory`, that mirrors the existing `seedPriceHistory` job's shape (list assets → per-asset provider call → bulk-insert `PriceHistory` rows, warn-and-continue on a per-asset failure). A small pure-function matcher (`mfSchemeMatch.ts`) enforces an exact-match-only policy so no fuzzy-matched fund identity is ever silently trusted. FX gets no new code — its task is a manual verification pass.

**Tech Stack:** TypeScript, Prisma, vitest (real Postgres `aureon_test` DB via `testPrisma`), Bun runtime (global `fetch`).

**Spec:** `docs/superpowers/specs/2026-08-24-wave-g-mf-history-fx-design.md`

## Global Constraints

- Only ISIN-symbol MFs (`{ISIN}_MF`, ISIN starting `INF`) get exact ISIN matching; only slug-only MFs get name search, and only an **exact** normalized-name match is auto-accepted — anything less is logged as "needs manual review," never applied.
- Never rewrite `Asset.symbol` — `LatestQuote` is keyed by symbol as its id; a live rename would orphan the current-quote row. Resolved identity goes into `Asset.metadata` only.
- Only **held** mutual fund assets are processed (same held-ness definition as the existing `isSymbolHeld`: a `Position` row exists for that symbol — no quantity-sign filtering, matching that precedent).
- No new DB table/migration. No BullMQ repeatable schedule (this is a manual/one-time bulk job, same category as `seed_tracked_universes`).
- No FX code changes in this wave (spec §3) — the FX task is a manual verification, not automated tests.

---

## File Structure

- `src/lib/marketProviders/mfapi.ts` (new) — mfapi.in client: `getSchemeList()`, `getSchemeHistory(schemeCode)`, `searchSchemesByName(name)`.
- `src/lib/marketProviders/mfapi.test.ts` (new) — parsing/error-path unit tests, `fetch` mocked.
- `src/lib/jobs/mfSchemeMatch.ts` (new) — pure functions: `matchIsinToSchemeCode`, `matchNameToSchemeCode`.
- `src/lib/jobs/mfSchemeMatch.test.ts` (new) — unit tests, including a case that must NOT auto-match.
- `src/lib/jobs/ingestionRepo.ts` (modify) — add `listHeldMutualFundAssets()`.
- `src/jobs/backfillMutualFundNavHistory.ts` (new) — the job itself.
- `src/jobs/backfillMutualFundNavHistory.test.ts` (new) — integration test against `testPrisma` with real fixtures, `fetch` mocked.
- `src/lib/settings/jobDefaults.ts` (modify) — register `backfill_mutual_fund_nav_history` in `DEFAULT_JOBS` (disabled by default, same as `seed_tracked_universes`).
- `src/lib/settings/jobDispatch.ts` (modify) — register the runner in `JOB_RUNNERS`.
- `scripts/triggerBackfillMutualFundNavHistory.ts` (new) — manual trigger script, mirrors `scripts/triggerRefreshMutualFundNavs.ts`.

---

### Task 1: mfapi.in provider client

**Files:**
- Create: `src/lib/marketProviders/mfapi.ts`
- Test: `src/lib/marketProviders/mfapi.test.ts`

**Interfaces:**
- Produces:
  - `interface MfapiSchemeListEntry { schemeCode: number; schemeName: string; isinGrowth: string | null; isinDivReinvestment: string | null }`
  - `interface MfapiHistoryPoint { date: Date; nav: number }`
  - `getSchemeList(): Promise<MfapiSchemeListEntry[]>`
  - `getSchemeHistory(schemeCode: number): Promise<MfapiHistoryPoint[]>` — oldest-to-newest, mfapi.in's `DD-MM-YYYY` dates parsed to UTC `Date`s.
  - `searchSchemesByName(name: string): Promise<Array<{ schemeCode: number; schemeName: string }>>`
  - All three throw `ProviderError` (from `../errors`) on a non-OK response or network failure.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/marketProviders/mfapi.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSchemeList, getSchemeHistory, searchSchemesByName } from "./mfapi";
import { ProviderError } from "../errors";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("mfapi.ts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSchemeList maps the raw list shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { schemeCode: 100027, schemeName: "Fund A", isinGrowth: "INF001A01001", isinDivReinvestment: null },
          { schemeCode: 100028, schemeName: "Fund B", isinGrowth: null, isinDivReinvestment: null },
        ]),
      ),
    );

    const list = await getSchemeList();
    expect(list).toEqual([
      { schemeCode: 100027, schemeName: "Fund A", isinGrowth: "INF001A01001", isinDivReinvestment: null },
      { schemeCode: 100028, schemeName: "Fund B", isinGrowth: null, isinDivReinvestment: null },
    ]);
  });

  it("getSchemeList throws ProviderError on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([], false, 500)));
    await expect(getSchemeList()).rejects.toThrow(ProviderError);
  });

  it("getSchemeHistory parses DD-MM-YYYY dates, reverses to oldest-first, and drops non-numeric NAVs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          meta: { scheme_code: 119551 },
          data: [
            { date: "21-08-2026", nav: "106.88210" },
            { date: "20-08-2026", nav: "N.A." },
            { date: "19-08-2026", nav: "107.16830" },
          ],
        }),
      ),
    );

    const history = await getSchemeHistory(119551);
    expect(history).toEqual([
      { date: new Date(Date.UTC(2026, 7, 19)), nav: 107.1683 },
      { date: new Date(Date.UTC(2026, 7, 21)), nav: 106.8821 },
    ]);
  });

  it("searchSchemesByName returns the raw match list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ schemeCode: 108273, schemeName: "Aditya Birla Sun Life Banking & PSU Debt Fund - Regular Plan - GROWTH" }])),
    );

    const results = await searchSchemesByName("Aditya Birla Sun Life Banking");
    expect(results).toEqual([{ schemeCode: 108273, schemeName: "Aditya Birla Sun Life Banking & PSU Debt Fund - Regular Plan - GROWTH" }]);
  });

  it("searchSchemesByName throws ProviderError on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(searchSchemesByName("anything")).rejects.toThrow(ProviderError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/marketProviders/mfapi.test.ts`
Expected: FAIL — `mfapi.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Implement the provider client**

```typescript
// src/lib/marketProviders/mfapi.ts
import { ProviderError } from "../errors";

const MFAPI_BASE = "https://api.mfapi.in/mf";

export interface MfapiSchemeListEntry {
  schemeCode: number;
  schemeName: string;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
}

export interface MfapiHistoryPoint {
  date: Date;
  nav: number;
}

function parseDdMmYyyy(s: string): Date {
  const [dd, mm, yyyy] = s.split("-").map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

/** Full scheme list (~5.7MB) from the community-run mfapi.in (sourced from
 * AMFI data) — used to match a held MF's ISIN to a scheme code. AMFI's own
 * per-scheme history page (DownloadNAVHistoryReport_Po.aspx) was live-checked
 * during design and returns an empty JS-driven frameset with no data, so
 * mfapi.in is used instead (the existing refreshMutualFundNavs job already
 * tags LatestQuote.provider as "mfapi", suggesting this was anticipated).
 * Fetched fresh per call — no persistent cache, since callers are
 * manually-triggered/infrequent jobs, not a hot path. */
export async function getSchemeList(): Promise<MfapiSchemeListEntry[]> {
  try {
    const res = await fetch(MFAPI_BASE, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Array<{
      schemeCode: number;
      schemeName: string;
      isinGrowth: string | null;
      isinDivReinvestment: string | null;
    }>;
    return raw.map((r) => ({
      schemeCode: r.schemeCode,
      schemeName: r.schemeName,
      isinGrowth: r.isinGrowth,
      isinDivReinvestment: r.isinDivReinvestment,
    }));
  } catch (e) {
    throw new ProviderError(`mfapi.in scheme list fetch failed: ${(e as Error).message}`);
  }
}

/** Full daily NAV history for one scheme code, oldest-to-newest (mfapi.in
 * returns newest-first). */
export async function getSchemeHistory(schemeCode: number): Promise<MfapiHistoryPoint[]> {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data: Array<{ date: string; nav: string }> };
    return body.data
      .map((d) => ({ date: parseDdMmYyyy(d.date), nav: Number(d.nav) }))
      .filter((p) => !Number.isNaN(p.nav))
      .reverse();
  } catch (e) {
    throw new ProviderError(`mfapi.in history fetch failed for scheme ${schemeCode}: ${(e as Error).message}`);
  }
}

/** Server-side name search — used only to resolve slug-only (no-ISIN) held
 * MFs. Results are NOT auto-trusted; callers apply an exact-match policy
 * (see mfSchemeMatch.ts). */
export async function searchSchemesByName(name: string): Promise<Array<{ schemeCode: number; schemeName: string }>> {
  try {
    const res = await fetch(`${MFAPI_BASE}/search?q=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Array<{ schemeCode: number; schemeName: string }>;
  } catch (e) {
    throw new ProviderError(`mfapi.in search failed for "${name}": ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/marketProviders/mfapi.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketProviders/mfapi.ts src/lib/marketProviders/mfapi.test.ts
git commit -m "feat: add mfapi.in provider client for MF scheme lookup and history"
```

---

### Task 2: Exact-match-only scheme matcher

**Files:**
- Create: `src/lib/jobs/mfSchemeMatch.ts`
- Test: `src/lib/jobs/mfSchemeMatch.test.ts`

**Interfaces:**
- Consumes: `MfapiSchemeListEntry` from Task 1 (`../marketProviders/mfapi`).
- Produces:
  - `matchIsinToSchemeCode(isin: string, schemeList: MfapiSchemeListEntry[]): number | null`
  - `matchNameToSchemeCode(displayName: string, searchResults: Array<{ schemeCode: number; schemeName: string }>): number | null`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/jobs/mfSchemeMatch.test.ts
import { describe, it, expect } from "vitest";
import { matchIsinToSchemeCode, matchNameToSchemeCode } from "./mfSchemeMatch";
import type { MfapiSchemeListEntry } from "../marketProviders/mfapi";

const schemeList: MfapiSchemeListEntry[] = [
  { schemeCode: 100027, schemeName: "Fund A - Growth", isinGrowth: "INF001A01001", isinDivReinvestment: null },
  { schemeCode: 100028, schemeName: "Fund B - Reinvestment", isinGrowth: null, isinDivReinvestment: "INF002B02002" },
];

describe("matchIsinToSchemeCode", () => {
  it("matches against isinGrowth, case/format-insensitive", () => {
    expect(matchIsinToSchemeCode("inf001a01001", schemeList)).toBe(100027);
  });

  it("matches against isinDivReinvestment", () => {
    expect(matchIsinToSchemeCode("INF002B02002", schemeList)).toBe(100028);
  });

  it("returns null when no scheme has that ISIN", () => {
    expect(matchIsinToSchemeCode("INF999Z99999", schemeList)).toBeNull();
  });
});

describe("matchNameToSchemeCode", () => {
  it("auto-accepts a single exact normalized-name match", () => {
    const results = [{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Direct - Growth" }];
    expect(matchNameToSchemeCode("PARAG PARIKH FLEXI CAP FUND - DIRECT - GROWTH", results)).toBe(108273);
  });

  it("does NOT auto-match a close-but-not-exact name (must not silently attach the wrong fund's history)", () => {
    const results = [{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Direct - Growth" }];
    expect(matchNameToSchemeCode("Parag Parikh Flexi Cap Fund - Regular - Growth", results)).toBeNull();
  });

  it("does NOT auto-match when two results normalize to the same exact name (ambiguous)", () => {
    const results = [
      { schemeCode: 1, schemeName: "Fund X Growth" },
      { schemeCode: 2, schemeName: "Fund X Growth" },
    ];
    expect(matchNameToSchemeCode("Fund X Growth", results)).toBeNull();
  });

  it("returns null on an empty result set", () => {
    expect(matchNameToSchemeCode("Anything", [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/jobs/mfSchemeMatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the matcher**

```typescript
// src/lib/jobs/mfSchemeMatch.ts
import type { MfapiSchemeListEntry } from "../marketProviders/mfapi";

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Exact ISIN match against mfapi.in's isinGrowth/isinDivReinvestment
 * columns. No fuzzy fallback — an ISIN is either right or it isn't. */
export function matchIsinToSchemeCode(isin: string, schemeList: MfapiSchemeListEntry[]): number | null {
  const target = normalize(isin);
  for (const entry of schemeList) {
    if (entry.isinGrowth && normalize(entry.isinGrowth) === target) return entry.schemeCode;
    if (entry.isinDivReinvestment && normalize(entry.isinDivReinvestment) === target) return entry.schemeCode;
  }
  return null;
}

/** Auto-accept policy for name-based resolution: only a single exact match
 * (after normalizing both sides the same way mfSymbol() does) is trusted.
 * A wrong fuzzy match would silently attach one fund's price history to a
 * different fund, so anything short of exactly-one-exact-match returns
 * null — the caller logs that as "needs manual review," never auto-applies
 * it. */
export function matchNameToSchemeCode(
  displayName: string,
  searchResults: Array<{ schemeCode: number; schemeName: string }>,
): number | null {
  const target = normalize(displayName);
  const exact = searchResults.filter((r) => normalize(r.schemeName) === target);
  return exact.length === 1 ? exact[0].schemeCode : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/jobs/mfSchemeMatch.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/mfSchemeMatch.ts src/lib/jobs/mfSchemeMatch.test.ts
git commit -m "feat: add exact-match-only MF scheme matcher"
```

---

### Task 3: `listHeldMutualFundAssets` repo helper + backfill job

**Files:**
- Modify: `src/lib/jobs/ingestionRepo.ts` (add helper, after `listMutualFundAssetsWithQuotes`, around line 211)
- Create: `src/jobs/backfillMutualFundNavHistory.ts`
- Test: `src/jobs/backfillMutualFundNavHistory.test.ts`

**Interfaces:**
- Consumes: `getSchemeList`, `getSchemeHistory`, `searchSchemesByName` (Task 1); `matchIsinToSchemeCode`, `matchNameToSchemeCode` (Task 2); `bulkInsertPriceHistory`, `type PriceHistoryRow` (existing, `ingestionRepo.ts`); `wrapJobExecution`, `skipIfDisabled` (existing, `wrapJobExecution.ts`).
- Produces:
  - `listHeldMutualFundAssets(): Promise<Array<{ id: string; symbol: string; name: string; metadata: Record<string, unknown> | null }>>`
  - `backfillMutualFundNavHistoryTask(logId?: number | null): Promise<void>` — the job's `wrapJobExecution` entrypoint, same shape as every other job in this file (e.g. `refreshMutualFundNavsTask`).

- [ ] **Step 1: Write the failing repo-helper addition (no test yet — covered by Task 3's integration test below)**

Add to `src/lib/jobs/ingestionRepo.ts`, directly after `listMutualFundAssetsWithQuotes` (after line 211):

```typescript
/** (asset_id, symbol, name, metadata) for every mutual_fund asset actually
 * held in at least one portfolio position — same held-ness definition as
 * isSymbolHeld (a Position row exists for that symbol, no quantity-sign
 * filtering). Used by backfillMutualFundNavHistory so a one-time backfill
 * never wastes mfapi.in calls on Asset rows nobody holds. */
export async function listHeldMutualFundAssets(): Promise<
  Array<{ id: string; symbol: string; name: string; metadata: Record<string, unknown> | null }>
> {
  const positions = await prisma.position.findMany({ select: { symbol: true }, distinct: ["symbol"] });
  const heldSymbols = positions.map((p) => p.symbol);
  if (heldSymbols.length === 0) return [];

  const assets = await prisma.asset.findMany({
    where: { assetClass: "mutual_fund", symbol: { in: heldSymbols } },
    select: { id: true, symbol: true, name: true, metadata: true },
  });
  return assets.map((a) => ({ id: a.id, symbol: a.symbol, name: a.name, metadata: (a.metadata as Record<string, unknown> | null) ?? null }));
}
```

- [ ] **Step 2: Write the failing integration test for the job**

```typescript
// src/jobs/backfillMutualFundNavHistory.test.ts
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { backfillMutualFundNavHistoryTask } from "./backfillMutualFundNavHistory";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("backfillMutualFundNavHistoryTask", () => {
  let portfolioId: string;
  let isinAssetId: string;
  let slugAssetId: string;
  const isinSymbol = "INF001A01001_MF";
  const slugSymbol = "SOME_UNRESOLVED_FUND_MF";

  beforeEach(async () => {
    portfolioId = uuidv4();
    await testPrisma.portfolio.create({
      data: { id: portfolioId, name: "test-portfolio", createdAt: new Date(), updatedAt: new Date() },
    });

    isinAssetId = uuidv4();
    await testPrisma.asset.create({
      data: {
        id: isinAssetId,
        symbol: isinSymbol,
        name: "Fund A - Growth",
        assetClass: "mutual_fund",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    slugAssetId = uuidv4();
    await testPrisma.asset.create({
      data: {
        id: slugAssetId,
        symbol: slugSymbol,
        name: "Parag Parikh Flexi Cap Fund - Direct - Growth",
        assetClass: "mutual_fund",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await testPrisma.position.createMany({
      data: [
        {
          id: uuidv4(),
          portfolioId,
          symbol: isinSymbol,
          assetId: isinAssetId,
          quantity: 10,
          avgBuyPrice: 100,
          wallet: "default",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          portfolioId,
          symbol: slugSymbol,
          assetId: slugAssetId,
          quantity: 5,
          avgBuyPrice: 50,
          wallet: "default",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://api.mfapi.in/mf") {
          return jsonResponse([
            { schemeCode: 100027, schemeName: "Fund A - Growth", isinGrowth: "INF001A01001", isinDivReinvestment: null },
          ]);
        }
        if (url === "https://api.mfapi.in/mf/100027") {
          return jsonResponse({
            meta: { scheme_code: 100027 },
            data: [
              { date: "20-08-2026", nav: "10.5000" },
              { date: "21-08-2026", nav: "10.6000" },
            ],
          });
        }
        if (url.startsWith("https://api.mfapi.in/mf/search")) {
          return jsonResponse([{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Regular - Growth" }]);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await testPrisma.priceHistory.deleteMany({ where: { assetId: { in: [isinAssetId, slugAssetId] } } });
    await testPrisma.position.deleteMany({ where: { portfolioId } });
    await testPrisma.asset.deleteMany({ where: { id: { in: [isinAssetId, slugAssetId] } } });
    await testPrisma.portfolio.delete({ where: { id: portfolioId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("backfills history for the ISIN-matched fund and leaves the unresolvable slug fund untouched", async () => {
    await backfillMutualFundNavHistoryTask();

    const isinHistory = await testPrisma.priceHistory.findMany({ where: { assetId: isinAssetId }, orderBy: { timestamp: "asc" } });
    expect(isinHistory).toHaveLength(2);
    expect(Number(isinHistory[0].price)).toBe(10.5);
    expect(Number(isinHistory[1].price)).toBe(10.6);

    const slugHistory = await testPrisma.priceHistory.findMany({ where: { assetId: slugAssetId } });
    expect(slugHistory).toHaveLength(0);

    // "Fund A - Growth" vs "Fund A - Growth" is exact, but this fund's
    // symbol is already ISIN-based so no metadata write should happen from
    // the name-search path.
    const slugAsset = await testPrisma.asset.findUniqueOrThrow({ where: { id: slugAssetId } });
    expect(slugAsset.metadata).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bunx vitest run src/jobs/backfillMutualFundNavHistory.test.ts`
Expected: FAIL — `backfillMutualFundNavHistory.ts` doesn't exist yet.

- [ ] **Step 4: Implement the job**

```typescript
// src/jobs/backfillMutualFundNavHistory.ts
import { v5 as uuidv5 } from "uuid";
import { prisma } from "../prisma";
import { Prisma } from "../generated/prisma";
import { ProviderError } from "../lib/errors";
import { getSchemeList, getSchemeHistory, searchSchemesByName, type MfapiSchemeListEntry } from "../lib/marketProviders/mfapi";
import { matchIsinToSchemeCode, matchNameToSchemeCode } from "../lib/jobs/mfSchemeMatch";
import { listHeldMutualFundAssets, bulkInsertPriceHistory, type PriceHistoryRow } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

type HeldMfAsset = { id: string; symbol: string; name: string; metadata: Record<string, unknown> | null };

interface ResolveResult {
  schemeCode: number | null;
  needsReview: boolean;
}

/** Resolves one held MF asset to an mfapi.in scheme code. ISIN-symbol assets
 * (`{ISIN}_MF` where the ISIN starts "INF") get an exact ISIN match against
 * the scheme list. Slug-only assets get a name search, but only a single
 * exact normalized-name match is auto-accepted; on a match, the resolved
 * scheme code + ISIN are stored in Asset.metadata (never in Asset.symbol —
 * see Global Constraints). */
async function resolveSchemeCode(asset: HeldMfAsset, schemeList: MfapiSchemeListEntry[]): Promise<ResolveResult> {
  const rawIsin = asset.symbol.endsWith("_MF") ? asset.symbol.slice(0, -3) : "";
  if (rawIsin.startsWith("INF")) {
    return { schemeCode: matchIsinToSchemeCode(rawIsin, schemeList), needsReview: false };
  }

  const results = await searchSchemesByName(asset.name);
  const schemeCode = matchNameToSchemeCode(asset.name, results);
  if (schemeCode !== null) {
    const matchedEntry = schemeList.find((e) => e.schemeCode === schemeCode);
    const payload: Record<string, unknown> = {
      ...(asset.metadata ?? {}),
      amfiSchemeCode: schemeCode,
      ...(matchedEntry?.isinGrowth ? { isin: matchedEntry.isinGrowth } : {}),
    };
    await prisma.asset.update({ where: { id: asset.id }, data: { metadata: payload as Prisma.InputJsonValue } });
  }
  return { schemeCode, needsReview: schemeCode === null && results.length > 0 };
}

async function backfillMutualFundNavHistory(): Promise<{ resolved: number; needsReview: number; unmatched: number; totalRows: number }> {
  const assets = await listHeldMutualFundAssets();
  if (assets.length === 0) {
    logger.info({ job: "backfill_mutual_fund_nav_history" }, "no held mutual fund positions found");
    return { resolved: 0, needsReview: 0, unmatched: 0, totalRows: 0 };
  }

  const schemeList = await getSchemeList();

  let resolved = 0;
  let needsReview = 0;
  let unmatched = 0;
  let totalRows = 0;

  for (const asset of assets) {
    let schemeCode: number | null;
    try {
      const result = await resolveSchemeCode(asset, schemeList);
      schemeCode = result.schemeCode;
      if (schemeCode === null) {
        if (result.needsReview) {
          needsReview += 1;
          logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol }, "no exact scheme-name match — needs manual review");
        } else {
          unmatched += 1;
        }
        continue;
      }
    } catch (e) {
      logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, err: e }, "scheme resolution failed");
      unmatched += 1;
      continue;
    }

    try {
      const history = await getSchemeHistory(schemeCode);
      const rows: PriceHistoryRow[] = history.map((p) => ({
        id: uuidv5(`${asset.symbol}-${p.date.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId: asset.id,
        symbol: asset.symbol,
        price: p.nav,
        volume: null,
        timestamp: p.date,
      }));
      await bulkInsertPriceHistory(rows);
      resolved += 1;
      totalRows += rows.length;
      logger.info({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, rows: rows.length }, "history backfilled");
    } catch (e) {
      logger.warn({ job: "backfill_mutual_fund_nav_history", symbol: asset.symbol, err: e }, "history fetch failed");
      unmatched += 1;
    }
  }

  logger.info(
    { job: "backfill_mutual_fund_nav_history", resolved, needsReview, unmatched, totalRows, total: assets.length },
    "completed",
  );

  if (resolved === 0) {
    throw new ProviderError("backfill_mutual_fund_nav_history: no held mutual fund resolved to an mfapi.in scheme");
  }

  return { resolved, needsReview, unmatched, totalRows };
}

/** Manual/one-time-backfill entrypoint, same shape as seedPriceHistoryTask —
 * no BullMQ repeatable schedule is registered for this job. */
export async function backfillMutualFundNavHistoryTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("backfill_mutual_fund_nav_history", logId)) return;
  await wrapJobExecution("backfill_mutual_fund_nav_history", logId, backfillMutualFundNavHistory);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/jobs/backfillMutualFundNavHistory.test.ts`
Expected: PASS (1 test). If it fails on `skipIfDisabled` because no `JobConfig` row exists for `backfill_mutual_fund_nav_history` yet: that's expected to still pass, since `skipIfDisabled` treats a missing `JobConfig` row as "not disabled" (`job !== null && !job.enabled`) — Task 4 adds the row anyway, so re-run after Task 4 if this step surprises you.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs/ingestionRepo.ts src/jobs/backfillMutualFundNavHistory.ts src/jobs/backfillMutualFundNavHistory.test.ts
git commit -m "feat: add MF NAV history backfill job"
```

---

### Task 4: Wire into job config, dispatch, and manual trigger script

**Files:**
- Modify: `src/lib/settings/jobDefaults.ts` (add one `DEFAULT_JOBS` entry)
- Modify: `src/lib/settings/jobDispatch.ts` (add import + `JOB_RUNNERS` entry)
- Create: `scripts/triggerBackfillMutualFundNavHistory.ts`

**Interfaces:**
- Consumes: `backfillMutualFundNavHistoryTask` from Task 3 (`../../jobs/backfillMutualFundNavHistory` relative to `jobDispatch.ts`; `../src/jobs/backfillMutualFundNavHistory` relative to the trigger script).

- [ ] **Step 1: Register the job as a manual, off-by-default entry**

In `src/lib/settings/jobDefaults.ts`, add to `DEFAULT_JOBS` (after the `seed_tracked_universes` entry, keeping the existing "rare/manual bulk operation" comment grouping):

```typescript
  { jobName: "seed_tracked_universes", enabled: false, jobTier: "user" },
  { jobName: "backfill_mutual_fund_nav_history", enabled: false, jobTier: "user" },
```

- [ ] **Step 2: Register the runner**

In `src/lib/settings/jobDispatch.ts`, add the import near the other job imports:

```typescript
import { backfillMutualFundNavHistoryTask } from "../../jobs/backfillMutualFundNavHistory";
```

And add to `JOB_RUNNERS` (after the `seed_tracked_universes` line):

```typescript
  seed_tracked_universes: seedTrackedUniversesTask,
  backfill_mutual_fund_nav_history: backfillMutualFundNavHistoryTask,
```

- [ ] **Step 3: Add the manual trigger script**

```typescript
// scripts/triggerBackfillMutualFundNavHistory.ts
import "dotenv/config";
import { backfillMutualFundNavHistoryTask } from "../src/jobs/backfillMutualFundNavHistory";
import { prisma } from "../src/prisma";

backfillMutualFundNavHistoryTask()
  .then(async () => {
    console.log("backfill_mutual_fund_nav_history: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("backfill_mutual_fund_nav_history failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Verify the full suite still passes**

Run: `bun run test`
Expected: PASS — no existing test asserts the exact contents of `DEFAULT_JOBS`/`JOB_RUNNERS`, so this is a additive, non-breaking change; confirm no test fails.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings/jobDefaults.ts src/lib/settings/jobDispatch.ts scripts/triggerBackfillMutualFundNavHistory.ts
git commit -m "feat: wire MF NAV history backfill into job config and manual dispatch"
```

---

### Task 5: Live verification (manual — MF history + FX cross-check)

No new code in this task. This is the spec's §"Live-verify" requirement — run it after Task 4 lands, using this repo's real dev database (not `aureon_test`) and a real held mutual fund.

**MF history:**

- [ ] **Step 1: Run the backfill against the real dev DB**

```bash
cd backend
bunx tsx scripts/triggerBackfillMutualFundNavHistory.ts
```

Confirm the log output reports `resolved > 0` for at least one real held mutual fund, and note any `needsReview`/`unmatched` counts.

- [ ] **Step 2: Confirm real history landed correctly**

Pick one resolved fund's symbol and spot-check a few dates against mfapi.in directly:

```bash
curl -s "https://api.mfapi.in/mf/<schemeCode>" | head -c 500
```

Query the same asset's `PriceHistory` rows (via `bunx prisma studio` or a one-off script) and confirm at least 3 spot-checked dates match mfapi.in's NAV values exactly.

- [ ] **Step 3: Confirm the chart UI renders it**

Start the app (`bun run dev` in `backend/`, `bun run dev` in `frontend/`), open the AssetDetail page for the backfilled fund, and confirm the price-history chart (the same component equities use) now shows real historical NAV instead of being empty.

**FX cross-check:**

- [ ] **Step 4: Compare the existing live and historical FX sources**

Write a short one-off script (or use `bunx tsx` inline) that calls the existing `getFxRates()` and `getHistoricalFxToInr("USD", <today>)` / `getHistoricalFxToInr("GBP", <today>)` / `getHistoricalFxToInr("EUR", <today>)` from `src/lib/fx.ts`, and prints both side by side for USD/INR, GBP/INR, EUR/INR.

- [ ] **Step 5: Cross-check against a third, independent source**

Look up the same three pairs' current rates from an independent source (e.g. a web search for "USD to INR exchange rate today") and compare against both `getFxRates()` and `getHistoricalFxToInr()`'s output.

- [ ] **Step 6: Report the result**

If all three agree within ~1%: no FX code changes ship in this wave — report this as confirmed-accurate. If any pair diverges materially: do not fix it inline — flag it as a separate, dedicated follow-up investigation (per spec §3 and the original brainstorming discussion), and report the specific divergence found.

---

## Testing Summary

- Unit: `mfapi.test.ts` (provider parsing/error paths), `mfSchemeMatch.test.ts` (matching policy, including the must-not-auto-match cases).
- Integration: `backfillMutualFundNavHistory.test.ts` (real `PriceHistory` rows land for an ISIN-matched held fund; an unresolvable slug-only fund is left untouched, not silently mismatched).
- Manual/live (Task 5): real historical NAV rendering in the existing chart UI; FX three-way cross-check.
