import { v5 as uuidv5 } from "uuid";
import type { Prisma } from "../generated/prisma";

type Tx = Prisma.TransactionClient;

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** Port of app/modules/market/services/market.py ensure_asset_exists.
 * Deterministic asset_id from the symbol; only touches the `assets` row when
 * a name is supplied, but always ensures an `asset_snapshot` row exists
 * (transactions.asset_id FKs to asset_snapshot.asset_id, not assets.id). */
export async function ensureAssetExists(
  tx: Tx,
  symbolRaw: string,
  name?: string,
  assetClass = "equity",
  tier?: number,
): Promise<string> {
  const symbol = symbolRaw.toUpperCase().trim();
  const assetId = uuidv5(symbol, UUID_NAMESPACE_DNS);

  if (name) {
    const asset = await tx.asset.findUnique({ where: { symbol } });
    if (!asset) {
      await tx.asset.create({
        data: {
          id: assetId,
          symbol,
          name,
          assetClass,
          tier: tier ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      const data: Record<string, unknown> = {};
      if (!asset.name || asset.name === symbol) data.name = name;
      if (tier !== undefined && asset.tier !== tier) data.tier = tier;
      if (Object.keys(data).length > 0) {
        await tx.asset.update({ where: { symbol }, data });
      }
    }
  }

  const quote = await tx.latestQuote.findUnique({ where: { symbol } });

  const snapshot = await tx.assetSnapshot.findUnique({ where: { assetId } });
  if (!snapshot) {
    const now = new Date();
    await tx.assetSnapshot.create({
      data: {
        assetId,
        price: quote ? quote.price : null,
        marketCap: null,
        peRatio: null,
        rsi: null,
        momentumScore: null,
        volatilityScore: null,
        sentimentScore: null,
        payload: {},
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return assetId;
}
