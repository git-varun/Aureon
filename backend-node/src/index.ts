import "dotenv/config";
import express from "express";
import { portfolioRouter } from "./routes/portfolio";
import { marketAssetsRouter, marketSectorsRouter } from "./routes/market";
import { errorHandler } from "./lib/errorHandler";

const app = express();
const port = process.env.PORT ?? 8010;

app.use(express.json());
app.use("/api/v1/portfolio", portfolioRouter);
app.use("/api/v1", marketAssetsRouter);
app.use("/api/v1/market", marketSectorsRouter);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`backend-node listening on port ${port}`);
});
