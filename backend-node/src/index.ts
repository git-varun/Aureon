import "dotenv/config";
import express from "express";
import { portfolioRouter } from "./routes/portfolio";
import { marketAssetsRouter, marketSectorsRouter } from "./routes/market";
import { watchlistRouter } from "./routes/watchlist/watchlist";
import { usersRouter } from "./routes/users/users";
import { providersRouter } from "./routes/settings/providers";
import { jobsRouter } from "./routes/settings/jobs";
import { resetRouter } from "./routes/settings/reset";
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
app.use(errorHandler);

app.listen(port, async () => {
  await seedDefaultProviders();
  await seedDefaultJobs();
  console.log(`backend-node listening on port ${port}`);
});
