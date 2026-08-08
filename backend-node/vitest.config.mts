import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/testUtils/setupEnv.ts"],
    // Test files share a single Postgres DB (aureon_test) with no per-worker
    // isolation. Several suites (dataReset.test.ts's whole-table-wipe
    // rollback test in particular) do unscoped table-wide deletes that are
    // exact Python parity and must not be scoped down — so file-level
    // parallelism is what has to give: run test files sequentially to stop
    // concurrently-running suites from stepping on each other's fixtures.
    fileParallelism: false,
  },
});
