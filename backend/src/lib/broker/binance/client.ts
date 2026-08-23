import { createHmac } from "crypto";
import { BinanceAuthError, RateLimitError } from "../../errors";
import { SPOT_TRADE_QUOTES } from "../binanceConstants";
import { logger } from "../../logger";

const BASE_URL = "https://api.binance.com";
const FAPI_URL = "https://fapi.binance.com";
const DAPI_URL = "https://dapi.binance.com";

// Binance futures trade-history endpoints (fapi/dapi userTrades) reject a
// startTime/endTime span over 7 days — a regular sync window bounded by
// "since last captured trade" must be chunked into windows this size or
// smaller when the app has been offline longer than that.
const FUTURES_TRADE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Binance's /sapi/v1/asset/assetDividend endpoint rejects a startTime/endTime
// span of "more than 180 days" (-1108) — using 179 days here to stay clear of
// the exact boundary rather than betting on whether 180 is inclusive.
const ASSET_DIVIDEND_WINDOW_MS = 179 * 24 * 60 * 60 * 1000;

// Binance's "invalid symbol" error code — returned as HTTP 400 when a probed
// candidate pair doesn't actually exist. Not an auth failure, safe to skip.
const INVALID_SYMBOL_CODE = -1121;

// Pairs already confirmed non-existent on Binance — a symbol's existence is
// global, not per-account, so this is safe to cache for the worker process's
// lifetime and skip re-probing on every future sync.
const knownInvalidSpotPairs = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BinanceHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Binance HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** Port of BinanceClient (app/modules/portfolio/providers/broker/binance/
 * provider.py). Thin REST client covering Spot, Simple Earn, and USDⓈ-M/
 * COIN-M Futures wallets. */
