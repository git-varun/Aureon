import "dotenv/config";
import { seedTrackedUniversesTask } from "../src/jobs/seedTrackedUniverses";
import { prisma } from "../src/prisma";

// Manual "Run Now" equivalent — disabled by default (JobConfig row seeded
// enabled=false, same as Python's _DEFAULT_JOBS), rare/occasional bulk
// operation. Full run walks 5 equity universes (~350 symbols) plus a live
// CoinGecko top-100 crypto discovery, each symbol quoted and its history
// backfilled from Yahoo — expect a multi-minute run.
seedTrackedUniversesTask()
  .then(async () => {
    console.log("seed_tracked_universes: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("seed_tracked_universes failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
