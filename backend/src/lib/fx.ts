import Redis from "ioredis";
import { logger } from "./logger";

// Own client, same pattern as portfolioCache.ts / queue.ts.
const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "fx: redis connection error"));

/** Port of app/core/fx.py FX_TO_INR — same key ("fx:rates") and 3600s TTL as
 * Python's cache_fx_rates/get_cached_fx_rates, so both backends share one
 * cached rate set instead of racing independent fetches. */
const FX_TO_INR: Record<string, number> = {
  INR: 1.0,
  USD: 83.2,
  EUR: 90.6,
  GBP: 105.4,
  AED: 22.65,
  JPY: 1 / 1.78,
  HKD: 10.65,
  CHF: 103.9,
  SEK: 8.8,
  DKK: 12.15,
  NOK: 8.2,
};

function getFxRatesKey(): string {
  return "fx:rates";
}

async function cacheFxRates(rates: Record<string, number>): Promise<void> {
  try {
    await redis.setex(getFxRatesKey(), 3600, JSON.stringify(rates));
  } catch (e) {
    logger.warn({ operation: "cache_fx_rates", key: getFxRatesKey(), err: e }, "redis_operation_failed");
  }
}

async function getCachedFxRates(): Promise<Record<string, number> | null> {
  try {
    const data = await redis.get(getFxRatesKey());
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object") return result as Record<string, number>;
    }
  } catch (e) {
    logger.warn({ operation: "get_cached_fx_rates", key: getFxRatesKey(), err: e }, "redis_operation_failed");
  }
  return null;
}

async function fetchLiveFxRates(): Promise<Record<string, number>> {
  const res = await fetch("https://open.er-api.com/v6/latest/INR", { signal: AbortSignal.timeout(5000) });
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
  const liveRates = data.rates;
  if (data.result !== "success" || !liveRates) {
    throw new Error("open.er-api.com returned no usable rates");
  }
  const rates: Record<string, number> = { INR: 1.0 };
  for (const ccy of Object.keys(FX_TO_INR)) {
    if (ccy !== "INR" && liveRates[ccy]) rates[ccy] = 1.0 / liveRates[ccy];
  }
  return rates;
}

async function getFxRates(): Promise<Record<string, number>> {
  const cached = await getCachedFxRates();
  if (cached) return cached;
  let rates: Record<string, number>;
  try {
    rates = await fetchLiveFxRates();
  } catch (e) {
    logger.warn({ operation: "fetch_live_fx_rates", err: e }, "fx_live_rate_fetch_failed");
    return FX_TO_INR;
  }
  await cacheFxRates(rates);
  return rates;
}

/** Port of app/core/fx.py to_inr. */
export async function toInr(amount: number, currency: string): Promise<number> {
  const rates = await getFxRates();
  return amount * (rates[currency] ?? FX_TO_INR[currency] ?? 1.0);
}
