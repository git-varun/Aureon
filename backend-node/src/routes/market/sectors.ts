import { Router } from "express";
import { getSectors, getSectorDetail } from "../../lib/marketProviders/sectors";

export const sectorsRouter = Router();

// Port of GET /market/sectors and GET /market/sectors/{name}.
sectorsRouter.get("/sectors", async (_req, res) => {
  res.json(await getSectors());
});

sectorsRouter.get("/sectors/:name", async (req, res) => {
  res.json(await getSectorDetail(req.params.name));
});
