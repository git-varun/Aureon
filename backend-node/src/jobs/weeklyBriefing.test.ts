import { describe, it, expect, vi, beforeEach } from "vitest";
import { weeklyBriefingTask } from "./weeklyBriefing";
import { DEFAULT_USER_ID } from "../lib/users";

const { mockGenerateBriefing, mockSkipIfDisabled, mockWrapJobExecution } = vi.hoisted(() => ({
  mockGenerateBriefing: vi.fn(async () => ({ vibe: "test" })),
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

describe("weeklyBriefingTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkipIfDisabled.mockResolvedValue(false);
  });

  it("calls generateBriefing('weekly', DEFAULT_USER_ID) via wrapJobExecution when not disabled", async () => {
    await weeklyBriefingTask(42);

    expect(mockSkipIfDisabled).toHaveBeenCalledWith("weekly_briefing", 42);
    expect(mockWrapJobExecution).toHaveBeenCalledWith("weekly_briefing", 42, expect.any(Function));
    expect(mockGenerateBriefing).toHaveBeenCalledWith("weekly", DEFAULT_USER_ID);
  });

  it("skips generateBriefing entirely when JobConfig.enabled is false", async () => {
    mockSkipIfDisabled.mockResolvedValue(true);

    await weeklyBriefingTask(42);

    expect(mockWrapJobExecution).not.toHaveBeenCalled();
    expect(mockGenerateBriefing).not.toHaveBeenCalled();
  });
});
