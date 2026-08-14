import { Router } from "express";
import { getCurrentUser } from "../../lib/users";
import {
  getAllProviders, getProviderDict, updateProvider, setProviderKey, removeProviderKey, getDecryptedKey,
} from "../../lib/settings/providers";
import { listAllocationTargets, upsertAllocationTarget } from "../../lib/settings/allocationTargets";
import { NotFoundError, RequestValidationError, ValidationError, ZerodhaAuthError } from "../../lib/errors";
import { ZerodhaClient } from "../../lib/broker/zerodha/client";

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL ?? "http://localhost:3000";

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

// Port of get_zerodha_login_url. Pure string construction (ZerodhaClient.
// login_url() makes no network call) — safe to port. The OAuth *callback*
// (token exchange against Zerodha's live API, needs api_secret + a real
// request_token from an actual login) is NOT ported — same class of gap as
// Wave 3's binance-backfill, stays on Python; see vite.config.js's guard.
providersRouter.get("/providers/zerodha/oauth/login-url", async (_req, res) => {
  const apiKey = await getDecryptedKey("zerodha", "api_key");
  if (!apiKey) throw new ValidationError("Zerodha api_key is not configured yet");
  res.json({ login_url: `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3` });
});

// Port of zerodha_oauth_callback. Ported for parity/testability, but NOT
// cut over in vite.config.js as of this change — Task 4's live-credential
// audit found no Zerodha credentials configured in this environment to
// verify the checksum/session-exchange against Zerodha's real servers, and
// this is an intentionally-unauthenticated endpoint (see the comment below)
// guarding real broker session creation, so it stays proxied to Python until
// a live exchange can be verified. Unauthenticated by necessity: Zerodha's
// browser redirect carries no session cookie/JWT. An attacker hitting this
// endpoint without our api_secret cannot forge a session — the request_token
// is only useful when exchanged against Zerodha's own servers with that secret.
providersRouter.get("/providers/zerodha/oauth/callback", async (req, res) => {
  const requestToken = typeof req.query.request_token === "string" ? req.query.request_token : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  console.log(`Zerodha OAuth callback hit (status=${status})`);

  if (status !== "success" || !requestToken) {
    res.redirect(`${FRONTEND_BASE_URL}/profile?zerodha=error&reason=login_failed`);
    return;
  }

  const apiKey = await getDecryptedKey("zerodha", "api_key");
  const apiSecret = await getDecryptedKey("zerodha", "api_secret");
  if (!apiKey || !apiSecret) {
    res.redirect(`${FRONTEND_BASE_URL}/profile?zerodha=error&reason=not_configured`);
    return;
  }

  const client = new ZerodhaClient(apiKey, apiSecret);
  try {
    await client.generateSession(requestToken);
  } catch (e) {
    if (e instanceof ZerodhaAuthError) {
      console.warn(`Zerodha session exchange failed: ${e.message}`);
      res.redirect(`${FRONTEND_BASE_URL}/profile?zerodha=error&reason=exchange_failed`);
      return;
    }
    throw e;
  }

  await setProviderKey("zerodha", "access_token", client.accessToken!, null);
  res.redirect(`${FRONTEND_BASE_URL}/profile?zerodha=connected`);
});

// Port of ConfigService.list_allocation_targets via GET /allocation_targets.
providersRouter.get("/allocation_targets", async (req, res) => {
  const targets = await listAllocationTargets();
  if (req.query.detail === "true" || req.query.detail === "1") {
    res.json({ targets });
    return;
  }
  const out: Record<string, number> = {};
  for (const t of targets) out[t.asset_class] = t.target_pct;
  res.json(out);
});

interface AllocationTargetUpsertBody {
  target_pct?: unknown;
  target?: unknown;
  band_low_pct?: unknown;
  band_high_pct?: unknown;
  notes?: unknown;
}

function inRange01(v: unknown): v is number {
  return typeof v === "number" && v >= 0 && v <= 1;
}

// Port of upsert_allocation_target — AllocationTargetUpsert's `target_pct`/
// `target` alias-resolution and [0,1] range validation.
providersRouter.put("/allocation_targets/:assetClass", async (req, res) => {
  const body = req.body as AllocationTargetUpsertBody;
  let targetPct: number | undefined;
  if (body.target_pct !== undefined) {
    if (!inRange01(body.target_pct)) throw new RequestValidationError("target_pct must be between 0 and 1");
    targetPct = body.target_pct;
  } else if (body.target !== undefined) {
    if (!inRange01(body.target)) throw new RequestValidationError("target must be between 0 and 1");
    targetPct = body.target;
  }
  if (targetPct === undefined) throw new RequestValidationError("Either target_pct or target must be provided");

  if (body.band_low_pct !== undefined && !inRange01(body.band_low_pct)) throw new RequestValidationError("band_low_pct must be between 0 and 1");
  if (body.band_high_pct !== undefined && !inRange01(body.band_high_pct)) throw new RequestValidationError("band_high_pct must be between 0 and 1");

  const user = await getCurrentUser();
  await upsertAllocationTarget(
    req.params.assetClass,
    targetPct,
    typeof body.band_low_pct === "number" ? body.band_low_pct : null,
    typeof body.band_high_pct === "number" ? body.band_high_pct : null,
    typeof body.notes === "string" ? body.notes : null,
    user.id,
  );

  const targets = await listAllocationTargets();
  const out: Record<string, number> = {};
  for (const t of targets) out[t.asset_class] = t.target_pct;
  res.json(out);
});
