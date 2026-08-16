import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { notificationsRouter } from "./notifications";
import { DEFAULT_USER_ID, getCurrentUser } from "../../lib/users";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/notifications", notificationsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/notifications`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.web_notifications.deleteMany();
  await getCurrentUser(); // ensures the DEFAULT_USER_ID row exists (FK) before raw inserts below
});

describe("GET /notifications/", () => {
  it("lists the user's own notifications plus broadcast (user_id NULL) rows, newest first", async () => {
    const otherUser = await testPrisma.user.create({ data: { id: uuidv4(), email: `other-${uuidv4()}@test.local`, isActive: true, createdAt: new Date(), updatedAt: new Date() } });
    const now = new Date();
    await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: DEFAULT_USER_ID, title: "Mine", message: "m1", type: "info", read: false, created_at: new Date(now.getTime() - 1000), updated_at: now },
    });
    await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: null, title: "Broadcast", message: "m2", type: "info", read: false, created_at: now, updated_at: now },
    });
    await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: otherUser.id, title: "SomeoneElse", message: "m3", type: "info", read: false, created_at: now, updated_at: now },
    });

    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ title: string }>;
    expect(body.map((n) => n.title)).toEqual(["Broadcast", "Mine"]); // newest first; SomeoneElse excluded
  });
});

describe("POST /notifications/", () => {
  it("creates a notification for the current user", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "T", message: "M", type: "warning" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; title: string; type: string; read: boolean };
    expect(body.title).toBe("T");
    expect(body.type).toBe("warning");
    expect(body.read).toBe(false);
    const row = await testPrisma.web_notifications.findUnique({ where: { id: body.id } });
    expect(row!.user_id).toBe(DEFAULT_USER_ID);
  });

  it("defaults type to 'info'", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "T", message: "M" }),
    });
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe("info");
  });
});

describe("PUT /notifications/:id/read", () => {
  it("marks the notification read", async () => {
    const n = await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: DEFAULT_USER_ID, title: "T", message: "M", type: "info", read: false, created_at: new Date(), updated_at: new Date() },
    });
    const res = await fetch(`${baseUrl}/${n.id}/read`, { method: "PUT" });
    expect(res.status).toBe(200);
    const row = await testPrisma.web_notifications.findUnique({ where: { id: n.id } });
    expect(row!.read).toBe(true);
  });

  it("404s for a notification owned by someone else", async () => {
    const otherUser = await testPrisma.user.create({ data: { id: uuidv4(), email: `other-${uuidv4()}@test.local`, isActive: true, createdAt: new Date(), updatedAt: new Date() } });
    const n = await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: otherUser.id, title: "T", message: "M", type: "info", read: false, created_at: new Date(), updated_at: new Date() },
    });
    const res = await fetch(`${baseUrl}/${n.id}/read`, { method: "PUT" });
    expect(res.status).toBe(404);
  });

  it("marks a broadcast (user_id NULL) notification read too", async () => {
    const n = await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: null, title: "T", message: "M", type: "info", read: false, created_at: new Date(), updated_at: new Date() },
    });
    const res = await fetch(`${baseUrl}/${n.id}/read`, { method: "PUT" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /notifications/mark-all-read", () => {
  it("marks every given id read, silently skipping ones that don't resolve", async () => {
    const n1 = await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: DEFAULT_USER_ID, title: "T1", message: "M", type: "info", read: false, created_at: new Date(), updated_at: new Date() },
    });
    const n2 = await testPrisma.web_notifications.create({
      data: { id: uuidv4(), user_id: DEFAULT_USER_ID, title: "T2", message: "M", type: "info", read: false, created_at: new Date(), updated_at: new Date() },
    });
    const res = await fetch(`${baseUrl}/mark-all-read`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify([n1.id, n2.id, uuidv4()]), // third id doesn't exist — must not fail the batch
    });
    expect(res.status).toBe(200);
    expect((await testPrisma.web_notifications.findUnique({ where: { id: n1.id } }))!.read).toBe(true);
    expect((await testPrisma.web_notifications.findUnique({ where: { id: n2.id } }))!.read).toBe(true);
  });
});
