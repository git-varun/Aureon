import { describe, it, expect, vi, beforeEach } from "vitest";
import { dailyBriefingTask } from "./dailyBriefing";
import { DEFAULT_USER_ID } from "../lib/users";

const { mockGenerateBriefing, mockSkipIfDisabled, mockWrapJobExecution } = vi.hoisted(() => ({
  mockGenerateBriefing: vi.fn(async () => ({ market_vibe: "test" })),
  mockSkipIfDisabled: vi.fn(async () => false),
  mockWrapJobExecution: vi.fn(async (_jobName: string, _logId: number | null, fn: () => Promise<unknown>) => {
    await fn();
  }),
}));

vi.mock("../lib/ai/aiService", () => ({
  generateBriefing: mockGenerateBriefing,
}));

vi.mock("../lib/jobs/wrapJobExecution", () => ({
  skipIfDisabled: mockSkipIfDisabled,
  wrapJobExecution: mockWrapJobExecution,
}));

describe("dailyBriefingTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkipIfDisabled.mockResolvedValue(false);
  });

  it("calls generateBriefing('global', DEFAULT_USER_ID) via wrapJobExecution when not disabled", async () => {
    await dailyBriefingTask(42);

    expect(mockSkipIfDisabled).toHaveBeenCalledWith("daily_briefing", 42);
    expect(mockWrapJobExecution).toHaveBeenCalledWith("daily_briefing", 42, expect.any(Function));
    expect(mockGenerateBriefing).toHaveBeenCalledWith("global", DEFAULT_USER_ID);
  });

  it("skips generateBriefing entirely when JobConfig.enabled is false", async () => {
    mockSkipIfDisabled.mockResolvedValue(true);

    await dailyBriefingTask(42);

    expect(mockWrapJobExecution).not.toHaveBeenCalled();
    expect(mockGenerateBriefing).not.toHaveBeenCalled();
  });
});
