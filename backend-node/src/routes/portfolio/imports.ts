import { Router, type Request } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { NotFoundError, ValidationError, RequestValidationError } from "../../lib/errors";
import { requireUuidParam } from "../../lib/validation";
import { ensureAssetExists } from "../../lib/assets";
import { recalculatePosition } from "../../lib/positions";
import { invalidatePortfolioCaches } from "../../lib/portfolioCache";
import { upload } from "../../lib/uploadMiddleware";
import { createManualAsset } from "../../lib/importers/manualAsset";
import { parseTransactionFile } from "../../lib/importers/csvImport";
import { parseCdslCas } from "../../lib/importers/casImport";
import { parseNpsStatement } from "../../lib/importers/npsImport";
import { parseEpfStatement } from "../../lib/importers/epfImport";
import type { Prisma, Transaction } from "../../generated/prisma";

export const importsRouter = Router();

type Tx = Prisma.TransactionClient;

function extOf(filename: string): "csv" | "xlsx" | "xls" | "pdf" {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "csv";
  if (ext === "xlsx" || ext === "xls" || ext === "pdf") return ext;
  return "csv";
}

async function findPortfolioOrThrow(id: string) {
  const portfolio = await prisma.portfolio.findUnique({ where: { id } });
  if (!portfolio) throw new NotFoundError("Portfolio not found");
  return portfolio;
}

/** Port of PortfolioService._track_import_run — creates the import_runs row
 * up front, runs `body`, and finalizes status/rows_committed/rows_skipped on
 * success or FAILED on any thrown error (still committed on its own via a
 * fresh write, matching Python's re-add-after-rollback behavior). */
async function trackImportRun<T>(
  portfolioId: string,
  source: string,
  filename: string,
  body: (runId: string) => Promise<{ rowsCommitted: number; rowsSkipped: number; errorSummary?: string | null; result: T }>,
): Promise<T> {
  const runId = uuidv4();
  const startedAt = new Date();
  await prisma.import_runs.create({
    data: {
      id: runId,
      portfolio_id: portfolioId,
      source,
      filename,
      status: "RUNNING",
      rows_committed: 0,
      rows_skipped: 0,
      started_at: startedAt,
      duration_ms: 0,
      created_at: startedAt,
      updated_at: startedAt,
    },
  });

  try {
    const { rowsCommitted, rowsSkipped, errorSummary, result } = await body(runId);
    await prisma.import_runs.update({
      where: { id: runId },
      data: {
        status: "SUCCESS",
        rows_committed: rowsCommitted,
        rows_skipped: rowsSkipped,
        error_summary: errorSummary ?? null,
        duration_ms: Date.now() - startedAt.getTime(),
        updated_at: new Date(),
      },
    });
    return result;
  } catch (err) {
    await prisma.import_runs.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error_summary: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - startedAt.getTime(),
        updated_at: new Date(),
      },
    });
    throw err;
  }
}

/** Upserts the one-row-per-symbol broker_snapshot pattern shared by CAS/NPS/EPF
 * holdings imports (Python's import_cdsl_cas/import_nps_statement/
 * import_epf_statement all repeat this exact upsert shape). */
