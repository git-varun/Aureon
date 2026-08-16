import { describe, it, expect } from "vitest";
import { naiveToUtc, toPythonIsoString } from "./tz";

describe("naiveToUtc", () => {
  it("is the identity for the UTC session timezone", () => {
    const naive = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
    expect(naiveToUtc(naive, "UTC").getTime()).toBe(naive.getTime());
  });

  it("reinterprets a naive wall-clock value in Asia/Kolkata (UTC+5:30) as that local time", () => {
    // Prisma hands back a naive TIMESTAMP column as a Date whose UTC getters
    // equal the raw column value — so a DB value of "2024-01-01 12:00:00"
    // (IST wall clock) arrives here framed as 2024-01-01T12:00:00Z. The real
    // UTC instant is 5h30m earlier: 2024-01-01T06:30:00Z.
    const naive = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
    const utc = naiveToUtc(naive, "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2024-01-01T06:30:00.000Z");
  });

  it("reinterprets a naive wall-clock value in America/New_York (UTC-5 in January)", () => {
    const naive = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
    const utc = naiveToUtc(naive, "America/New_York");
    expect(utc.toISOString()).toBe("2024-01-01T17:00:00.000Z");
  });

  it("preserves the millisecond fraction across a non-UTC offset", () => {
    const naive = new Date(Date.UTC(2024, 0, 1, 12, 0, 0, 123));
    const utc = naiveToUtc(naive, "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2024-01-01T06:30:00.123Z");
  });

  it("preserves the millisecond fraction for the UTC identity case", () => {
    const naive = new Date(Date.UTC(2024, 0, 1, 12, 0, 0, 987));
    expect(naiveToUtc(naive, "UTC").getTime()).toBe(naive.getTime());
  });
});

describe("toPythonIsoString", () => {
  it("replaces the Z suffix with a zero-padded +00:00 offset", () => {
    const d = new Date("2024-01-01T06:30:00.123Z");
    expect(toPythonIsoString(d)).toBe("2024-01-01T06:30:00.123000+00:00");
  });

  it("pads a zero-millisecond timestamp to 6 digits", () => {
    const d = new Date("2024-01-01T00:00:00.000Z");
    expect(toPythonIsoString(d)).toBe("2024-01-01T00:00:00.000000+00:00");
  });
});
