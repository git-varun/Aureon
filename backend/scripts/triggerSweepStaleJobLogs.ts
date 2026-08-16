import "dotenv/config";
import { sweepStaleJobLogsTask } from "../src/jobs/sweepStaleJobLogs";
import { prisma } from "../src/prisma";

sweepStaleJobLogsTask()
  .then(async () => {
    console.log("sweep_stale_job_logs: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("sweep_stale_job_logs failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
