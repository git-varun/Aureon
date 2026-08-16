import { DEFAULT_USER_ID } from "../lib/users";
import { generateBriefing } from "../lib/ai/aiService";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

/** Port of tasks.py's _run_briefing("monthly") helper, as called by
 * monthly_briefing_task. Reuses aiService.ts's already-ported generateBriefing
 * (which itself reuses executeCompletion's Gemini -> Groq fallback chain) —
 * no AI-calling logic is reimplemented here. */
async function runMonthlyBriefing(): Promise<void> {
  await generateBriefing("monthly", DEFAULT_USER_ID);
}

/** Port of monthly_briefing_task (the @_skip_if_disabled("monthly_briefing")
 * / @shared_task decorator pair). */
export async function monthlyBriefingTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("monthly_briefing", logId)) return;
  await wrapJobExecution("monthly_briefing", logId, runMonthlyBriefing);
}