async function upsertBrokerSnapshot(
  tx: Tx,
  portfolioId: string,
  runId: string,
  broker: string,
  symbol: string,
  quantity: number,
  price: number,
  transactionDate: Date,
): Promise<void> {
  const existing = await tx.transaction.findFirst({
    where: { portfolioId, symbol, kind: "broker_snapshot", broker },
  });
  if (existing) {
    await tx.transaction.update({
      where: { id: existing.id },
      data: { quantity, price, transactionDate, importRunId: runId, updatedAt: new Date() },
    });
  } else {
    await tx.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol,
        transactionType: "BUY",
        quantity,
        price,
        transactionDate,
        fees: 0,
        taxes: 0,
        broker,
        kind: "broker_snapshot",
        wallet: "spot",
        importRunId: runId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

async function existingBrokerReferences(tx: Tx, portfolioId: string, broker: string, refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set();
  const rows = await tx.transaction.findMany({
    where: { portfolioId, broker, brokerReference: { in: refs } },
    select: { brokerReference: true },
  });
  return new Set(rows.map((r) => r.brokerReference).filter((r): r is string => !!r));
}

// ── POST /:id/import (CSV/XLSX/PDF transaction log) ────────────────────────
importsRouter.post("/:id/import", upload.single("file"), async (req: Request<{ id: string }>, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  if (!req.file) throw new RequestValidationError("file is required");
  const broker = typeof req.body?.broker === "string" ? req.body.broker : undefined;
  const filename = req.file.originalname || "import.csv";

  const result = await trackImportRun(portfolio.id, broker || "csv", filename, async (runId) => {
    const { rows, errors } = await parseTransactionFile(req.file!.buffer, extOf(filename), broker);
    if (rows.length === 0 && errors.length > 0) {
      const shown = errors.slice(0, 5);
      const more = errors.length > 5 ? `; and ${errors.length - 5} more` : "";
      throw new ValidationError(`File parsing errors: ${shown.join("; ")}${more}`);
    }
    if (rows.length === 0) {
      throw new ValidationError(
        "No transactions found in file — check that the file format/columns match a recognised broker export (Zerodha, Groww, or Binance).",
      );
    }

    const refsByBroker = new Map<string, string[]>();
    for (const row of rows) {
      if (row.broker_reference) {
        const brokerName = row.broker || "import";
        refsByBroker.set(brokerName, [...(refsByBroker.get(brokerName) ?? []), row.broker_reference]);
      }
    }

    let committed = 0;
    let skipped = 0;
    const symbolsToRecalc = new Set<string>();

    await prisma.$transaction(async (tx) => {
      const existingRefs = new Set<string>();
      for (const [brokerName, refs] of refsByBroker) {
        for (const r of await existingBrokerReferences(tx, portfolio.id, brokerName, refs)) {
          existingRefs.add(`${brokerName}|${r}`);
        }
      }
      const seenThisCall = new Set<string>();

      for (const row of rows) {
        const brokerName = row.broker || "import";
        if (row.broker_reference) {
          const key = `${brokerName}|${row.broker_reference}`;
          if (existingRefs.has(key) || seenThisCall.has(key)) {
            skipped += 1;
            continue;
          }
          seenThisCall.add(key);
        }

        const assetId = await ensureAssetExists(tx, row.symbol, row.name ?? undefined, row.asset_type ?? "equity");
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            portfolioId: portfolio.id,
            symbol: row.symbol,
            assetId,
            transactionType: row.type,
            quantity: row.quantity,
            price: row.price,
            transactionDate: row.date,
            fees: 0,
            taxes: 0,
            broker: brokerName,
            brokerReference: row.broker_reference,
            kind: "trade",
            wallet: "spot",
            importRunId: runId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        committed += 1;
        symbolsToRecalc.add(row.symbol);
      }

      for (const sym of symbolsToRecalc) await recalculatePosition(tx, portfolio.id, sym);
    });

    await invalidatePortfolioCaches(portfolio.id);
    return { rowsCommitted: committed, rowsSkipped: skipped, result: { committed, skipped, errors } };
  });

  res.json(result);
});

// ── POST /:id/import/cdsl (CDSL CAS PDF) ────────────────────────────────────
importsRouter.post("/:id/import/cdsl", upload.single("file"), async (req: Request<{ id: string }>, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  if (!req.file) throw new RequestValidationError("file is required");
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  const filename = req.file.originalname || "cas.pdf";

  const result = await trackImportRun(portfolio.id, "cdsl_cas", filename, async (runId) => {
    const { holdings, summary } = await parseCdslCas(req.file!.buffer, password);

    await prisma.$transaction(async (tx) => {
      for (const p of holdings) {
        await ensureAssetExists(tx, p.symbol, p.name, p.asset_type);
        await upsertBrokerSnapshot(tx, portfolio.id, runId, "cas_cdsl", p.symbol, p.quantity, p.avg_buy_price, new Date());
        await recalculatePosition(tx, portfolio.id, p.symbol);
      }
    });

    await invalidatePortfolioCaches(portfolio.id);
    return {
      rowsCommitted: holdings.length,
      rowsSkipped: 0,
      result: { status: "success", imported_holdings: holdings.length, summary },
    };
  });

  res.json(result);
});

// ── POST /:id/import/nps ─────────────────────────────────────────────────
importsRouter.post("/:id/import/nps", upload.single("file"), async (req: Request<{ id: string }>, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  if (!req.file) throw new RequestValidationError("file is required");
  const filename = req.file.originalname || "import.csv";

  const result = await trackImportRun(portfolio.id, "nps", filename, async (runId) => {
    const { holdings, transactions, summary } = await parseNpsStatement(req.file!.buffer, extOf(filename));

    let committed = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      const symbolsToRecalc = new Set<string>();
      for (const h of holdings) {
        await ensureAssetExists(tx, h.symbol, h.name, "nps", h.tier);
        await upsertBrokerSnapshot(tx, portfolio.id, runId, "nps", h.symbol, h.quantity, h.current_nav, h.as_of_date ?? new Date());
        symbolsToRecalc.add(h.symbol);
      }

      const refs = transactions.map((t) => t.broker_reference);
      const existingRefs = await existingBrokerReferences(tx, portfolio.id, "nps", refs);
      const seenThisCall = new Set<string>();

      for (const t of transactions) {
        if (existingRefs.has(t.broker_reference) || seenThisCall.has(t.broker_reference)) {
          skipped += 1;
          continue;
        }
        seenThisCall.add(t.broker_reference);
        const assetId = await ensureAssetExists(tx, t.symbol);
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            portfolioId: portfolio.id,
            symbol: t.symbol,
            assetId,
            transactionType: t.type,
            quantity: t.quantity,
            price: t.price,
            transactionDate: t.date,
            fees: 0,
            taxes: 0,
            broker: "nps",
            brokerReference: t.broker_reference,
            kind: "trade",
            notes: t.description,
            wallet: "spot",
            importRunId: runId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        committed += 1;
        symbolsToRecalc.add(t.symbol);
      }

      for (const sym of symbolsToRecalc) await recalculatePosition(tx, portfolio.id, sym);
    });

    await invalidatePortfolioCaches(portfolio.id);
    return {
      rowsCommitted: holdings.length + committed,
      rowsSkipped: skipped,
      result: { holdings_imported: holdings.length, transactions_committed: committed, transactions_skipped: skipped, errors: [], summary },
    };
  });

  res.json(result);
});

