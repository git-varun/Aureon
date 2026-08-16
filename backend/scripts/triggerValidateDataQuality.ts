import "dotenv/config";
import { validateDataQualityTask } from "../src/jobs/validateDataQuality";
import { prisma } from "../src/prisma";

// Manual "Run Now" equivalent — this job has no beat_schedule entry in
// Python either (rare/manual audit job).
validateDataQualityTask()
  .then(async () => {
    console.log("validate_data_quality: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("validate_data_quality failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
