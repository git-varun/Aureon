import { Router } from "express";
import { SCOPES, previewReset, runReset } from "../../lib/settings/dataReset";
import { consumeBackupReceipt } from "../../lib/settings/resetRedis";
import { getCurrentUser } from "../../lib/users";
import { ConflictError, ValidationError } from "../../lib/errors";

export const resetRouter = Router();

resetRouter.get("/reset/scopes", (_req, res) => {
  res.json({ scopes: SCOPES });
});

resetRouter.get("/reset/preview", async (req, res) => {
  const user = await getCurrentUser();
  const scopesParam = String(req.query.scopes ?? "");
  const scopeList = scopesParam.split(",").map((s) => s.trim()).filter(Boolean);
  const counts = await previewReset(scopeList, user.id);
  res.json({ counts });
});

resetRouter.post("/reset", async (req, res) => {
  const user = await getCurrentUser();
  const { scopes, backup_receipt: backupReceipt } = req.body ?? {};

  // Validate scopes BEFORE consuming the single-use receipt — a typo in the
  // request body shouldn't burn a valid backup and force a re-export. This
  // also rejects a missing/empty/non-array `scopes` here rather than letting
  // it reach consumeBackupReceipt (which would burn the receipt) and then
  // runReset's internal validateScopes (400 for empty, uncaught 500 for
  // non-array since it calls .filter() directly).
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ValidationError("scopes must be a non-empty array");
  }
  const unknown = scopes.filter((s: string) => !SCOPES.includes(s as never));
  if (unknown.length > 0) {
    // Python's route re-raises this as HTTPException(400), matching
    // errorHandler.ts's ValidationError -> 400 mapping — not
    // RequestValidationError, which maps to 422.
    throw new ValidationError(`Unknown reset scope(s): ${JSON.stringify(unknown.sort())}`);
  }

  if (!(await consumeBackupReceipt(backupReceipt))) {
    throw new ConflictError(
      "No valid, unexpired backup found for this receipt. Export a fresh backup via GET /portfolio/backup and use its X-Backup-Receipt header before resetting.",
    );
  }

  const results = await runReset(scopes, user.id, user.id);
  res.json({ status: "success", cleared: results });
});
