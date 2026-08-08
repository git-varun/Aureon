import { Router } from "express";
import { getCurrentUser } from "../../lib/users";
import {
  getAllProviders, getProviderDict, updateProvider, setProviderKey, removeProviderKey,
} from "../../lib/settings/providers";
import { NotFoundError } from "../../lib/errors";

export const providersRouter = Router();

providersRouter.get("/providers", async (_req, res) => {
  res.json({ providers: await getAllProviders() });
});

providersRouter.put("/providers/:name", async (req, res) => {
  const user = await getCurrentUser();
  await updateProvider(req.params.name, { enabled: req.body?.enabled, config: req.body?.config }, user.id);
  res.json({ providers: await getAllProviders() });
});

providersRouter.put("/providers/:name/keys", async (req, res) => {
  const user = await getCurrentUser();
  const { key_name: keyName, value } = req.body ?? {};
  await setProviderKey(req.params.name, keyName, value ?? "", user.id);
  const p = await getProviderDict(req.params.name);
  if (!p) throw new NotFoundError(`Provider ${req.params.name} not found`);
  res.json({ provider: p });
});

providersRouter.delete("/providers/:name/keys/:keyName", async (req, res) => {
  const user = await getCurrentUser();
  await removeProviderKey(req.params.name, req.params.keyName, user.id);
  const p = await getProviderDict(req.params.name);
  if (!p) throw new NotFoundError(`Provider ${req.params.name} not found`);
  res.json({ provider: p });
});

providersRouter.post("/providers/:name/health-check", async (req, res) => {
  // No unified provider-adapter registry ported yet (see Task 2 note) —
  // honest "unknown" rather than a fake pass/fail.
  res.json({ provider_name: req.params.name, healthy: null, checked_at: new Date().toISOString() });
});
