import "dotenv/config";
import { refreshPricesTask } from "../src/jobs/refreshPrices";
import { prisma } from "../src/prisma";
import { quotesQueue } from "../src/queue";

// Manual "Run Now" equivalent — the only way this job runs this phase (no
// BullMQ repeatable schedule is registered anywhere in this codebase yet).
refreshPricesTask()
  .then(async () => {
    console.log("refresh_prices: enqueued");
    await prisma.$disconnect();
    await quotesQueue.close();
  })
  .catch(async (e) => {
    console.error("refresh_prices failed:", e);
    await prisma.$disconnect();
    await quotesQueue.close();
    process.exit(1);
  });