export class BinanceClient {
  apiKey: string;
  apiSecret: string;
  private spotSymbols: Set<string> | null = null;
  private coinmContractSizes: Record<string, number> | null = null;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async signedGet(path: string, params: Record<string, string | number> = {}, baseUrl = BASE_URL): Promise<unknown> {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(Date.now()) });
    const signature = createHmac("sha256", this.apiSecret).update(query.toString()).digest("hex");
    query.set("signature", signature);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}?${query.toString()}`, {
        headers: { "X-MBX-APIKEY": this.apiKey },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new BinanceAuthError(`Binance request failed: ${(e as Error).message}`);
    }

    if (res.status === 401) throw new BinanceAuthError("Binance rejected the API key/secret");
    if (res.status === 429) throw new RateLimitError("Binance rate limited the request — try again later");
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // no JSON body
      }
      throw new BinanceHttpError(res.status, body);
    }
    return res.json();
  }

  /** Like signedGet, but tolerates Binance's "invalid symbol" error (a probed
   * trade-history candidate that doesn't exist as a real pair) by returning
   * null instead of throwing. Auth failures still throw. */
  private async signedGetOptional(path: string, params: Record<string, string | number> = {}, baseUrl = BASE_URL): Promise<unknown> {
    try {
      return await this.signedGet(path, params, baseUrl);
    } catch (e) {
      if (e instanceof BinanceHttpError && e.status === 400) {
        const body = e.body as { code?: number } | null;
        if (body?.code === INVALID_SYMBOL_CODE) return null;
      }
      throw e;
    }
  }

  async getAccount(): Promise<Record<string, unknown>> {
    return (await this.signedGet("/api/v3/account")) as Record<string, unknown>;
  }

  /** Non-zero spot balances — Binance's /account endpoint reports every
   * listed asset (mostly zero balances), so filter down to holdings. */
  async getBalances(): Promise<Array<Record<string, unknown>>> {
    const account = await this.getAccount();
    const balances = (account.balances as Array<Record<string, unknown>>) ?? [];
    return balances.filter((b) => Number(b.free ?? 0) + Number(b.locked ?? 0) > 0);
  }

  async getEarnFlexiblePositions(): Promise<Array<Record<string, unknown>>> {
    const rows = (await this.signedGet("/sapi/v1/simple-earn/flexible/position")) as { rows?: Array<Record<string, unknown>> };
    return rows.rows ?? [];
  }

  async getEarnLockedPositions(): Promise<Array<Record<string, unknown>>> {
    const rows = (await this.signedGet("/sapi/v1/simple-earn/locked/position")) as { rows?: Array<Record<string, unknown>> };
    return rows.rows ?? [];
  }

  async getFuturesUsdmPositions(): Promise<Array<Record<string, unknown>>> {
    const positions = ((await this.signedGet("/fapi/v2/positionRisk", {}, FAPI_URL)) as Array<Record<string, unknown>>) ?? [];
    return positions.filter((p) => Number(p.positionAmt ?? 0) !== 0);
  }

  /** contractSize per COIN-M symbol (e.g. BTCUSD_PERP -> 100) from Binance's
   * public dapi exchangeInfo — a COIN-M position's positionAmt is
   * denominated in contracts, not coins. Public/unsigned, cached on this
   * client instance for the lifetime of one sync run. */
  async getCoinmContractSizes(): Promise<Record<string, number>> {
    if (this.coinmContractSizes !== null) return this.coinmContractSizes;
    try {
      const res = await fetch(`${DAPI_URL}/dapi/v1/exchangeInfo`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { symbols?: Array<Record<string, unknown>> };
      const sizes: Record<string, number> = {};
      for (const s of data.symbols ?? []) {
        if (s.symbol && s.contractSize !== undefined && s.contractSize !== null) {
          sizes[s.symbol as string] = Number(s.contractSize);
        }
      }
      this.coinmContractSizes = sizes;
      return sizes;
    } catch (e) {
      logger.warn({ provider: "binance", operation: "coinm_exchange_info", err: e }, "exchangeInfo fetch failed");
      return {};
    }
  }

  async getFuturesCoinmPositions(): Promise<Array<Record<string, unknown>>> {
    let positions = ((await this.signedGet("/dapi/v1/positionRisk", {}, DAPI_URL)) as Array<Record<string, unknown>>) ?? [];
    positions = positions.filter((p) => Number(p.positionAmt ?? 0) !== 0);
    if (positions.length > 0) {
      const contractSizes = await this.getCoinmContractSizes();
      for (const p of positions) {
        p.contractSize = contractSizes[String(p.symbol ?? "").toUpperCase()] ?? null;
      }
    }
    return positions;
  }

  /** All symbols Binance's Spot exchange currently knows about. Public,
   * unsigned. Cached on this client instance for the lifetime of one sync
   * run. Returns null (caller should fall back to per-symbol probing) if the
   * fetch itself fails. */
  async getValidSpotSymbols(): Promise<Set<string> | null> {
    if (this.spotSymbols !== null) return this.spotSymbols;
    try {
      const res = await fetch(`${BASE_URL}/api/v3/exchangeInfo`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { symbols?: Array<Record<string, unknown>> };
      this.spotSymbols = new Set((data.symbols ?? []).map((s) => s.symbol as string).filter(Boolean));
      return this.spotSymbols;
    } catch (e) {
      logger.warn({ provider: "binance", operation: "spot_exchange_info", err: e }, "exchangeInfo fetch failed, falling back to per-symbol probing");
      return null;
    }
  }

  async getSpotTrades(symbol: string, startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    if (knownInvalidSpotPairs.has(symbol)) return [];
    // myTrades accepts symbol+startTime with no endTime (no 24h span cap
    // applies unless both are sent) — so a single call from the last
    // captured trade's time forward is sufficient for a regular sync; only an
    // unbounded/no-startTime call is capped at Binance's default 500
    // most-recent trades.
    const params: Record<string, string | number> = { symbol };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/api/v3/myTrades", params)) as Array<Record<string, unknown>> | null;
    if (result === null) {
      knownInvalidSpotPairs.add(symbol);
      return [];
    }
    return result;
  }

  /** Shared windowing for fapi/dapi userTrades: Binance rejects a
   * startTime/endTime span over 7 days, so a gap since the last captured
   * trade longer than that is walked in <=7-day chunks and concatenated.
   * With no startTimeMs (first-ever sync), falls through to Binance's
   * default (last 7 days). */
  private async getFuturesTradesWindowed(
    path: string,
    paramKey: string,
    symbolOrPair: string,
    baseUrl: string,
    startTimeMs: number | null | undefined,
    endTimeMs: number | null | undefined,
  ): Promise<Array<Record<string, unknown>>> {
    if (startTimeMs === undefined || startTimeMs === null) {
      const result = (await this.signedGetOptional(path, { [paramKey]: symbolOrPair }, baseUrl)) as Array<Record<string, unknown>> | null;
      return result ?? [];
    }

    const end = endTimeMs ?? Date.now();
    const trades: Array<Record<string, unknown>> = [];
    let windowStart = startTimeMs;
    while (windowStart < end) {
      const windowEnd = Math.min(windowStart + FUTURES_TRADE_WINDOW_MS, end);
      const page = (await this.signedGetOptional(
        path,
        { [paramKey]: symbolOrPair, startTime: windowStart, endTime: windowEnd },
        baseUrl,
      )) as Array<Record<string, unknown>> | null;
      trades.push(...(page ?? []));
      windowStart = windowEnd;
    }
    return trades;
  }

  async getFuturesUsdmTrades(symbol: string, startTimeMs?: number | null, endTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getFuturesTradesWindowed("/fapi/v1/userTrades", "symbol", symbol, FAPI_URL, startTimeMs, endTimeMs);
  }

  async getFuturesCoinmTrades(pair: string, startTimeMs?: number | null, endTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getFuturesTradesWindowed("/dapi/v1/userTrades", "pair", pair, DAPI_URL, startTimeMs, endTimeMs);
  }

  /** Binance income history (/fapi/v1/income, /dapi/v1/income) — realized
   * PnL, funding fees, commission, and other account-level income events.
   * Unlike userTrades, income history has no documented 7-day span cap, but
   * is capped at 1000 rows per call — paginated forward by time when a page
   * fills, since a long-idle app could have more than 1000 events in the
   * gap since last sync. With no startTimeMs (first-ever sync), falls
   * through to Binance's default (recent history only; full backfill is out
   * of scope for this wave, matching backfillBinanceSpot's spot-only scope). */
  async getFuturesUsdmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getIncomeHistoryPaged("/fapi/v1/income", FAPI_URL, startTimeMs);
  }

  async getFuturesCoinmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getIncomeHistoryPaged("/dapi/v1/income", DAPI_URL, startTimeMs);
  }

  private async getIncomeHistoryPaged(
    path: string,
    baseUrl: string,
    startTimeMs: number | null | undefined,
  ): Promise<Array<Record<string, unknown>>> {
    const limit = 1000;
    const events: Array<Record<string, unknown>> = [];
    let windowStart = startTimeMs ?? undefined;
    for (;;) {
      const params: Record<string, string | number> = { limit };
      if (windowStart !== undefined) params.startTime = windowStart;
      const page = (await this.signedGetOptional(path, params, baseUrl)) as Array<Record<string, unknown>> | null;
      const rows = page ?? [];
      events.push(...rows);
      if (rows.length < limit) break;
      const lastTime = Math.max(...rows.map((r) => Number(r.time ?? 0)));
      if (!Number.isFinite(lastTime) || lastTime <= 0) break;
      windowStart = lastTime + 1;
    }
    return events;
  }

  /** /sapi/v1/capital/deposit/hisrec — external deposit history. Capped at
   * 1000 rows per call by Binance; a gap with more than 1000 deposits since
   * last sync would silently truncate (accepted limitation for this wave —
   * deposits are comparatively rare events, unlike trades/income). */
  async getDepositHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string | number> = { limit: 1000 };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/sapi/v1/capital/deposit/hisrec", params)) as Array<
      Record<string, unknown>
    > | null;
    return result ?? [];
  }

  /** /sapi/v1/capital/withdraw/history — external withdrawal history. Same
   * 1000-row-per-call cap and accepted limitation as getDepositHistory. */
  async getWithdrawHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string | number> = { limit: 1000 };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/sapi/v1/capital/withdraw/history", params)) as Array<
      Record<string, unknown>
    > | null;
    return result ?? [];
  }

  /** /sapi/v1/asset/dribblet — small-balance ("dust") auto-conversions to
   * BNB. Flattens Binance's nested userAssetDribblets/userAssetDribbletDetails
   * shape into one row per (operation, fromAsset) detail line, each carrying
   * its parent operation's transId/operateTime so importBrokerEvents can
   * derive both the SELL-fromAsset and BUY-BNB legs from it. */
  async getDustLog(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/sapi/v1/asset/dribblet")) as {
      userAssetDribblets?: Array<{
        operateTime?: number;
        transId?: number | string;
        totalTransferedAmount?: string;
        userAssetDribbletDetails?: Array<Record<string, unknown>>;
      }>;
    };
    const flattened: Array<Record<string, unknown>> = [];
    for (const op of result.userAssetDribblets ?? []) {
      for (const detail of op.userAssetDribbletDetails ?? []) {
        flattened.push({ ...detail, operateTime: op.operateTime, operationTransId: op.transId, totalTransferedAmount: op.totalTransferedAmount });
      }
    }
    return flattened;
  }

  /** /sapi/v1/asset/assetDividend — airdrops/dividends credited to the
   * account. Capped at 500 rows per call (Binance's max limit param); same
   * accepted truncation limitation as deposit/withdraw history. Binance
   * rejects a startTime with no endTime (-1102 "Mandatory parameter
   * 'endTime' was not sent"), so endTime must always be sent alongside
   * startTime. Binance also rejects a startTime/endTime span over 180 days
   * (-1108), so a gap since the last captured dividend longer than that is
   * walked in <=179-day windows (ASSET_DIVIDEND_WINDOW_MS) and the rows from
   * each window are concatenated. With no startTimeMs (first-ever sync),
   * falls through to a single unwindowed call using Binance's default. */
  async getAssetDividend(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    if (startTimeMs === undefined || startTimeMs === null) {
      const result = (await this.signedGetOptional("/sapi/v1/asset/assetDividend", { limit: 500 })) as {
        rows?: Array<Record<string, unknown>>;
      } | null;
      return result?.rows ?? [];
    }

    const end = Date.now();
    if (end - startTimeMs <= ASSET_DIVIDEND_WINDOW_MS) {
      const result = (await this.signedGetOptional("/sapi/v1/asset/assetDividend", {
        limit: 500,
        startTime: startTimeMs,
        endTime: end,
      })) as { rows?: Array<Record<string, unknown>> } | null;
      return result?.rows ?? [];
    }

    const rows: Array<Record<string, unknown>> = [];
    let windowStart = startTimeMs;
    while (windowStart < end) {
      const windowEnd = Math.min(windowStart + ASSET_DIVIDEND_WINDOW_MS, end);
      const result = (await this.signedGetOptional("/sapi/v1/asset/assetDividend", {
        limit: 500,
        startTime: windowStart,
        endTime: windowEnd,
      })) as { rows?: Array<Record<string, unknown>> } | null;
      rows.push(...(result?.rows ?? []));
      windowStart = windowEnd;
    }
    return rows;
  }

  /** /fapi/v2/balance, /dapi/v1/balance — futures wallet cash/margin
   * balance per asset. Display-only (see broker_wallet_balances), not fed
   * into any P&L calculation. */
  async getFuturesUsdmBalance(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/fapi/v2/balance", {}, FAPI_URL)) as Array<Record<string, unknown>>;
    return result ?? [];
  }

  async getFuturesCoinmBalance(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/dapi/v1/balance", {}, DAPI_URL)) as Array<Record<string, unknown>>;
    return result ?? [];
  }

  /** {asset}{quote} for each common quote pair (SPOT_TRADE_QUOTES),
   * pre-filtered against exchangeInfo (fetched once per run) so only symbols
   * that actually exist on Binance are returned. */
  async getCandidateSpotSymbols(assets: Set<string>): Promise<string[]> {
    const candidates: string[] = [];
    for (const asset of assets) {
      for (const quote of SPOT_TRADE_QUOTES) {
        if (asset !== quote) candidates.push(`${asset}${quote}`);
      }
    }

    const validSymbols = await this.getValidSpotSymbols();
    const toPoll = validSymbols === null ? candidates : candidates.filter((c) => validSymbols.has(c));

    logger.info(
      { provider: "binance", candidatePairs: candidates.length, polled: toPoll.length, filteredOut: candidates.length - toPoll.length },
      "spot trade discovery",
    );
    return toPoll;
  }

  /** Best-effort trade history for currently-held assets — see
   * getCandidateSpotSymbols for how candidate pairs are derived. */
  async getSpotTradeCandidates(assets: Set<string>, startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const trades: Array<Record<string, unknown>> = [];
    for (const symbol of await this.getCandidateSpotSymbols(assets)) {
      trades.push(...(await this.getSpotTrades(symbol, startTimeMs)));
    }
    return trades;
  }

  /** One page of full Spot trade history for `symbol` via fromId-based
   * pagination (ascending trade-ID order, no time-window cap), used for
   * backfill's full-history walk rather than regular sync's "since last
   * capture" gap-fill. Retries with exponential backoff on Binance's
   * 429/rate-limit response; throws RateLimitError if still limited after
   * maxRetries. */
  async getSpotTradesPage(symbol: string, fromId: number, limit = 1000, maxRetries = 5): Promise<Array<Record<string, unknown>>> {
    if (knownInvalidSpotPairs.has(symbol)) return [];

    const params: Record<string, string | number> = { symbol, fromId, limit };
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = (await this.signedGetOptional("/api/v3/myTrades", params)) as Array<Record<string, unknown>> | null;
        if (result === null) {
          knownInvalidSpotPairs.add(symbol);
          return [];
        }
        return result;
      } catch (e) {
        if (!(e instanceof RateLimitError)) throw e;
        const wait = 2 ** attempt;
        logger.warn({ provider: "binance", operation: "backfill", symbol, fromId, waitSeconds: wait, attempt: attempt + 1, maxRetries }, "rate limited, backing off");
        await sleep(wait * 1000);
      }
    }
    throw new RateLimitError(`Binance rate limit persisted after ${maxRetries} retries for ${symbol}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccount();
      return true;
    } catch {
      return false;
    }
  }
}

