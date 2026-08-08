import "dotenv/config";
import { fetchNewsTask } from "../src/jobs/fetchNews";
import { prisma } from "../src/prisma";

// Manual "Run Now" equivalent — the only way this job runs this phase (no
// BullMQ repeatable schedule is registered anywhere in this codebase yet).
fetchNewsTask()
  .then(async () => {
    console.log("fetch_news: done");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("fetch_news failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
