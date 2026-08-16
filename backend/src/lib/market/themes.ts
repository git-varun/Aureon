import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError } from "../errors";
import { SYSTEM_THEMES, type SystemTheme } from "./constants";
import { pyRound } from "./round";
import { classify } from "./classify";

export interface CustomTheme {
  id: string;
  name: string;
  desc: string;
  symbols: string[];
  weights: Record<string, number>;
  inception_date: string | null;
  ret1m: number;
  count: number;
  owner_id: string;
  forked_from: string | null;
}

/** Port of the custom-themes half of app/api/dependencies.py
 * serialize_user_profile — the user-preferences half isn't needed by any
 * market endpoint, so only this part is ported here. */
export async function getCustomThemesForUser(userId: string): Promise<Record<string, CustomTheme>> {
  const themes = await prisma.market_themes.findMany({ where: { owner_id: userId } });
  const result: Record<string, CustomTheme> = {};
  for (const t of themes) {
    const weightRows = await prisma.theme_weights.findMany({ where: { theme_id: t.theme_id } });
    const weights: Record<string, number> = {};
    for (const w of weightRows) weights[w.symbol] = Number(w.weight);

    const symbols = Array.isArray(t.symbols) ? (t.symbols as unknown[]).map(String) : [];
    result[t.theme_id] = {
      id: t.theme_id,
      name: t.name,
      desc: t.desc,
      symbols,
      weights,
      inception_date: t.inception_date,
      ret1m: Number(t.ret1m),
      count: symbols.length,
      owner_id: userId,
      forked_from: t.forked_from,
    };
  }
  return result;
}

type ResolvedTheme = SystemTheme | CustomTheme;

function resolveTheme(themeId: string, customThemes: Record<string, CustomTheme>): ResolvedTheme | null {
  if (themeId in SYSTEM_THEMES) return SYSTEM_THEMES[themeId];
  return customThemes[themeId] ?? null;
}

async function getQuoteAndAsset(symbol: string) {
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  return { quote, asset };
}

export interface ThemeNavResult {
  theme_id: string;
  span_days: number;
  nav: number[];
  base: number;
  data_points: number;
}

/** Port of MarketService.get_theme_nav. */
export async function getThemeNav(
  themeId: string,
  days: number,
  customThemes: Record<string, CustomTheme>,
): Promise<ThemeNavResult> {
  const theme = resolveTheme(themeId, customThemes);
  if (!theme) throw new NotFoundError("Theme not found");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const weights = theme.weights ?? {};
  const perSymbolSeries: Record<string, Record<string, number>> = {};

  for (const sym of theme.symbols) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: sym } });
    if (!quote || !quote.assetId) continue;
    const rows = await prisma.priceHistory.findMany({
      where: { assetId: quote.assetId, timestamp: { gte: cutoff } },
      orderBy: { timestamp: "asc" },
    });
    if (rows.length === 0) continue;
    const byDate: Record<string, number> = {};
    for (const r of rows) byDate[r.timestamp.toISOString().slice(0, 10)] = Number(r.price);
    perSymbolSeries[sym] = byDate;
  }

  if (Object.keys(perSymbolSeries).length === 0) {
    throw new NotFoundError("No price history available for this theme's constituents yet");
  }

  const availableWeightTotal =
    Object.keys(perSymbolSeries).reduce((sum, sym) => sum + (weights[sym] ?? 0.0), 0) || 1.0;
  const normWeights: Record<string, number> = {};
  for (const sym of Object.keys(perSymbolSeries)) normWeights[sym] = (weights[sym] ?? 0.0) / availableWeightTotal;

  const dateAxisSet = new Set<string>();
  for (const series of Object.values(perSymbolSeries)) for (const d of Object.keys(series)) dateAxisSet.add(d);
  const dateAxis = [...dateAxisSet].sort();

  // Back-fill each symbol flat before its first real sample, forward-fill
  // gaps after — keeps every symbol's weight contributing across the whole
  // axis so a constituent that was only just seeded doesn't cause an
  // artificial jump when its weight silently switches from absent to
  // present partway through the series.
  const filledSeries: Record<string, Record<string, number>> = {};
  for (const [sym, series] of Object.entries(perSymbolSeries)) {
    const firstKey = Object.keys(series).sort()[0];
    let last = series[firstKey];
    const filled: Record<string, number> = {};
    for (const date of dateAxis) {
      if (date in series) last = series[date];
      filled[date] = last;
    }
    filledSeries[sym] = filled;
  }

  const basePrice: Record<string, number> = {};
  for (const [sym, series] of Object.entries(filledSeries)) basePrice[sym] = series[dateAxis[0]];

  const nav: number[] = [];
  for (const date of dateAxis) {
    let composite = 0;
    for (const sym of Object.keys(filledSeries)) {
      composite += normWeights[sym] * (filledSeries[sym][date] / basePrice[sym]);
    }
    nav.push(pyRound(composite * 100, 4));
  }

  const spanDays = Math.round(
    (Date.parse(dateAxis[dateAxis.length - 1]) - Date.parse(dateAxis[0])) / (24 * 60 * 60 * 1000),
  );

  return { theme_id: themeId, span_days: spanDays, nav, base: 100, data_points: nav.length };
}

