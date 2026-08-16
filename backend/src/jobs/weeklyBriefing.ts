import { DEFAULT_USER_ID } from "../lib/users";
import { generateBriefing } from "../lib/ai/aiService";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

/** Port of tasks.py's _run_briefing("weekly") helper, as called by
 * weekly_briefing_task. Reuses aiService.ts's already-ported generateBriefing
 * (which itself reuses executeCompletion's Gemini -> Groq fallback chain) —
 * no AI-calling logic is reimplemented here. */
async function runWeeklyBriefing(): Promise<void> {
  await generateBriefing("weekly", DEFAULT_USER_ID);
}

/** Port of weekly_briefing_task (the @_skip_if_disabled("weekly_briefing") /
 * @shared_task decorator pair). */
export async function weeklyBriefingTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("weekly_briefing", logId)) return;
  await wrapJobExecution("weekly_briefing", logId, runWeeklyBriefing);
}