// ── POST /:id/import/epf ─────────────────────────────────────────────────
importsRouter.post("/:id/import/epf", upload.single("file"), async (req: Request<{ id: string }>, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  if (!req.file) throw new RequestValidationError("file is required");
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  const filename = req.file.originalname || "epf.pdf";

  const result = await trackImportRun(portfolio.id, "epf", filename, async (runId) => {
    const { holdings, transactions, summary } = await parseEpfStatement(req.file!.buffer, password);

    let committed = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      const symbolsToRecalc = new Set<string>();
      for (const h of holdings) {
        await ensureAssetExists(tx, h.symbol, h.name, "epf");
        // EPF's broker_snapshot row IS the holding itself (quantity=1.0,
        // price=current_value) — parseEpfStatement doesn't emit this row
        // directly; it's synthesized here from holdings[0], matching
        // Python's import_epf_statement.
        await upsertBrokerSnapshot(tx, portfolio.id, runId, "epf", h.symbol, h.quantity, h.current_value, h.as_of_date ?? new Date());
        symbolsToRecalc.add(h.symbol);
      }

      const refs = transactions.map((t) => t.broker_reference);
      const existingRefs = await existingBrokerReferences(tx, portfolio.id, "epf", refs);
      const seenThisCall = new Set<string>();

      for (const t of transactions) {
        if (existingRefs.has(t.broker_reference) || seenThisCall.has(t.broker_reference)) {
          skipped += 1;
          continue;
        }
        seenThisCall.add(t.broker_reference);
        const assetId = await ensureAssetExists(tx, t.symbol);
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            portfolioId: portfolio.id,
            symbol: t.symbol,
            assetId,
            transactionType: t.type,
            // Contributions are an audit trail, not per-unit purchases — see
            // recalculatePosition's docstring: broker_trade rows never drive
            // Position.quantity, so quantity here is a fixed 1.0 and `price`
            // carries the actual rupee amount, matching Python exactly.
            quantity: 1.0,
            price: t.amount,
            transactionDate: t.date,
            fees: 0,
            taxes: 0,
            broker: "epf",
            brokerReference: t.broker_reference,
            kind: "broker_trade",
            notes: t.description,
            wallet: "spot",
            importRunId: runId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        committed += 1;
        symbolsToRecalc.add(t.symbol);
      }

      for (const sym of symbolsToRecalc) await recalculatePosition(tx, portfolio.id, sym);
    });

    await invalidatePortfolioCaches(portfolio.id);
    return {
      rowsCommitted: holdings.length + committed,
      rowsSkipped: skipped,
      result: { holdings_imported: holdings.length, transactions_committed: committed, transactions_skipped: skipped, errors: [], summary },
    };
  });

  res.json(result);
});

