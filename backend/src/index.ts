import "dotenv/config";
import express from "express";
import morgan from "morgan";
import Redis from "ioredis";
import { logger } from "./lib/logger";
import { portfolioRouter } from "./routes/portfolio";
import { marketAssetsRouter, marketSectorsRouter, marketRouter, themesRouter } from "./routes/market";
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
import { prisma } from "./prisma";

const app = express();
const port = process.env.PORT ?? 8010;

// "combined" plus response-time (ms), appended — apache combined log format
// has no duration token of its own.

app.use(
  morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }),
);

app.use(express.json());
app.use("/api/v1/portfolio", portfolioRouter);
app.use("/api/v1", marketAssetsRouter);
app.use("/api/v1/market", marketSectorsRouter);
app.use("/api/v1/market", marketRouter);
app.use("/api/v1/market", themesRouter);
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

process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — process exiting");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection — process exiting");
  process.exit(1);
});

async function start() {
  await prisma.$queryRaw`SELECT 1`;
  logger.info("database connection established");

  const startupRedis = new Redis(process.env.REDIS_URL!);
  await startupRedis.ping();
  await startupRedis.quit();
  logger.info("Redis connection established");

  await seedDefaultProviders();
  await seedDefaultJobs();

  const server = app.listen(port, () => {
    logger.info({ port }, "backend listening");
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.info({ signal }, "signal received — shutting down");
      server.close(() => {
        logger.info("server closed");
        process.exit(0);
      });
    });
  }
}

start().catch((err) => {
  logger.error({ err }, "startup failed");
  process.exit(1);
});
