import { describe, it, expect } from "vitest";
import { evaluateAlerts, type ActiveAlert } from "./alerts";

function alert(overrides: Partial<ActiveAlert> = {}): ActiveAlert {
  return {
    id: "alert-1",
    userId: "user-1",
    alertPrice: 100,
    alertDirection: "gte",
    alertTriggered: false,
    ...overrides,
  };
}

describe("evaluateAlerts", () => {
  it("fires a gte alert when price crosses up to/above the target", () => {
    const { fired, updates } = evaluateAlerts([alert({ alertDirection: "gte", alertPrice: 100 })], "AAPL", 101);
    expect(fired).toEqual([
      { userId: "user-1", title: "AAPL alert triggered", message: "AAPL rose to 101, target was 100", type: "info" },
    ]);
    expect(updates).toEqual([{ id: "alert-1", alertTriggered: true }]);
  });

  it("fires a lte alert when price crosses down to/below the target", () => {
    const { fired, updates } = evaluateAlerts([alert({ alertDirection: "lte", alertPrice: 100 })], "AAPL", 99);
    expect(fired).toEqual([
      { userId: "user-1", title: "AAPL alert triggered", message: "AAPL fell to 99, target was 100", type: "info" },
    ]);
    expect(updates).toEqual([{ id: "alert-1", alertTriggered: true }]);
  });

  it("does not re-fire an already-triggered alert still on the triggered side", () => {
    const { fired, updates } = evaluateAlerts(
      [alert({ alertDirection: "gte", alertPrice: 100, alertTriggered: true })],
      "AAPL",
      102,
    );
    expect(fired).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("resets alertTriggered once price moves back to the non-triggered side", () => {
    const { fired, updates } = evaluateAlerts(
      [alert({ alertDirection: "gte", alertPrice: 100, alertTriggered: true })],
      "AAPL",
      99,
    );
    expect(fired).toEqual([]);
    expect(updates).toEqual([{ id: "alert-1", alertTriggered: false }]);
  });

  it("allows a later re-crossing to fire again after a reset", () => {
    const a = alert({ alertDirection: "gte", alertPrice: 100 });
    const afterReset = evaluateAlerts([a], "AAPL", 99);
    expect(afterReset.fired).toEqual([]);

    const afterRecross = evaluateAlerts([{ ...a, alertTriggered: false }], "AAPL", 101);
    expect(afterRecross.fired).toHaveLength(1);
  });

  it("ignores unrelated alerts and only evaluates the given symbol's alerts", () => {
    const { fired } = evaluateAlerts([], "AAPL", 101);
    expect(fired).toEqual([]);
  });

  it("evaluates the boundary price itself as triggered for both directions", () => {
    expect(evaluateAlerts([alert({ alertDirection: "gte", alertPrice: 100 })], "AAPL", 100).fired).toHaveLength(1);
    expect(evaluateAlerts([alert({ alertDirection: "lte", alertPrice: 100 })], "AAPL", 100).fired).toHaveLength(1);
  });
});
