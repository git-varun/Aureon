import "dotenv/config";
import { backfillMutualFundNavHistoryTask } from "../src/jobs/backfillMutualFundNavHistory";
import { prisma } from "../src/prisma";

backfillMutualFundNavHistoryTask()
  .then(async () => {
    console.log("backfill_mutual_fund_nav_history: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("backfill_mutual_fund_nav_history failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
