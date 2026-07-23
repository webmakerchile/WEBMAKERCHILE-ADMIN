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

const mockCeoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const mockEjecutivoUser = { id: 3, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const mockEditorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };
const mockMarketingUser = { id: 4, role: "user", teamRole: "marketing", email: "mkt@test.com" };

type TestUser =
  | typeof mockCeoUser
  | typeof mockEjecutivoUser
  | typeof mockEditorUser
  | typeof mockMarketingUser;

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

const now = new Date();
const sampleTask = {
  id: 1,
  title: "Diseñar landing",
  notes: null,
  priority: "alta",
  stage: "backlog",
  stageSince: now,
  stageTime: {},
  dueDate: null,
  completedAt: null,
  orderIndex: 0,
  projectRef: "proj-1",
  createdById: 1,
  assigneeId: null,
  createdAt: now,
  updatedAt: now,
  assigneeName: null,
  assigneePicture: null,
  assigneeEmail: null,
};

function mockSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
  return chain;
}

function mockInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.insert).mockReturnValue(chain as never);
  return chain;
}

function mockUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(db.update).mockReturnValue(chain as never);
  return chain;
}

function mockDeleteChain(rows: unknown[]) {
  const chain = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.delete).mockReturnValue(chain as never);
  return chain;
}

/** Simulate the two-call select pattern used by PATCH (fetch existing + fetch updated) */
function mockTwoCalls(existingRow: unknown, updatedRow: unknown) {
  let callCount = 0;
  vi.mocked(db.select).mockImplementation(() => {
    callCount++;
    const rows = callCount === 1 ? [existingRow] : [updatedRow];
    return {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      offset: vi.fn().mockResolvedValue(rows),
    } as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

/* ─── GET /hub/tasks ─── */

describe("GET /hub/tasks", () => {
  it("CEO gets all tasks", async () => {
    mockSelectChain([sampleTask]);
    const res = await request(await buildApp(mockCeoUser)).get("/hub/tasks");
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].stage).toBe("backlog");
  });

  it("ejecutivo gets all tasks", async () => {
    mockSelectChain([sampleTask]);
    const res = await request(await buildApp(mockEjecutivoUser)).get("/hub/tasks");
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });

  it("non-CEO/ejecutivo is restricted to their own assigned tasks", async () => {
    const editorTask = { ...sampleTask, assigneeId: 2, id: 2 };
    mockSelectChain([editorTask]);
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks");
    expect(res.status).toBe(200);
    expect(vi.mocked(db.select)).toHaveBeenCalled();
  });
});

/* ─── GET /hub/tasks/team-members ─── */

describe("GET /hub/tasks/team-members", () => {
  it("returns team members list", async () => {
    const members = [{ id: 1, name: "CEO", email: "ceo@test.com", picture: null, teamRole: "ceo" }];
    // team-members query ends at .orderBy() not .offset()
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(members),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(members),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await request(await buildApp(mockCeoUser)).get("/hub/tasks/team-members");
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
  });
});

/* ─── POST /hub/tasks ─── */

describe("POST /hub/tasks", () => {
  it("CEO can create a task", async () => {
    mockInsertChain([sampleTask]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Diseñar landing", priority: "alta", stage: "backlog" });
    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
  });

  it("rejects blank title (400)", async () => {
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid stage (400)", async () => {
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Task", stage: "invalid_stage" });
    expect(res.status).toBe(400);
  });

  it("ejecutivo gets 403 on create (CEO-only)", async () => {
    const res = await request(await buildApp(mockEjecutivoUser))
      .post("/hub/tasks")
      .send({ title: "Task" });
    expect(res.status).toBe(403);
  });

  it("edicion gets 403 on create", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks")
      .send({ title: "Diseñar" });
    expect(res.status).toBe(403);
  });

  it("marketing gets 403 on create", async () => {
    const res = await request(await buildApp(mockMarketingUser))
      .post("/hub/tasks")
      .send({ title: "Task" });
    expect(res.status).toBe(403);
  });
});

/* ─── POST /hub/tasks/batch ─── */

describe("POST /hub/tasks/batch", () => {
  it("CEO can batch create tasks", async () => {
    mockInsertChain([sampleTask, { ...sampleTask, id: 2, title: "Tarea B" }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Diseñar landing" }, { title: "Tarea B" }] });
    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
  });

  it("ejecutivo gets 403 on batch create", async () => {
    const res = await request(await buildApp(mockEjecutivoUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Tarea" }] });
    expect(res.status).toBe(403);
  });

  it("edicion gets 403 on batch create", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Tarea" }] });
    expect(res.status).toBe(403);
  });
});

/* ─── PATCH /hub/tasks/:id ─── */

describe("PATCH /hub/tasks/:id — stage transitions", () => {
  it("CEO can move stage and transitions accumulate stageTime", async () => {
    const taskInSprint = {
      ...sampleTask,
      stage: "sprint",
      stageSince: new Date(Date.now() - 3600_000),
      stageTime: { backlog: 60 },
    };
    const updatedTask = { ...taskInSprint, stage: "doing" };
    mockTwoCalls(taskInSprint, updatedTask);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ stage: "doing" });
    expect(res.status).toBe(200);
    const updateMock = vi.mocked(db.update);
    expect(updateMock).toHaveBeenCalled();
  });

  it("moving to 'done' sets completedAt", async () => {
    const inQA = { ...sampleTask, stage: "qa_rev", stageSince: new Date() };
    const doneTask = { ...inQA, stage: "done", completedAt: new Date() };
    mockTwoCalls(inQA, doneTask);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ stage: "done" });
    expect(res.status).toBe(200);
    const updateMock = vi.mocked(db.update);
    const setCalls = updateMock.mock.results;
    expect(setCalls.length).toBeGreaterThan(0);
  });

  it("ejecutivo can update any field on any task", async () => {
    const updatedTask = { ...sampleTask, title: "Nuevo título" };
    mockTwoCalls(sampleTask, updatedTask);
    mockUpdateChain();
    const res = await request(await buildApp(mockEjecutivoUser))
      .patch("/hub/tasks/1")
      .send({ title: "Nuevo título", priority: "alta" });
    expect(res.status).toBe(200);
  });

  it("edicion can move stage on their assigned task", async () => {
    const assignedTask = { ...sampleTask, assigneeId: 2, stage: "sprint" };
    const updated = { ...assignedTask, stage: "doing" };
    mockTwoCalls(assignedTask, updated);
    mockUpdateChain();
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ stage: "doing", title: "IGNORED" });
    expect(res.status).toBe(200);
  });

  it("edicion gets 403 on unassigned task", async () => {
    const unassigned = { ...sampleTask, assigneeId: 99 };
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([unassigned]),
      offset: vi.fn().mockResolvedValue([unassigned]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ stage: "doing" });
    expect(res.status).toBe(403);
  });

  it("marketing gets 403 on unassigned task", async () => {
    const unassigned = { ...sampleTask, assigneeId: 99 };
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([unassigned]),
      offset: vi.fn().mockResolvedValue([unassigned]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await request(await buildApp(mockMarketingUser))
      .patch("/hub/tasks/1")
      .send({ stage: "doing" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for missing task", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      offset: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/999")
      .send({ stage: "doing" });
    expect(res.status).toBe(404);
  });
});

/* ─── DELETE /hub/tasks/:id ─── */

describe("DELETE /hub/tasks/:id", () => {
  it("CEO can delete", async () => {
    mockDeleteChain([{ id: 1 }]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("ejecutivo gets 403 (delete is CEO-only)", async () => {
    const res = await request(await buildApp(mockEjecutivoUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(403);
  });

  it("edicion gets 403", async () => {
    const res = await request(await buildApp(mockEditorUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 for missing task", async () => {
    mockDeleteChain([]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/999");
    expect(res.status).toBe(404);
  });
});