/** Port of MarketService._compute_ret1m. Real 1-month time-weighted return
 * from getThemeNav's price-history composite. None (not 0.0) when
 * constituents have no price history yet, or the series doesn't span most
 * of the 30-day window (24+ days). */
async function computeRet1m(themeId: string, customThemes: Record<string, CustomTheme>): Promise<number | null> {
  let navResult: ThemeNavResult;
  try {
    navResult = await getThemeNav(themeId, 30, customThemes);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
  const nav = navResult.nav ?? [];
  if (nav.length < 2 || (navResult.span_days ?? 0) < 24) return null;
  const base = navResult.base ?? 100;
  return pyRound(nav[nav.length - 1] / base - 1, 4);
}

export interface ThemeListEntry {
  id: string;
  name: string;
  desc: string;
  ret1m: number | null;
  count: number;
  inception_date: string | null;
  owner_id: string | null;
  forked_from?: string | null;
}

/** Port of MarketService.list_themes. */
export async function listThemes(
  customThemes: Record<string, CustomTheme>,
  userId: string,
): Promise<{ system: ThemeListEntry[]; mine: ThemeListEntry[] }> {
  const mine: ThemeListEntry[] = [];
  for (const row of Object.values(customThemes)) {
    mine.push({
      id: row.id,
      name: row.name,
      desc: row.desc,
      ret1m: await computeRet1m(row.id, customThemes),
      count: row.symbols.length,
      inception_date: row.inception_date,
      owner_id: userId,
      forked_from: row.forked_from,
    });
  }

  const system: ThemeListEntry[] = [];
  for (const row of Object.values(SYSTEM_THEMES)) {
    system.push({
      id: row.id,
      name: row.name,
      desc: row.desc,
      ret1m: await computeRet1m(row.id, customThemes),
      count: row.count,
      inception_date: row.inception_date,
      owner_id: null,
    });
  }

  return { system, mine };
}

export interface ThemeConstituent {
  sym: string;
  name: string;
  price: number;
  rsi: number;
  sector: string | null;
  class: string;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Port of MarketService.get_theme_detail. Preserves Python's fabricated
 * fallback constants (price=100.0, rsi=50.0) verbatim when real data is
 * missing — an existing no-fake-data violation inherited from the Python
 * source, not introduced here; changing it would diverge from the live
 * Python response this port must match. */
export async function getThemeDetail(
  themeId: string,
  customThemes: Record<string, CustomTheme>,
): Promise<Record<string, unknown>> {
  const theme = resolveTheme(themeId, customThemes);
  if (!theme) throw new NotFoundError("Theme not found");

  const constituents: ThemeConstituent[] = [];
  for (const sym of theme.symbols) {
    const { quote, asset } = await getQuoteAndAsset(sym);
    const price = quote && quote.price !== null ? Number(quote.price) : 100.0;
    const name = asset ? asset.name : sym;
    // Port of Python's `metadata.get("sector") if isinstance(metadata, dict)
    // else "General"` — deliberately NOT the same "General" default used by
    // search()/get_universe() below: here, a dict with no "sector" key
    // yields null, and "General" only applies when metadata itself isn't a
    // dict (asset.metadata_payload column is SQL NULL).
    const metadata: unknown = asset ? asset.metadata : {};
    const sector: string | null = isPlainObjectRecord(metadata)
      ? ((metadata.sector as string | undefined) ?? null)
      : "General";

    const snap = quote?.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
    const rsi = snap && snap.rsi !== null ? Number(snap.rsi) : 50.0;

    constituents.push({
      sym,
      name,
      price,
      rsi,
      sector,
      class: classify(asset ? asset.assetClass : "equity", sym),
    });
  }

  return {
    id: theme.id,
    name: theme.name,
    desc: theme.desc,
    symbols: theme.symbols,
    weights: theme.weights,
    inception_date: theme.inception_date,
    ret1m: await computeRet1m(themeId, customThemes),
    constituents,
  };
}

export interface ThemeSignalsResult {
  rsi: number;
  macd: null;
  adx: null;
  conf: number;
  trend: string;
}

/** Port of MarketService.get_theme_signals. Preserves Python's fabricated
 * avg_rsi=55.0 fallback verbatim (see getThemeDetail's docstring — same
 * inherited no-fake-data violation, not introduced here). macd/adx are
 * genuinely null in Python too (BACKLOG comment there), not a Node gap. */
export async function getThemeSignals(
  themeId: string,
  customThemes: Record<string, CustomTheme>,
): Promise<ThemeSignalsResult> {
  const theme = resolveTheme(themeId, customThemes);
  if (!theme) throw new NotFoundError("Theme not found");

  const rsis: number[] = [];
  for (const sym of theme.symbols) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: sym } });
    if (quote?.assetId) {
      const snap = await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } });
      if (snap && snap.rsi !== null) rsis.push(Number(snap.rsi));
    }
  }

  const avgRsi = rsis.length > 0 ? rsis.reduce((a, b) => a + b, 0) / rsis.length : 55.0;
  const trend = avgRsi > 55 ? "Bullish" : avgRsi < 45 ? "Bearish" : "Neutral";
  // Python: min(90, max(50, int(50 + abs(avg_rsi - 50)))) — int() truncates
  // toward zero, not Math.round.
  const conf = Math.min(90, Math.max(50, Math.trunc(50 + Math.abs(avgRsi - 50))));

  return { rsi: pyRound(avgRsi, 1), macd: null, adx: null, conf, trend };
}

