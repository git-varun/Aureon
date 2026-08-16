import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import type { Prisma } from "../../generated/prisma";
import { ensureAssetExists } from "../assets";
import { recalculatePosition } from "../positions";
import { RequestValidationError, NotFoundError } from "../errors";

type Tx = Prisma.TransactionClient;

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export interface ManualAssetInput {
  name: string;
  assetClass: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  currentValue?: number;
  transactionDate?: Date;
  notes?: string;
  tier?: number;
}

/** Port of PortfolioService.create_manual_asset (called by the
 * POST /portfolios/{id}/manual-assets route). Tradeable (symbol+quantity+
 * price) vs lump-sum (current_value) determines both the transaction values
 * and the forced-INR currency rule — see the Python route's comment on
 * `currency=None if is_tradeable else "INR"`. */
export async function createManualAsset(
  tx: Tx,
  portfolioId: string,
  input: ManualAssetInput,
): Promise<{ symbol: string }> {
  const isTradeable = input.symbol !== undefined && input.quantity !== undefined && input.price !== undefined;
  if (!isTradeable && input.currentValue === undefined) {
    throw new RequestValidationError("current_value (or symbol, quantity, and price) is required");
  }

  const symbol = (isTradeable ? input.symbol! : (input.symbol ?? `MANUAL-${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`))
    .toUpperCase()
    .trim();
  const quantity = isTradeable ? input.quantity! : 1.0;
  const price = isTradeable ? input.price! : input.currentValue!;
  const currency = isTradeable ? null : "INR";

  const assetId = uuidv5(symbol, UUID_NAMESPACE_DNS);
  const existing = await tx.asset.findUnique({ where: { symbol } });
  if (!existing) {
    const metadata: Record<string, unknown> = { sector: "Manual" };
    if (currency) metadata.currency = currency;
    await tx.asset.create({
      data: {
        id: assetId,
        symbol,
        name: input.name,
        assetClass: input.assetClass,
        tier: input.tier ?? null,
        metadata: metadata as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } else if (input.tier !== undefined && existing.tier !== input.tier) {
    await tx.asset.update({ where: { symbol }, data: { tier: input.tier } });
  }

  // No `name` argument, matching Python's ensure_asset_exists(session, symbol_clean)
  // call here — the Asset row is already created/updated above; this only
  // guarantees the AssetSnapshot row exists.
  await ensureAssetExists(tx, symbol);

  await tx.transaction.create({
    data: {
      id: uuidv4(),
      portfolioId,
      symbol,
      assetId,
      transactionType: "BUY",
      quantity,
      price,
      transactionDate: input.transactionDate ?? new Date(),
      fees: 0,
      taxes: 0,
      notes: input.notes ?? "Manual asset creation",
      broker: "manual",
      kind: "trade",
      wallet: "spot",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await recalculatePosition(tx, portfolioId, symbol);

  return { symbol };
}

/** Port of PortfolioService.update_manual_valuation. Deliberately does NOT
 * call recalculatePosition — it writes the new unit price straight to
 * LatestQuote (read by resolvePositionPrice's isManualAsset branch) and
 * records a VALUATION-kind transaction, which recalculatePosition's replay
 * treats as a no-op for net_qty/avg_buy_price (see positions.ts). */
export async function updateManualValuation(
  tx: Tx,
  portfolioId: string,
  symbolRaw: string,
  newValue: number,
  notes?: string,
): Promise<number> {
  const symbol = symbolRaw.toUpperCase().trim();

  const pos = await tx.position.findFirst({ where: { portfolioId, symbol } });
  if (!pos) throw new NotFoundError("Manual position not found");

  const qty = Number(pos.quantity);
  const newUnitPrice = qty > 0 ? newValue / qty : newValue;

  const quote = await tx.latestQuote.findUnique({ where: { symbol } });
  if (quote) {
    await tx.latestQuote.update({ where: { symbol }, data: { price: newUnitPrice, updatedAt: new Date() } });
  } else {
    await tx.latestQuote.create({
      data: { symbol, assetId: pos.assetId, price: newUnitPrice, volume: null, createdAt: new Date(), updatedAt: new Date() },
    });
  }

  await tx.transaction.create({
    data: {
      id: uuidv4(),
      portfolioId,
      symbol,
      assetId: pos.assetId,
      transactionType: "VALUATION",
      quantity: qty,
      price: newUnitPrice,
      transactionDate: new Date(),
      fees: 0,
      taxes: 0,
      notes: notes ?? `Valuation update: ${newValue}`,
      broker: "manual",
      kind: "trade",
      wallet: "spot", // Python's Transaction() ctor omits wallet here too — defaults to "spot", not pos.wallet
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return newUnitPrice;
}
