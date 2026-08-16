import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError, ConflictError, RequestValidationError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { getCurrentUser } from "../../lib/users";
import { getOrCreateAsset } from "../../lib/jobs/ingestionRepo";
import { fetchAssetInfo, type AssetInfo } from "../../lib/watchlist/assetInfo";
import type { watchlists, WatchlistSymbol } from "../../generated/prisma";

export const watchlistRouter = Router();

type WatchlistWithSymbols = watchlists & { watchlistSymbols: WatchlistSymbol[] };

// Port of _to_dict.
function serializeWatchlist(wl: WatchlistWithSymbols, info: Map<string, AssetInfo>) {
  return {
    id: wl.id,
    name: wl.name,
    symbols: wl.watchlistSymbols.map((s) => ({
      symbol: s.symbol,
      alertPrice: s.alertPrice !== null ? Number(s.alertPrice) : null,
      ...(info.get(s.symbol) ?? {}),
    })),
    created_at: wl.created_at ? wl.created_at.toISOString() : null,
  };
}

async function serializeWithAssetInfo(wl: WatchlistWithSymbols) {
  const info = await fetchAssetInfo(wl.watchlistSymbols.map((s) => s.symbol));
  return serializeWatchlist(wl, info);
}

async function getWatchlistOr404(watchlistId: string, userId: string): Promise<WatchlistWithSymbols> {
  requireUuidParam(watchlistId, "watchlist_id");
  const wl = await prisma.watchlists.findUnique({
    where: { id: watchlistId },
    include: { watchlistSymbols: true },
  });
  if (!wl || wl.user_id !== userId) throw new NotFoundError("Watchlist not found");
  return wl;
}

function findSymbolOr404(wl: WatchlistWithSymbols, symbol: string): WatchlistSymbol {
  const upper = symbol.toUpperCase();
  const ws = wl.watchlistSymbols.find((s) => s.symbol === upper);
  if (!ws) throw new NotFoundError(`Symbol ${symbol} not in watchlist`);
  return ws;
}

// Port of WatchlistService.list_watchlists.
watchlistRouter.get("/", async (_req, res) => {
  const user = await getCurrentUser();
  const rows = await prisma.watchlists.findMany({
    where: { user_id: user.id },
    include: { watchlistSymbols: true },
  });
  const allSymbols = [...new Set(rows.flatMap((w) => w.watchlistSymbols.map((s) => s.symbol)))];
  const info = await fetchAssetInfo(allSymbols);
  res.json(rows.map((w) => serializeWatchlist(w, info)));
});

// Port of WatchlistService.create_watchlist.
watchlistRouter.post("/", async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== "string" || name.length < 1) {
    throw new RequestValidationError("name is required");
  }
  const user = await getCurrentUser();
  const existing = await prisma.watchlists.findFirst({ where: { user_id: user.id, name } });
  if (existing) throw new ConflictError(`Watchlist '${name}' already exists`);

  const now = new Date();
  const wl = await prisma.watchlists.create({
    data: { id: uuidv4(), user_id: user.id, name, created_at: now, updated_at: now },
    include: { watchlistSymbols: true },
  });
  res.status(201).json(await serializeWithAssetInfo(wl));
});

// Port of WatchlistService.rename_watchlist.
watchlistRouter.put("/:id", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  const name = req.body?.name;
  if (typeof name !== "string" || name.length < 1) {
    throw new RequestValidationError("name is required");
  }

  const existing = await prisma.watchlists.findFirst({ where: { user_id: user.id, name } });
  if (existing && existing.id !== wl.id) throw new ConflictError(`Watchlist '${name}' already exists`);

  const updated = await prisma.watchlists.update({
    where: { id: wl.id },
    data: { name, updated_at: new Date() },
    include: { watchlistSymbols: true },
  });
  res.json(await serializeWithAssetInfo(updated));
});

// Port of WatchlistService.delete_watchlist. Deliberately no last-watchlist
// guard — Python's delete_watchlist deletes unconditionally after the
// ownership/404 check; that safeguard exists only in the frontend
// (Watchlist.jsx disables the menu item when total <= 1), not server-side.
watchlistRouter.delete("/:id", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  await prisma.watchlists.delete({ where: { id: wl.id } });
  res.status(204).send();
});

// Port of WatchlistService.add_symbol.
watchlistRouter.post("/:id/symbols", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  const symbol = req.body?.symbol;
  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    throw new RequestValidationError("symbol is required");
  }
  const symUpper = symbol.toUpperCase().trim();

  if (wl.watchlistSymbols.some((s) => s.symbol === symUpper)) {
    throw new ConflictError(`${symUpper} is already in the watchlist`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.watchlistSymbol.create({
      data: { id: uuidv4(), watchlistId: wl.id, symbol: symUpper, createdAt: new Date() },
    });
    await getOrCreateAsset(tx, symUpper);
    return tx.watchlists.findUniqueOrThrow({ where: { id: wl.id }, include: { watchlistSymbols: true } });
  });
  res.json(await serializeWithAssetInfo(updated));
});

// Port of WatchlistService.remove_symbol.
watchlistRouter.delete("/:id/symbols/:symbol", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  const ws = findSymbolOr404(wl, req.params.symbol);

  await prisma.watchlistSymbol.delete({ where: { id: ws.id } });
  const updated = await prisma.watchlists.findUniqueOrThrow({ where: { id: wl.id }, include: { watchlistSymbols: true } });
  res.json(await serializeWithAssetInfo(updated));
});

// Port of WatchlistService.set_alert.
watchlistRouter.put("/:id/symbols/:symbol/alert", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  const ws = findSymbolOr404(wl, req.params.symbol);
  const price = req.body?.price;
  if (typeof price !== "number" || Number.isNaN(price)) {
    throw new RequestValidationError("price is required and must be a number");
  }

  const quote = await prisma.latestQuote.findUnique({ where: { symbol: ws.symbol } });
  const current = quote?.price !== undefined && quote?.price !== null ? Number(quote.price) : null;
  const direction = current === null || price >= current ? "gte" : "lte";

  await prisma.watchlistSymbol.update({
    where: { id: ws.id },
    data: { alertPrice: price, alertDirection: direction, alertTriggered: false },
  });
  const updated = await prisma.watchlists.findUniqueOrThrow({ where: { id: wl.id }, include: { watchlistSymbols: true } });
  res.json(await serializeWithAssetInfo(updated));
});

// Port of WatchlistService.clear_alert.
watchlistRouter.delete("/:id/symbols/:symbol/alert", async (req, res) => {
  const user = await getCurrentUser();
  const wl = await getWatchlistOr404(req.params.id, user.id);
  const ws = findSymbolOr404(wl, req.params.symbol);

  await prisma.watchlistSymbol.update({
    where: { id: ws.id },
    data: { alertPrice: null, alertDirection: null, alertTriggered: false },
  });
  const updated = await prisma.watchlists.findUniqueOrThrow({ where: { id: wl.id }, include: { watchlistSymbols: true } });
  res.json(await serializeWithAssetInfo(updated));
});
