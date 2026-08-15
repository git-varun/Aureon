import "dotenv/config";
import { adminReprocessAllAssetsTask } from "../src/jobs/adminMaintenance";
import { prisma } from "../src/prisma";

// Manual entrypoint — no JobConfig row / no HTTP route calls this in either
// backend today (see adminMaintenance.ts's doc comment); this script is the
// only current way to invoke it in Node.
adminReprocessAllAssetsTask()
  .then(async () => {
    console.log("admin_reprocess_all: done");
    // fan-out is fire-and-forget (matches Python's generate_features.delay),
    // so give in-flight generateFeatures() calls a moment before exit.
    await new Promise((r) => setTimeout(r, 3000));
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("admin_reprocess_all failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
