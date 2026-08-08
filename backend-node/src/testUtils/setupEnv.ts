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
