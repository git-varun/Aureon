import { prisma } from "../prisma";
import { wrapJobExecution } from "../lib/jobs/wrapJobExecution";

const STALE_CUTOFF_MS = 3 * 24 * 60 * 60 * 1000;

/** Port of DataQualityService.validate. Three checks, same order as Python:
 * (1) every LatestQuote has an asset_id and a matching AssetSnapshot,
 * (2) no LatestQuote is >3 days stale, (3) every Recommendation references a
 * real AssetSnapshot. */
async function validate(): Promise<string[]> {
  const errors: string[] = [];
  const quotes = await prisma.latestQuote.findMany();

  for (const q of quotes) {
    if (!q.assetId) {
      errors.push(`LatestQuote ${q.symbol} has no asset_id associated.`);
    } else if (!(await prisma.assetSnapshot.findUnique({ where: { assetId: q.assetId } }))) {
      errors.push(`LatestQuote ${q.symbol} has asset_id ${q.assetId} but no AssetSnapshot exists.`);
    }
  }

  const staleCutoff = new Date(Date.now() - STALE_CUTOFF_MS);
  for (const q of quotes) {
    if (q.updatedAt && q.updatedAt < staleCutoff) {
      errors.push(`LatestQuote ${q.symbol} is stale. Last updated: ${q.updatedAt.toISOString()}`);
    }
  }

  const recommendations = await prisma.recommendations.findMany();
  for (const r of recommendations) {
    if (!(await prisma.assetSnapshot.findUnique({ where: { assetId: r.asset_id } }))) {
      errors.push(`Recommendation ${r.id} references invalid/deleted asset_id ${r.asset_id}.`);
    }
  }

  return errors;
}

/** Port of validate_data_quality_task. Not on Celery beat (no JobConfig row
 * matched — it's `enabled: True` in Python's _DEFAULT_JOBS but has no
 * beat_schedule entry, so it's manual-"Run Now"-only there too). No
 * `_skip_if_disabled` decorator in Python for this task, so this port
 * doesn't call `skipIfDisabled` either — unlike its sibling maintenance
 * jobs. */
export async function validateDataQualityTask(logId: number | null = null): Promise<void> {
  await wrapJobExecution("validate_data_quality", logId, async () => {
    const errors = await validate();
    if (errors.length > 0) {
      console.error(`Data Quality Audit found ${errors.length} issues: ${errors.slice(0, 10).join("; ")}`);
    } else {
      console.log("Data Quality Validation completed successfully. No issues found.");
    }
  });
}
