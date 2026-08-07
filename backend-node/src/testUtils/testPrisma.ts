import { PrismaClient } from "../generated/prisma";

// Dedicated test database — same convention as the Python backend's
// TEST_DATABASE_URL (see backend/app/core/config.py and the root .env):
// a sibling `aureon_test` database, never the real `aureon` dev database
// this repo's own portfolio data lives in. Passed via datasourceUrl (not
// process.env.DATABASE_URL) so tests never depend on load-order relative to
// dotenv, and can never accidentally fall back to the dev database.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/aureon_test?options=-c%20timezone%3Dutc";

export const testPrisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
