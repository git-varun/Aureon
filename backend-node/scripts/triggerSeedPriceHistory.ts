import "dotenv/config";
import { seedPriceHistoryTask } from "../src/jobs/seedPriceHistory";
import { prisma } from "../src/prisma";

seedPriceHistoryTask()
  .then(async () => {
    console.log("seed_price_history: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("seed_price_history failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
