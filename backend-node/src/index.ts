import "dotenv/config";
import express from "express";
import { portfolioRouter } from "./routes/portfolio";
import { marketAssetsRouter, marketSectorsRouter } from "./routes/market";
import { watchlistRouter } from "./routes/watchlist/watchlist";
import { usersRouter } from "./routes/users/users";
import { providersRouter } from "./routes/settings/providers";
import { jobsRouter } from "./routes/settings/jobs";
import { resetRouter } from "./routes/settings/reset";
import { aiRouter } from "./routes/ai/ai";
import { intelligenceRouter } from "./routes/ai/intelligence";
import { recommendationRouter, recommendationSeedRouter } from "./routes/ai/recommendations";
import { newsRouter } from "./routes/news/news";
import { evaluationRouter } from "./routes/evaluation/evaluation";
import { systemHealthRouter } from "./routes/monitoring/health";
import { monitoringRouter } from "./routes/monitoring/monitoring";
import { notificationsRouter } from "./routes/notifications/notifications";
import { seedDefaultProviders } from "./lib/settings/providers";
import { seedDefaultJobs } from "./lib/settings/jobDefaults";
import { errorHandler } from "./lib/errorHandler";

const app = express();
const port = process.env.PORT ?? 8010;

app.use(express.json());
app.use("/api/v1/portfolio", portfolioRouter);
app.use("/api/v1", marketAssetsRouter);
app.use("/api/v1/market", marketSectorsRouter);
app.use("/api/v1/watchlist", watchlistRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/config", providersRouter);
app.use("/api/v1/config", jobsRouter);
app.use("/api/v1", resetRouter);
app.use("/api/v1", aiRouter);
app.use("/api/v1/intelligence", intelligenceRouter);
app.use("/api/v1/recommendation", recommendationRouter);
app.use("/api/v1", recommendationSeedRouter);
app.use("/api/v1/news", newsRouter);
app.use("/api/v1/evaluation", evaluationRouter);
app.use("/api/v1", systemHealthRouter);
app.use("/api/v1/monitoring", monitoringRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use(errorHandler);

async function start() {
  await seedDefaultProviders();
  await seedDefaultJobs();
  app.listen(port, () => {
    console.log(`backend-node listening on port ${port}`);
  });
}

start();
