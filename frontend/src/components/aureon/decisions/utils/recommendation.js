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

/** Relative time (e.g. "2h ago") for a rec's createdAt timestamp */
export function fmtAge(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Determine if a rec has high-impact that needs a modal (from utils.js) */
export { needsModal } from '../../utils';
