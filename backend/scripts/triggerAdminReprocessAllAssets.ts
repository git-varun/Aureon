import "dotenv/config";
import { adminReprocessAllAssetsTask } from "../src/jobs/adminMaintenance";
import { prisma } from "../src/prisma";

// Manual entrypoint — no JobConfig row / no HTTP route calls this in either
// backend today (see adminMaintenance.ts's doc comment); this script is the
// only current way to invoke it in Node.
adminReprocessAllAssetsTask()
  .then(async () => {
    // adminReprocessAllAssetsTask now awaits the full bounded-batch fan-out
    // (see adminMaintenance.ts's fanOutGenerateFeatures) before resolving —
    // every generateFeatures() call has already settled by the time this
    // "done" prints, no extra grace period needed.
    console.log("admin_reprocess_all: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("admin_reprocess_all failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
