import { describe, it, expect } from "vitest";
import { spotRefTradingPair } from "./brokerSync";

describe("spotRefTradingPair (BUG-Q — backfill candidate seeding)", () => {
  // The exact set of distinct spot: broker_reference kinds live in this
  // account's portfolio.transactions (2026-09-06): 7 real pairs + 2 event types.
  const realPairRefs = [
    "spot:BTCUSDT:1976675271",
    "spot:ETHUSDT:1011070993",
    "spot:LINKUSDT:246391327",
    "spot:CRVUSDT:154263277",
    "spot:UNIUSDT:186942715",
    "spot:SUIUSDT:230597474",
    "spot:ATOMUSDT:218019284",
  ];
  const eventRefs = [
    "spot:dividend:363831684018",
    "spot:dust:buy:232453406190:ENA",
    "spot:dust:sell:232453406190:ENA",
    "spot:transfer:DEPOSIT:abc123",
  ];

  it("returns the trading pair for real spot trade references", () => {
    for (const ref of realPairRefs) {
      expect(spotRefTradingPair(ref)).toBe(ref.split(":")[1]);
    }
  });

  it("returns null for non-trade event references (transfer/dust/dividend)", () => {
    for (const ref of eventRefs) {
      expect(spotRefTradingPair(ref)).toBeNull();
    }
  });

  it("returns null for a malformed reference", () => {
    expect(spotRefTradingPair("spot:BTCUSDT")).toBeNull();
    expect(spotRefTradingPair("")).toBeNull();
  });
});
