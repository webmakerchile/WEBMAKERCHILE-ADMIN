import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";

const ceoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const ejecutivoUser = { id: 3, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const editorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };

type TestUser = typeof ceoUser | typeof ejecutivoUser | typeof editorUser;

async function buildApp(user: TestUser) {
  const mod = await import("./tasks");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

/** A thenable select chain — resolves to `rows` no matter which method is awaited last. */
function makeChain(rows: unknown[]) {
  const then = (resolve: (v: unknown) => void, _reject?: (e: unknown) => void) => resolve(rows);
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then,
  };
  return chain;
}

function mockSelectChain(rows: unknown[]) {
  const chain = makeChain(rows);
  vi.mocked(db.select).mockReturnValue(chain as never);
  return chain;
}

function mockSelectChainOnce(rows: unknown[]) {
  const chain = makeChain(rows);
  vi.mocked(db.select).mockReturnValueOnce(chain as never);
  return chain;
}

const now = new Date();
const todayStr = now.toISOString().slice(0, 10);

/* ==============================================================
   GET /hub/tasks/team-view
   ============================================================== */
describe("GET /hub/tasks/team-view", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-CEO/ejecutivo users", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/team-view");
    expect(res.status).toBe(403);
  });

  it("returns 200 with members array for CEO", async () => {
    const sampleUser = { id: 10, name: "Ana", picture: null, email: "ana@test.com", teamRole: "edicion", approvalStatus: "approved" };
    const sampleTask = { id: 1, title: "Tarea A", stage: "doing", priority: "alta", dueDate: null, stageSince: now, assigneeId: 10 };

    // Two parallel selects in Promise.all: users first, then active tasks
    mockSelectChainOnce([sampleUser]);
    mockSelectChainOnce([sampleTask]);

    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/team-view");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("members");
    expect(Array.isArray(res.body.members)).toBe(true);
  });

  it("returns 200 for ejecutivo role", async () => {
    mockSelectChainOnce([]);
    mockSelectChainOnce([]);
    const app = await buildApp(ejecutivoUser);
    const res = await request(app).get("/hub/tasks/team-view");
    expect(res.status).toBe(200);
  });

  it("computes semaphore=red for overdue task", async () => {
    const user = { id: 10, name: "Bob", picture: null, email: "bob@test.com", teamRole: "marketing", approvalStatus: "approved" };
    const overdueDate = "2020-01-01";
    const overdueTask = { id: 2, title: "Vieja", stage: "sprint", priority: "media", dueDate: overdueDate, stageSince: now, assigneeId: 10 };

    mockSelectChainOnce([user]);
    mockSelectChainOnce([overdueTask]);

    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/team-view");
    expect(res.status).toBe(200);
    const member = res.body.members.find((m: { id: number }) => m.id === 10);
    expect(member?.semaphore).toBe("red");
    expect(member?.activeTasks[0]?.overdue).toBe(true);
  });

  it("computes semaphore=yellow for task due today", async () => {
    const user = { id: 11, name: "Carlos", picture: null, email: "carlos@test.com", teamRole: "edicion", approvalStatus: "approved" };
    const dueTodayTask = { id: 3, title: "Hoy", stage: "sprint", priority: "baja", dueDate: todayStr, stageSince: now, assigneeId: 11 };

    mockSelectChainOnce([user]);
    mockSelectChainOnce([dueTodayTask]);

    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/team-view");
    expect(res.status).toBe(200);
    const member = res.body.members.find((m: { id: number }) => m.id === 11);
    expect(member?.semaphore).toBe("yellow");
    expect(member?.activeTasks[0]?.dueToday).toBe(true);
  });
});

/* ==============================================================
   GET /hub/tasks/my-day
   ============================================================== */
describe("GET /hub/tasks/my-day", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 for any authenticated user", async () => {
    mockSelectChain([]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("groups");
    expect(res.body).toHaveProperty("progress");
  });

  it("groups overdue tasks into vencidas", async () => {
    const overdueTask = { id: 1, title: "Vieja", stage: "sprint", priority: "alta", dueDate: "2020-06-01", completedAt: null, projectRef: null, notes: null, stageSince: now };
    mockSelectChain([overdueTask]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body.groups.vencidas).toHaveLength(1);
    expect(res.body.groups.vencidas[0].id).toBe(1);
  });

  it("groups today tasks into hoy", async () => {
    const todayTask = { id: 2, title: "Hoy", stage: "doing", priority: "media", dueDate: todayStr, completedAt: null, projectRef: null, notes: null, stageSince: now };
    mockSelectChain([todayTask]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body.groups.hoy).toHaveLength(1);
    expect(res.body.groups.hoy[0].id).toBe(2);
  });

  it("groups null-dueDate tasks into sinFecha", async () => {
    const noDueTask = { id: 3, title: "Sin fecha", stage: "backlog", priority: "baja", dueDate: null, completedAt: null, projectRef: null, notes: null, stageSince: null };
    mockSelectChain([noDueTask]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body.groups.sinFecha).toHaveLength(1);
  });

  it("places done+completedAt>=today into completedToday", async () => {
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const doneTask = { id: 4, title: "Lista", stage: "done", priority: "media", dueDate: null, completedAt: todayStart, projectRef: null, notes: null, stageSince: now };
    mockSelectChain([doneTask]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body.groups.completedToday).toHaveLength(1);
    expect(res.body.progress.done).toBe(1);
  });

  it("computes progress correctly", async () => {
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const tasks = [
      { id: 1, title: "A", stage: "sprint", priority: "alta", dueDate: todayStr, completedAt: null, projectRef: null, notes: null, stageSince: now },
      { id: 2, title: "B", stage: "done", priority: "baja", dueDate: null, completedAt: todayStart, projectRef: null, notes: null, stageSince: now },
    ];
    mockSelectChain(tasks);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/my-day");
    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(1);
    expect(res.body.progress.total).toBe(2);
  });
});

/* ==============================================================
   GET /hub/tasks/activity
   ============================================================== */
describe("GET /hub/tasks/activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-CEO/ejecutivo", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).get("/hub/tasks/activity?userId=2&date=" + todayStr);
    expect(res.status).toBe(403);
  });

  it("returns 400 when userId is missing", async () => {
    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/activity");
    expect(res.status).toBe(400);
  });

  it("returns 400 when userId is not a number", async () => {
    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/activity?userId=abc&date=" + todayStr);
    expect(res.status).toBe(400);
  });

  it("returns 200 with items for CEO + valid userId", async () => {
    const activityItem = {
      id: 1, taskId: 10, taskTitle: "Tarea test", action: "stage_change",
      oldStage: "sprint", newStage: "doing", createdAt: now, actorName: "Ana",
    };
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([activityItem]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const app = await buildApp(ceoUser);
    const res = await request(app).get(`/hub/tasks/activity?userId=2&date=${todayStr}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe("stage_change");
  });

  it("returns 200 for ejecutivo role as well", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const app = await buildApp(ejecutivoUser);
    const res = await request(app).get(`/hub/tasks/activity?userId=10&date=${todayStr}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("defaults to today when date param is omitted", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const app = await buildApp(ceoUser);
    const res = await request(app).get("/hub/tasks/activity?userId=5");
    expect(res.status).toBe(200);
  });
});
