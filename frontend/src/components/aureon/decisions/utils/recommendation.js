import { REC_STATUS, CONFIDENCE_LEVEL } from '../constants';

/** Given active/applied/dismissed arrays, compute the status of a rec */
export function getRecStatus(rec, active, applied, dismissed) {
  if (active.includes(rec.id)) {
    const blocked = (rec.conflictsWith || []).filter(id => active.includes(id));
    return blocked.length ? REC_STATUS.CONFLICT : REC_STATUS.ACTIVE;
  }
  const app = applied.find(a => a.id === rec.id);
  if (app) return app.pending ? REC_STATUS.SETTLING : REC_STATUS.APPLIED;
  if (dismissed.find(d => d.id === rec.id)) return REC_STATUS.DISMISSED;
  return REC_STATUS.ACTIVE;
}

/** Band label for confidence score */
export function getConfidenceLevel(score) {
  if (score >= 80) return CONFIDENCE_LEVEL.HIGH;
  if (score >= 50) return CONFIDENCE_LEVEL.MED;
  return CONFIDENCE_LEVEL.LOW;
}

/** Format a recommendation's impact as a one-line string */
export function fmtImpactOneLine(rec) {
  return rec.impactOneLine || '';
}

/** Determine if a rec has high-impact that needs a modal (from utils.js) */
export { needsModal } from '../../utils';
