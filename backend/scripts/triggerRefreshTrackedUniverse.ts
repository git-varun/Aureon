import "dotenv/config";
import { refreshTrackedUniverseTask } from "../src/jobs/refreshTrackedUniverse";
import { prisma } from "../src/prisma";
import { quotesQueue } from "../src/queue";

// Manual "Run Now" equivalent — the only way this job runs this phase (no
// BullMQ repeatable schedule is registered anywhere in this codebase yet).
refreshTrackedUniverseTask()
  .then(async () => {
    console.log("refresh_tracked_universe: done");
    await prisma.$disconnect();
    await quotesQueue.close();
  })
  .catch(async (e) => {
    console.error("refresh_tracked_universe failed:", e);
    await prisma.$disconnect();
    await quotesQueue.close();
    process.exit(1);
  });