/** Port of MarketService.fork_theme. Returns the new theme_id — the route
 * re-fetches getCustomThemesForUser and serializes the fresh row, matching
 * Python's `serialize_user_profile(...)["custom_themes"][new_theme.theme_id]`. */
export async function forkTheme(
  themeId: string,
  newName: string,
  userId: string,
  customThemes: Record<string, CustomTheme>,
): Promise<string> {
  const theme = resolveTheme(themeId, customThemes);
  if (!theme) throw new NotFoundError("Theme not found");

  const newId = `fork-${uuidv4().replace(/-/g, "").slice(0, 8)}`;
  const ret1m = (await computeRet1m(themeId, customThemes)) ?? 0.0;
  const inceptionDate = new Date().toISOString().slice(0, 10);
  const now = new Date();

  await prisma.market_themes.create({
    data: {
      id: uuidv4(),
      theme_id: newId,
      name: newName,
      desc: `Forked from ${theme.name}`,
      symbols: [...theme.symbols],
      ret1m,
      owner_id: userId,
      forked_from: themeId,
      inception_date: inceptionDate,
      is_public: false,
      created_at: now,
      updated_at: now,
    },
  });

  for (const [sym, wt] of Object.entries(theme.weights)) {
    await prisma.theme_weights.create({
      data: {
        id: uuidv4(),
        theme_id: newId,
        symbol: sym,
        weight: wt,
        effective_date: inceptionDate,
        created_at: now,
      },
    });
  }

  return newId;
}

/** Port of MarketService.update_theme. Throws NotFoundError ("Not authorized
 * or theme not found") when the theme doesn't exist or isn't owned by
 * userId — the API route (not this function) maps that to 403, matching
 * Python's explicit HTTPException(403) in this one case. */
export async function updateTheme(
  themeId: string,
  name: string | null | undefined,
  weights: Record<string, number> | null | undefined,
  userId: string,
): Promise<void> {
  const theme = await prisma.market_themes.findFirst({ where: { theme_id: themeId, owner_id: userId } });
  if (!theme) throw new NotFoundError("Not authorized or theme not found");

  const updateData: Record<string, unknown> = {};
  if (name != null) updateData.name = name;
  if (weights != null) updateData.symbols = Object.keys(weights);

  if (Object.keys(updateData).length > 0) {
    await prisma.market_themes.update({ where: { id: theme.id }, data: updateData });
  }

  if (weights != null) {
    await prisma.theme_weights.deleteMany({ where: { theme_id: themeId } });
    const effectiveDate = theme.inception_date ?? new Date().toISOString().slice(0, 10);
    const now = new Date();
    for (const [sym, wt] of Object.entries(weights)) {
      await prisma.theme_weights.create({
        data: { id: uuidv4(), theme_id: themeId, symbol: sym, weight: wt, effective_date: effectiveDate, created_at: now },
      });
    }
  }
}

/** Port of MarketService.delete_theme. Same 403-via-NotFoundError contract
 * as updateTheme. */
export async function deleteTheme(themeId: string, userId: string): Promise<void> {
  const theme = await prisma.market_themes.findFirst({ where: { theme_id: themeId, owner_id: userId } });
  if (!theme) throw new NotFoundError("Not authorized or theme not found");

  await prisma.theme_weights.deleteMany({ where: { theme_id: themeId } });
  await prisma.market_themes.delete({ where: { id: theme.id } });
}

/** Port of MarketService.get_themes_for_symbol. */
export function getThemesForSymbol(symbolRaw: string, customThemes: Record<string, CustomTheme>): string[] {
  const symbol = symbolRaw.toUpperCase().trim();
  const matched: string[] = [];
  for (const t of Object.values(SYSTEM_THEMES)) {
    if (t.symbols.includes(symbol)) matched.push(t.name);
  }
  for (const t of Object.values(customThemes)) {
    if (t.symbols.includes(symbol)) matched.push(t.name);
  }
  return matched;
}

export { resolveTheme, computeRet1m };
