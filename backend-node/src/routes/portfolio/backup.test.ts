import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { backupRouter } from "./backup";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/portfolio", backupRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/portfolio`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.transaction.deleteMany();
  await testPrisma.portfolio.deleteMany();
});

describe("GET /portfolio/backup", () => {
  it("includes every portfolio with its transactions, and returns a backup receipt header", async () => {
    const p1 = await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "P1", createdAt: new Date(), updatedAt: new Date() } });
    await testPrisma.portfolio.create({ data: { id: uuidv4(), name: "P2", createdAt: new Date(), updatedAt: new Date() } });
    await testPrisma.transaction.create({
      data: { id: uuidv4(), portfolioId: p1.id, symbol: "AAPL", transactionType: "BUY", quantity: 1, price: 100, transactionDate: new Date(), fees: 0, taxes: 0, kind: "trade", createdAt: new Date(), updatedAt: new Date() },
    });

    const res = await fetch(`${baseUrl}/backup`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-backup-receipt")).toBeTruthy();
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=aureon_backup_\d{8}\.json/);

    const body = (await res.json()) as {
      version: string;
      portfolios: { name: string; transactions: { symbol: string; type: string }[] }[];
    };
    expect(body.version).toBe("3.0.0");
    const names = body.portfolios.map((p) => p.name).sort();
    expect(names).toEqual(["P1", "P2"]);
    const p1Backup = body.portfolios.find((p) => p.name === "P1")!;
    expect(p1Backup.transactions).toHaveLength(1);
    expect(p1Backup.transactions[0].symbol).toBe("AAPL");
    expect(p1Backup.transactions[0].type).toBe("BUY"); // field is "type" not "transaction_type", matches Python
  });
});
