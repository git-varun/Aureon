import "dotenv/config";
import { fetchNewsTask } from "../src/jobs/fetchNews";
import { prisma } from "../src/prisma";

// Manual "Run Now" equivalent — the only way this job runs this phase (no
// BullMQ repeatable schedule is registered anywhere in this codebase yet).
// fetchNews.ts keeps a module-level ioredis client open for the long-running
// worker's repeated job runs (queue.ts registers fetchNewsTask on a repeatable
// schedule) — it must not be disconnected here. This one-off trigger process
// still needs to exit once its own work is done, so force it explicitly
// rather than waiting on that handle to close.
fetchNewsTask()
  .then(async () => {
    console.log("fetch_news: done");
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("fetch_news failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
