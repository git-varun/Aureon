import "dotenv/config";
import { refreshFundamentalsTask } from "../src/jobs/refreshFundamentals";
import { prisma } from "../src/prisma";

// Manual "Run Now" equivalent, same as the job's own BullMQ-scheduled path
// but callable synchronously for local verification/ops use.
refreshFundamentalsTask()
  .then(async () => {
    console.log("refresh_fundamentals: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("refresh_fundamentals failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