export interface BinanceSyncData {
  spot: Array<Record<string, unknown>>;
  earn: Array<Record<string, unknown>>;
  futures_usdm: Array<Record<string, unknown>>;
  futures_coinm: Array<Record<string, unknown>>;
  trades: {
    spot: Array<Record<string, unknown>>;
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
  income: {
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
  deposits: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  dust: Array<Record<string, unknown>>;
  dividends: Array<Record<string, unknown>>;
  wallet_balances: {
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
}

/** Per-stream "since last sync" watermarks — each of these accumulates
 * independently of trade activity, so they can't share
 * fetchBinanceSyncData's single trade-derived `sinceMs`. USDⓈ-M and COIN-M
 * income are separate wallets, and deposits/withdrawals are separate
 * endpoints, so each gets its own watermark: a transient failure on one
 * (swallowed by tryFetch) must not have its missed window closed by a
 * sibling's newer rows. undefined for a stream means "no prior sync of this
 * stream" — falls through to Binance's own default window, same as sinceMs
 * does for trades. */
export interface BinanceSyncSince {
  incomeUsdm?: number | null;
  incomeCoinm?: number | null;
  deposits?: number | null;
  withdrawals?: number | null;
  dividends?: number | null;
}

/** Binance API keys are permissioned per product — Earn/Futures may not be
 * enabled even when Spot is. A permission-denied/4xx from one of these must
 * not take down the whole sync (Spot would otherwise be discarded too). */
async function tryFetch<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    logger.warn({ provider: "binance", operation: "sync", label, err: e }, "unavailable (likely missing API key permission)");
    return [];
  }
}

/** Port of BinanceBrokerProvider.sync(). `sinceMs`: the timestamp (ms) of the
 * most recently captured broker_trade for this broker, used to bound
 * trade-history fetches to the gap since the last successful sync instead of
 * relying on Binance's defaults (Spot: most-recent-500-ever; Futures:
 * last-7-days-ever). Undefined on a first-ever sync — falls through to those
 * same Binance defaults, since fetching full history is backfill's job. */
export async function fetchBinanceSyncData(
  client: BinanceClient,
  sinceMs?: number | null,
  since: BinanceSyncSince = {},
): Promise<BinanceSyncData> {
  // Spot is the base credential check — if this fails, the key/secret itself
  // is bad, and the whole sync should fail (propagates uncaught).
  const spot = await client.getBalances();
  const earn = [
    ...(await tryFetch("Simple Earn flexible", () => client.getEarnFlexiblePositions())),
    ...(await tryFetch("Simple Earn locked", () => client.getEarnLockedPositions())),
  ];
  const futuresUsdm = await tryFetch("USDⓈ-M Futures positions", () => client.getFuturesUsdmPositions());
  const futuresCoinm = await tryFetch("COIN-M Futures positions", () => client.getFuturesCoinmPositions());

  const heldAssets = new Set<string>();
  for (const b of spot) {
    const asset = String(b.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }
  for (const e of earn) {
    const asset = String(e.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }
  const spotTrades = heldAssets.size > 0 ? await client.getSpotTradeCandidates(heldAssets, sinceMs) : [];

  const futuresUsdmTrades: Array<Record<string, unknown>> = [];
  for (const pos of futuresUsdm) {
    const symbol = pos.symbol as string | undefined;
    if (symbol) futuresUsdmTrades.push(...(await client.getFuturesUsdmTrades(symbol, sinceMs)));
  }

  const futuresCoinmTrades: Array<Record<string, unknown>> = [];
  for (const pos of futuresCoinm) {
    // dapi userTrades is scoped by pair (e.g. "BTCUSD"), not the contract symbol.
    const pair = pos.pair as string | undefined;
    if (pair) futuresCoinmTrades.push(...(await client.getFuturesCoinmTrades(pair, sinceMs)));
  }

  const income = {
    futures_usdm: await tryFetch("USDⓈ-M Futures income", () => client.getFuturesUsdmIncome(since.incomeUsdm)),
    futures_coinm: await tryFetch("COIN-M Futures income", () => client.getFuturesCoinmIncome(since.incomeCoinm)),
  };
  const deposits = await tryFetch("Deposit history", () => client.getDepositHistory(since.deposits));
  const withdrawals = await tryFetch("Withdraw history", () => client.getWithdrawHistory(since.withdrawals));
  const dust = await tryFetch("Dust log", () => client.getDustLog());
  const dividends = await tryFetch("Asset dividend", () => client.getAssetDividend(since.dividends));
  const walletBalances = {
    futures_usdm: await tryFetch("USDⓈ-M Futures balance", () => client.getFuturesUsdmBalance()),
    futures_coinm: await tryFetch("COIN-M Futures balance", () => client.getFuturesCoinmBalance()),
  };

  return {
    spot,
    earn,
    futures_usdm: futuresUsdm,
    futures_coinm: futuresCoinm,
    trades: { spot: spotTrades, futures_usdm: futuresUsdmTrades, futures_coinm: futuresCoinmTrades },
    income,
    deposits,
    withdrawals,
    dust,
    dividends,
    wallet_balances: walletBalances,
  };
}
