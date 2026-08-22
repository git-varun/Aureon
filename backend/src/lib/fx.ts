import Redis from "ioredis";
import { logger } from "./logger";
import { prisma } from "../prisma";
import { v4 as uuidv4 } from "uuid";

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

/** Point-in-time INR rate for `currency` on `date` — unlike toInr (always
 * today's live/cached rate), this looks up what the rate actually was on a
 * specific past date, via Frankfurter (free, no key, ECB rates back to
 * 1999, includes INR). Persisted into fx_rate_history for reuse. Returns
 * null (never throws) if the date has no rate (e.g. before Frankfurter's
 * coverage starts, or a weekend/holiday with no ECB fixing) or the request
 * fails — callers must degrade explicitly, not assume a rate exists. */
export async function getHistoricalFxToInr(currency: string, date: Date): Promise<number | null> {
  if (currency === "INR") return 1.0;

  const dateOnly = date.toISOString().slice(0, 10);
  try {
    const existing = await prisma.fx_rate_history.findUnique({
      where: { currency_date: { currency, date: new Date(dateOnly) } },
    });
    if (existing) return Number(existing.rate_to_inr);

    const res = await fetch(`https://api.frankfurter.app/${dateOnly}?from=${currency}&to=INR`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.INR;
    if (!rate) throw new Error(`Frankfurter returned no INR rate for ${currency} on ${dateOnly}`);

    await prisma.fx_rate_history.create({
      data: { id: uuidv4(), currency, date: new Date(dateOnly), rate_to_inr: rate, created_at: new Date() },
    });
    return rate;
  } catch (e) {
    logger.warn({ operation: "get_historical_fx_to_inr", currency, date: dateOnly, err: e }, "historical_fx_lookup_failed");
    return null;
  }
}