// ── POST /:id/manual-assets ─────────────────────────────────────────────
interface ManualAssetBody {
  name?: unknown;
  asset_class?: unknown;
  symbol?: unknown;
  quantity?: unknown;
  price?: unknown;
  current_value?: unknown;
  valuation_date?: unknown;
  notes?: unknown;
  tier?: unknown;
}

importsRouter.post("/:id/manual-assets", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  const body = req.body as ManualAssetBody;

  if (typeof body.name !== "string" || !body.name) throw new RequestValidationError("name is required");
  if (typeof body.asset_class !== "string" || !body.asset_class) throw new RequestValidationError("asset_class is required");

  let transactionDate: Date | undefined;
  if (typeof body.valuation_date === "string" && body.valuation_date) {
    const parsed = new Date(body.valuation_date);
    if (Number.isNaN(parsed.getTime())) throw new RequestValidationError(`Invalid valuation_date: ${JSON.stringify(body.valuation_date)}`);
    transactionDate = parsed;
  }

  const { symbol } = await prisma.$transaction((tx) =>
    createManualAsset(tx, portfolio.id, {
      name: body.name as string,
      assetClass: body.asset_class as string,
      symbol: typeof body.symbol === "string" ? body.symbol : undefined,
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      price: typeof body.price === "number" ? body.price : undefined,
      currentValue: typeof body.current_value === "number" ? body.current_value : undefined,
      transactionDate,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      tier: typeof body.tier === "number" ? body.tier : undefined,
    }),
  );

  await invalidatePortfolioCaches(portfolio.id);
  res.json({ status: "success", symbol });
});

// ── Import history ─────────────────────────────────────────────────────
function serializeImportRun(run: {
  id: string;
  portfolio_id: string;
  source: string;
  filename: string;
  status: string;
  rows_committed: number;
  rows_skipped: number;
  error_summary: string | null;
  started_at: Date;
  duration_ms: number;
  created_at: Date;
}) {
  return {
    id: run.id,
    portfolio_id: run.portfolio_id,
    source: run.source,
    filename: run.filename,
    status: run.status,
    rows_committed: run.rows_committed,
    rows_skipped: run.rows_skipped,
    error_summary: run.error_summary,
    started_at: run.started_at,
    duration_ms: run.duration_ms,
    created_at: run.created_at,
  };
}

importsRouter.get("/:id/import/history", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  const runs = await prisma.import_runs.findMany({
    where: { portfolio_id: portfolio.id },
    orderBy: { started_at: "desc" },
  });
  res.json(runs.map(serializeImportRun));
});

function serializeTransaction(t: Transaction) {
  return {
    id: t.id,
    portfolio_id: t.portfolioId,
    symbol: t.symbol,
    transaction_type: t.transactionType,
    quantity: Number(t.quantity),
    price: Number(t.price),
    transaction_date: t.transactionDate,
    fees: Number(t.fees),
    taxes: Number(t.taxes),
    notes: t.notes,
    broker: t.broker,
    broker_reference: t.brokerReference,
    kind: t.kind,
    created_at: t.createdAt,
  };
}

importsRouter.get("/:id/import/history/:runId/transactions", async (req, res) => {
  requireUuidParam(req.params.id, "portfolio_id");
  requireUuidParam(req.params.runId, "run_id");
  const portfolio = await findPortfolioOrThrow(req.params.id);
  const run = await prisma.import_runs.findFirst({ where: { id: req.params.runId, portfolio_id: portfolio.id } });
  if (!run) throw new NotFoundError("Import run not found");

  const txns = await prisma.transaction.findMany({
    where: { importRunId: run.id },
    orderBy: { transactionDate: "asc" },
  });
  res.json(txns.map(serializeTransaction));
});
