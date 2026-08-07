import { Router } from "express";
import { portfoliosRouter } from "./portfolios";
import { positionsRouter } from "./positions";
import { transactionsRouter } from "./transactions";

export const portfolioRouter = Router();

portfolioRouter.use("/portfolios", portfoliosRouter);
portfolioRouter.use("/portfolios", positionsRouter);
portfolioRouter.use("/portfolios", transactionsRouter);
