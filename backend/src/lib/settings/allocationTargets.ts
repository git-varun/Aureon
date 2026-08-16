import { prisma } from "../../prisma";
import { logAuditAction } from "../audit";

export interface AllocationTargetDict {
  asset_class: string;
  target_pct: number;
  band_low_pct: number | null;
  band_high_pct: number | null;
  notes: string | null;
}

/** Port of ConfigService's _alloc_target_to_dict — basis points (Int columns,
 * pct*10000) back to a plain fraction. */
function toDict(r: { asset_class: string; target_pct: number; band_low_pct: number | null; band_high_pct: number | null; notes: string | null }): AllocationTargetDict {
  return {
    asset_class: r.asset_class,
    target_pct: (r.target_pct || 0) / 10000.0,
    band_low_pct: r.band_low_pct !== null ? r.band_low_pct / 10000.0 : null,
    band_high_pct: r.band_high_pct !== null ? r.band_high_pct / 10000.0 : null,
    notes: r.notes,
  };
}

/** Port of ConfigService.list_allocation_targets. */
export async function listAllocationTargets(): Promise<AllocationTargetDict[]> {
  const rows = await prisma.allocation_targets.findMany();
  return rows.map(toDict);
}

/** Port of ConfigService.upsert_allocation_target. */
export async function upsertAllocationTarget(
  assetClass: string,
  targetPct: number,
  bandLowPct: number | null,
  bandHighPct: number | null,
  notes: string | null,
  actorId: string,
): Promise<AllocationTargetDict> {
  const bpTarget = Math.round(targetPct * 10000);
  const bpLow = bandLowPct !== null ? Math.round(bandLowPct * 10000) : null;
  const bpHigh = bandHighPct !== null ? Math.round(bandHighPct * 10000) : null;

  const row = await prisma.$transaction(async (tx) => {
    const saved = await tx.allocation_targets.upsert({
      where: { asset_class: assetClass },
      create: { asset_class: assetClass, target_pct: bpTarget, band_low_pct: bpLow, band_high_pct: bpHigh, notes, created_at: new Date() },
      update: { target_pct: bpTarget, band_low_pct: bpLow, band_high_pct: bpHigh, notes, updated_at: new Date() },
    });
    await logAuditAction(tx, "config_allocation_target_upsert", "allocation_target", actorId, assetClass, {
      target_pct: targetPct, band_low_pct: bandLowPct, band_high_pct: bandHighPct,
    });
    return saved;
  });

  return toDict(row);
}
