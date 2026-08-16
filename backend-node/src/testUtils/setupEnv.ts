import { beforeAll } from "vitest";

// Vitest setupFiles entry — runs before any test file's module graph is
// evaluated. Needed only by tests that exercise the shared `prisma`
// singleton (src/prisma.ts), which reads process.env.DATABASE_URL at
// import time — unlike testPrisma.ts, which passes datasourceUrl directly
// and never depends on this. Force-overrides (not just falls back on)
// DATABASE_URL to the same aureon_test database testPrisma.ts uses: the
// shell environment may already have a real-looking DATABASE_URL set (e.g.
// the project root .env's SQLAlchemy-style `postgresql+psycopg://...aureon`
// for the Python backend) — silently falling back only when unset would
// still let that value through and point the singleton at the real dev
// database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/aureon_test?options=-c%20timezone%3Dutc";

// Fallback SECRET_KEY for tests that exercise Fernet-encrypting code paths
// (e.g. provider credential storage) without passing a secret explicitly —
// matches Python's DEFAULT_DEV_SECRET (backend/app/core/config.py), the real
// default both backends fall back to whenever SECRET_KEY isn't set in .env.
// Never overrides an already-set SECRET_KEY (e.g. from a real .env loaded
// via dotenv).
process.env.SECRET_KEY =
  process.env.SECRET_KEY ?? "a7ab7603b94dfe3dd6c0fa505548081fc5cda3bc340ac80e0f37aaf2f05623fa";

// Task 10 (2026-08-16): several route tests (e.g. routes/portfolio/
// sync.test.ts's zerodha/binance flows) assume DEFAULT_JOBS'
// JobConfig rows already exist, matching what a real app boot does
// (src/index.ts's start() calls seedDefaultProviders()+seedDefaultJobs()
// before listening). On a long-lived shared dev DB that's always true (a
// real `npm run dev` session seeded it once already), but a genuinely fresh
// CI-created aureon_test database has no such history — and vitest.config
// .mts's fileParallelism:false ordering doesn't guarantee
// settings/jobs.test.ts or settings/providers.test.ts (which call these
// seed functions themselves) run before routes/portfolio/sync.test.ts
// alphabetically. Seed here instead, once per test file (setupFiles reruns
// per file, but both functions are insert-if-absent/idempotent — see their
// own doc comments — so this is safe and cheap regardless of run order).
beforeAll(async () => {
  const { seedDefaultProviders } = await import("../lib/settings/providers");
  const { seedDefaultJobs } = await import("../lib/settings/jobDefaults");
  await seedDefaultProviders();
  await seedDefaultJobs();
});
