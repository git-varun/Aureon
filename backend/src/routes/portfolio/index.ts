import { Router } from "express";
import { portfoliosRouter } from "./portfolios";
import { positionsRouter } from "./positions";
import { transactionsRouter } from "./transactions";
import { importsRouter } from "./imports";
import { backupRouter } from "./backup";
import { syncRouter } from "./sync";

export const portfolioRouter = Router();

portfolioRouter.use("/portfolios", portfoliosRouter);
portfolioRouter.use("/portfolios", positionsRouter);
portfolioRouter.use("/portfolios", transactionsRouter);
portfolioRouter.use("/portfolios", importsRouter);
portfolioRouter.use("/", backupRouter);
portfolioRouter.use("/", syncRouter);
