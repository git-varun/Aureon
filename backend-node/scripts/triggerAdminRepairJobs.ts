import "dotenv/config";
import { adminRepairJobsTask } from "../src/jobs/adminMaintenance";
import { prisma } from "../src/prisma";

// Manual entrypoint — no JobConfig row / no HTTP route calls this in either
// backend today (see adminMaintenance.ts's doc comment); this script is the
// only current way to invoke it in Node.
adminRepairJobsTask()
  .then(async () => {
    console.log("admin_repair: done");
    await new Promise((r) => setTimeout(r, 3000));
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("admin_repair failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
