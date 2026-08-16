import "dotenv/config";
import { refreshMutualFundNavsTask } from "../src/jobs/refreshMutualFundNavs";
import { prisma } from "../src/prisma";

refreshMutualFundNavsTask()
  .then(async () => {
    console.log("refresh_mutual_fund_navs: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("refresh_mutual_fund_navs failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
