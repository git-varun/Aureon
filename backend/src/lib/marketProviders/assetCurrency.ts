import type { Prisma } from "../../generated/prisma";

type Tx = Prisma.TransactionClient;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Port of IngestionRepository.update_asset_currency. Merges a provider-
 * resolved real currency into Asset.metadata (same merge pattern as
 * update_asset_sector) — only written when the provider actually resolved
 * one (e.g. yahoo's per-symbol GBp/GBP/USD resolution), never a suffix-based
 * guess. inferCurrency() prefers this once present.
 *
 * Unwired this phase — no live call site exists in Python either (only
 * ingest_quote, a Celery task, calls this); ready for Phase 3 wiring. */
export async function updateAssetCurrency(tx: Tx, assetId: string, currency: string | null): Promise<void> {
  if (currency === null) return;
  const asset = await tx.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;
  const payload = isPlainObject(asset.metadata) ? { ...asset.metadata } : {};
  payload.currency = currency;
  await tx.asset.update({ where: { id: assetId }, data: { metadata: payload } });
}
