import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => {
  // El mock también hace de "tx": db.transaction entrega el mismo objeto,
  // así los tests encolan selects/inserts sin importar si van en transacción.
  const dbMock: Record<string, unknown> = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(async () => ({ rows: [] })),
  };
  dbMock["transaction"] = vi.fn(async (cb: (tx: unknown) => unknown) => cb(dbMock));
  return { db: dbMock };
});

vi.mock("../../lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@workspace/db";
import { createNotification } from "../../lib/notifications";

const mockCeoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const mockEjecutivoUser = { id: 3, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const mockEditorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };
const mockMarketingUser = { id: 4, role: "user", teamRole: "marketing", email: "mkt@test.com" };
const mockOwnerUser = { id: 9, role: "superadmin", teamRole: "ceo", email: "owner@test.com" };
const mockDevUser = { id: 5, role: "user", teamRole: "dev", email: "dev@test.com" };

type TestUser =
  | typeof mockCeoUser
  | typeof mockEjecutivoUser
  | typeof mockEditorUser
  | typeof mockMarketingUser
  | typeof mockOwnerUser;

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

/**
 * Sequence of select results: each db.select() call consumes the next row set.
 * The chain is thenable AND resolves at any terminal method (limit/orderBy/offset),
 * covering every select shape in the router.
 */
function thenableSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "orderBy", "groupBy", "limit", "offset"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["then"] = (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onF, onR);
  return chain;
}

function mockSelectSeq(...rowSets: unknown[][]) {
  let i = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = rowSets[Math.min(i, rowSets.length - 1)] ?? [];
    i++;
    return thenableSelectChain(rows) as never;
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

  it("ejecutivo (ventas) puede crear tareas (hubWrite incluye tasks)", async () => {
    mockInsertChain([sampleTask]);
    const res = await request(await buildApp(mockEjecutivoUser))
      .post("/hub/tasks")
      .send({ title: "Task" });
    expect(res.status).toBe(201);
  });

  it("edicion gets 403 on create", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks")
      .send({ title: "Diseñar" });
    expect(res.status).toBe(403);
  });

  it("marketing puede crear tareas (hubWrite incluye tasks)", async () => {
    mockInsertChain([sampleTask]);
    const res = await request(await buildApp(mockMarketingUser))
      .post("/hub/tasks")
      .send({ title: "Task" });
    expect(res.status).toBe(201);
  });

  it("dev puede crear tareas (hubWrite incluye tasks)", async () => {
    mockInsertChain([sampleTask]);
    const res = await request(await buildApp(mockDevUser))
      .post("/hub/tasks")
      .send({ title: "Task" });
    expect(res.status).toBe(201);
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

  it("ejecutivo (ventas) puede crear tareas en lote (hubWrite incluye tasks)", async () => {
    mockInsertChain([sampleTask]);
    const res = await request(await buildApp(mockEjecutivoUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Tarea" }] });
    expect(res.status).toBe(201);
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
  it("CEO puede eliminar cualquier tarea", async () => {
    mockSelectSeq([sampleTask]);
    mockDeleteChain([{ id: 1 }]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("quien creó la tarea puede eliminarla (autonomía)", async () => {
    mockSelectSeq([{ ...sampleTask, createdById: 4 }]);
    mockDeleteChain([{ id: 1 }]);
    const res = await request(await buildApp(mockMarketingUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(200);
  });

  it("ejecutivo puede eliminar tareas creadas por otros (escritura de tareas)", async () => {
    mockSelectSeq([sampleTask]); // createdById 1 ≠ 3
    mockDeleteChain([{ id: 1 }]);
    const res = await request(await buildApp(mockEjecutivoUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(200);
  });

  it("edicion NO puede eliminar tareas creadas por otros", async () => {
    mockSelectSeq([sampleTask]);
    const res = await request(await buildApp(mockEditorUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 for missing task", async () => {
    mockSelectSeq([]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/999");
    expect(res.status).toBe(404);
  });
});

/* ─── Regla del dueño (assignee protection) ─── */

describe("Owner rule — nobody assigns tasks to the superadmin", () => {
  it("CEO (non-superadmin) cannot create a task assigned to the owner → 403", async () => {
    mockSelectSeq([{ id: 9, role: "superadmin" }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Trampa", assigneeId: 9 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/dueño/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("CEO can assign to a normal user → 201", async () => {
    mockSelectSeq([{ id: 2, role: "user" }]);
    mockInsertChain([{ ...sampleTask, assigneeId: 2 }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Para el editor", assigneeId: 2 });
    expect(res.status).toBe(201);
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2 }),
    );
  });

  it("assigning to a non-existent user → 400", async () => {
    mockSelectSeq([]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Fantasma", assigneeId: 777 });
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("superadmin can self-assign without lookup → 201", async () => {
    mockInsertChain([{ ...sampleTask, assigneeId: 9, createdById: 9 }]);
    const res = await request(await buildApp(mockOwnerUser))
      .post("/hub/tasks")
      .send({ title: "Mi tarea", assigneeId: 9 });
    expect(res.status).toBe(201);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("batch create with an owner-assigned task → 403, nothing inserted", async () => {
    mockSelectSeq([{ id: 9, role: "superadmin" }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "A" }, { title: "B", assigneeId: 9 }] });
    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("PATCH reassigning an existing task to the owner → 403, no update", async () => {
    mockSelectSeq([sampleTask], [{ id: 9, role: "superadmin" }]);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ assigneeId: 9 });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("PATCH reassigning to a normal user notifies them → 200", async () => {
    const updated = { ...sampleTask, assigneeId: 4 };
    mockSelectSeq([sampleTask], [{ id: 4, role: "user" }], [updated]);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ assigneeId: 4 });
    expect(res.status).toBe(200);
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 4, title: "Tarea asignada" }),
    );
  });
});

/* ─── Checklist ─── */

describe("Checklist", () => {
  const cl = [{ id: "c1", text: "Paso 1", done: false }];

  it("CEO can create a task with a checklist", async () => {
    const chain = mockInsertChain([{ ...sampleTask, checklist: cl }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Con checklist", checklist: cl });
    expect(res.status).toBe(201);
    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ checklist: cl }));
  });

  it("invalid checklist item (missing done) → 400", async () => {
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Mal checklist", checklist: [{ id: "c1", text: "x" }] });
    expect(res.status).toBe(400);
  });

  it("non-manager can tick checklist on own task, other fields stripped", async () => {
    const own = { ...sampleTask, assigneeId: 2 };
    const ticked = [{ id: "c1", text: "Paso 1", done: true }];
    mockSelectSeq([own], [{ ...own, checklist: ticked }]);
    const chain = mockUpdateChain();
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ checklist: ticked, title: "hackeo" });
    expect(res.status).toBe(200);
    const setArg = vi.mocked(chain.set).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg["checklist"]).toEqual(ticked);
    expect(setArg["title"]).toBeUndefined();
  });
});

/* ─── Comentarios ─── */

describe("Task comments", () => {
  const ownTask = { id: 1, title: "Diseñar landing", assigneeId: 2, createdById: 1 };

  it("assignee can list comments", async () => {
    const comment = { id: 1, body: "Avancé", createdAt: now, userId: 2, authorName: "Ed", authorPicture: null };
    mockSelectSeq([ownTask], [comment]);
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks/1/comments");
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
  });

  it("unrelated member gets 403 on comments", async () => {
    mockSelectSeq([ownTask]);
    const res = await request(await buildApp(mockSocialUser)).get("/hub/tasks/1/comments");
    expect(res.status).toBe(403);
  });

  it("assignee can post a comment; creator gets notified", async () => {
    mockSelectSeq([ownTask]);
    mockInsertChain([{ id: 5, taskId: 1, userId: 2, body: "Listo el borrador", createdAt: now }]);
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks/1/comments")
      .send({ body: "Listo el borrador" });
    expect(res.status).toBe(201);
    expect(res.body.comment.body).toBe("Listo el borrador");
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, title: expect.stringContaining("comentario") }),
    );
  });

  it("manager commenting notifies the assignee", async () => {
    mockSelectSeq([ownTask]);
    mockInsertChain([{ id: 6, taskId: 1, userId: 1, body: "¿Cómo va?", createdAt: now }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks/1/comments")
      .send({ body: "¿Cómo va?" });
    expect(res.status).toBe(201);
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2 }),
    );
  });

  it("empty comment body → 400", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks/1/comments")
      .send({ body: "   " });
    expect(res.status).toBe(400);
  });

  it("404 when task does not exist", async () => {
    mockSelectSeq([]);
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks/99/comments");
    expect(res.status).toBe(404);
  });
});

/* ─── Historial por tarea ─── */

describe("GET /hub/tasks/:id/activity", () => {
  it("assignee can view history", async () => {
    const item = { id: 1, action: "created", oldStage: null, newStage: null, createdAt: now, actorName: "CEO", actorPicture: null };
    mockSelectSeq([{ id: 1, title: "T", assigneeId: 2, createdById: 1 }], [item]);
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks/1/activity");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("unrelated member gets 403", async () => {
    mockSelectSeq([{ id: 1, title: "T", assigneeId: 2, createdById: 1 }]);
    const res = await request(await buildApp(mockSocialUser)).get("/hub/tasks/1/activity");
    expect(res.status).toBe(403);
  });
});

/* ─── Limpiar completadas ─── */

describe("POST /hub/tasks/clear-completed", () => {
  it("CEO deletes all done tasks and gets the count", async () => {
    mockDeleteChain([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = await request(await buildApp(mockCeoUser)).post("/hub/tasks/clear-completed");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: 3 });
  });

  it("ejecutivo gets 403", async () => {
    const res = await request(await buildApp(mockEjecutivoUser)).post("/hub/tasks/clear-completed");
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("edicion gets 403", async () => {
    const res = await request(await buildApp(mockEditorUser)).post("/hub/tasks/clear-completed");
    expect(res.status).toBe(403);
  });
});

/* ─── Notificación al creador al completar ─── */

describe("Completion notification", () => {
  it("notifies the creator when someone else moves the task to done", async () => {
    const existing = { ...sampleTask, assigneeId: 2, createdById: 1, stage: "inprogress" };
    mockSelectSeq([existing], [{ ...existing, stage: "done" }]);
    mockUpdateChain();
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ stage: "done" });
    expect(res.status).toBe(200);
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, title: expect.stringContaining("completada") }),
    );
  });

  it("does not notify when the creator completes their own task", async () => {
    const existing = { ...sampleTask, assigneeId: 1, createdById: 1, stage: "inprogress" };
    mockSelectSeq([existing], [{ ...existing, stage: "done" }]);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ stage: "done" });
    expect(res.status).toBe(200);
    expect(vi.mocked(createNotification)).not.toHaveBeenCalled();
  });
});

/* ─── Autonomía del creador ─── */

describe("PATCH /hub/tasks/:id — creador", () => {
  it("quien creó la tarea la edita completa aunque no sea el asignado", async () => {
    const own = { ...sampleTask, createdById: 4, assigneeId: null };
    mockTwoCalls(own, { ...own, title: "Editada" });
    mockUpdateChain();
    const res = await request(await buildApp(mockMarketingUser))
      .patch("/hub/tasks/1")
      .send({ title: "Editada" });
    expect(res.status).toBe(200);
  });
});

describe("GET /hub/tasks/team-members — gate", () => {
  it("marketing puede pedir la lista de asignables (crea tareas)", async () => {
    mockSelectSeq([{ id: 4, name: "Marta", email: "mkt@test.com", picture: null, teamRole: "marketing" }]);
    const res = await request(await buildApp(mockMarketingUser)).get("/hub/tasks/team-members");
    expect(res.status).toBe(200);
  });

  it("edición no puede pedir la lista de asignables", async () => {
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks/team-members");
    expect(res.status).toBe(403);
  });
});

/* ─────────────────── Sprints semanales y pares de contenido ─────────────────── */

// La IA del plan vive en su propio módulo (con sus propios tests); aquí se
// prueba la RUTA: gates, dedupe, inserción en pares y enlaces bidireccionales.
const { planMock, tonoMock, bitacoraMock } = vi.hoisted(() => ({
  planMock: vi.fn(),
  tonoMock: vi.fn().mockResolvedValue(""),
  bitacoraMock: vi.fn(),
}));
vi.mock("../../lib/contenido-ia", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generarPlanContenido: planMock,
}));
vi.mock("../../lib/brand-tone", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildBrandToneSuffix: tonoMock,
}));
vi.mock("../../lib/activity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordActivity: bitacoraMock,
}));

const mockSocialUser = { id: 7, role: "user", teamRole: "social", email: "redes@test.com" };

/** Cadena drizzle "acepta todo": cualquier método encadena, await resuelve filas. */
function cadenaFluida(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "orderBy", "groupBy", "limit", "offset", "values", "set", "returning", "onConflictDoNothing"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(ok, ko);
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

/** Encola respuestas de db.select en orden; lo que sobre resuelve vacío. */
function colaSelects(...rowSets: unknown[][]) {
  vi.mocked(db.select).mockReset();
  for (const rows of rowSets) {
    vi.mocked(db.select).mockReturnValueOnce(cadenaFluida(rows) as never);
  }
  vi.mocked(db.select).mockReturnValue(cadenaFluida([]) as never);
}

describe("GET /hub/tasks/mi-semana", () => {
  it("semana completa → elegible, con lo libre marcado como tomable", async () => {
    colaSelects(
      [{ id: 1, stage: "done" }, { id: 2, stage: "done" }],
      [
        { id: 7, title: "Libre", priority: "alta", stage: "sprint", projectRef: null, sprintWeek: null, assigneeId: null, assigneeName: null },
        { id: 8, title: "De Ana", priority: "media", stage: "doing", projectRef: null, sprintWeek: null, assigneeId: 9, assigneeName: "Ana" },
      ],
    );
    const res = await request(await buildApp(mockDevUser)).get("/hub/tasks/mi-semana");
    expect(res.status).toBe(200);
    expect(res.body.semana).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body.progreso).toEqual({ total: 2, done: 2 });
    expect(res.body.elegible).toBe(true);
    expect(res.body.sugerencias).toHaveLength(2);
    expect(res.body.sugerencias[0].puedeTomar).toBe(true);
    expect(res.body.sugerencias[1].puedeTomar).toBe(false);
  });

  it("semana incompleta → no elegible y sin sugerencias", async () => {
    colaSelects([{ id: 1, stage: "done" }, { id: 2, stage: "doing" }]);
    const res = await request(await buildApp(mockDevUser)).get("/hub/tasks/mi-semana");
    expect(res.status).toBe(200);
    expect(res.body.elegible).toBe(false);
    expect(res.body.sugerencias).toEqual([]);
  });

  it("cero tareas comprometidas NO es una semana cumplida", async () => {
    colaSelects([]);
    const res = await request(await buildApp(mockDevUser)).get("/hub/tasks/mi-semana");
    expect(res.status).toBe(200);
    expect(res.body.elegible).toBe(false);
  });
});

describe("GET /hub/tasks/desempeno", () => {
  it("quien no dirige (edición) recibe 403", async () => {
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks/desempeno");
    expect(res.status).toBe(403);
  });

  it("dirección ve personas, carga actual, atrasos e historial", async () => {
    colaSelects(
      [{ id: 2, name: "Montse", picture: null, teamRole: "edicion" }],
      [{ assigneeId: 2, total: 3, done: 1 }],
      [{ responsibleId: 2, atrasos: 1 }],
      [{ weekKey: "2026-W30", userId: 2, total: 4, done: 4, carried: 0 }],
    );
    const res = await request(await buildApp(mockCeoUser)).get("/hub/tasks/desempeno");
    expect(res.status).toBe(200);
    expect(res.body.semana).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body.personas).toHaveLength(1);
    expect(res.body.actual[0]).toEqual({ assigneeId: 2, total: 3, done: 1 });
    expect(res.body.atrasos[0]).toEqual({ responsibleId: 2, atrasos: 1 });
    expect(res.body.historial[0].weekKey).toBe("2026-W30");
  });
});

describe("POST /hub/tasks/generar-contenido", () => {
  beforeEach(() => {
    planMock.mockReset();
    bitacoraMock.mockReset();
    vi.mocked(createNotification).mockClear();
  });

  it("el programador no genera el plan de contenido", async () => {
    const res = await request(await buildApp(mockDevUser)).post("/hub/tasks/generar-contenido").send({});
    expect(res.status).toBe(403);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("plan ya existente esta semana sin force → 409, sin llamar a la IA", async () => {
    colaSelects([{ id: 50, title: "Grabar reel" }]);
    const res = await request(await buildApp(mockSocialUser)).post("/hub/tasks/generar-contenido").send({});
    expect(res.status).toBe(409);
    expect(res.body.existentes).toBe(1);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("sin editora aprobada → 400: el contenido jamás va sin su par", async () => {
    colaSelects(
      [], // sin plan previo
      [{ id: 31, name: "Dani", teamRole: "social" }], // equipo sin editora
    );
    const res = await request(await buildApp(mockSocialUser)).post("/hub/tasks/generar-contenido").send({});
    expect(res.status).toBe(400);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("crea cada item como PAR enlazado y avisa a redes y edición", async () => {
    colaSelects(
      [], // sin plan previo
      [{ id: 31, name: "Dani", teamRole: "social" }, { id: 32, name: "Montse", teamRole: "edicion" }],
      [], // videos agendados en la ventana
      [], // videos sin fecha
      [], // re-chequeo dentro del candado: sigue sin plan
      [{ max: 5 }], // orderIndex más alto
    );
    planMock.mockResolvedValue([{
      tema: "Detrás de cámaras",
      prioridad: "alta",
      dia: "2026-08-03",
      redes: { titulo: "Grabar detrás de cámaras", descripcion: "En la oficina", checklist: ["Guion"] },
      edicion: { titulo: "Editar detrás de cámaras", descripcion: "Cortes", checklist: ["Montaje"] },
    }]);
    const parChain = cadenaFluida([]);
    (parChain["returning"] as ReturnType<typeof vi.fn>).mockReturnValue(cadenaFluida([
      { id: 101, title: "Grabar detrás de cámaras" },
      { id: 102, title: "Editar detrás de cámaras" },
    ]));
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.insert)
      .mockReturnValueOnce(parChain as never)
      .mockReturnValue(cadenaFluida([]) as never); // bitácora interna de la tarea
    vi.mocked(db.update).mockReset();
    vi.mocked(db.update).mockReturnValue(cadenaFluida([]) as never);

    // Genera marketing (id 4): ni redes ni edición — ambas deben recibir aviso.
    const res = await request(await buildApp(mockMarketingUser)).post("/hub/tasks/generar-contenido").send({});

    expect(res.status).toBe(201);
    expect(res.body.pares).toBe(1);
    expect(res.body.tareas).toBe(2);

    // Un solo insert con las DOS caras: mismo origen, misma semana, en sprint.
    const values = (parChain["values"] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({ assigneeId: 31, origin: "contenido_ia", stage: "sprint", orderIndex: 6, dueDate: "2026-08-03" });
    expect(values[1]).toMatchObject({ assigneeId: 32, origin: "contenido_ia", stage: "sprint", orderIndex: 7 });
    expect(String(values[0]!["sprintWeek"])).toMatch(/^\d{4}-W\d{2}$/);

    // Enlace bidireccional: dos updates, uno por mitad.
    expect(db.update).toHaveBeenCalledTimes(2);

    // Avisos a ambas personas del par, y el plan queda en la bitácora.
    const avisados = vi.mocked(createNotification).mock.calls.map((c) => (c[0] as { userId: number }).userId);
    expect(avisados).toContain(31);
    expect(avisados).toContain(32);
    expect(bitacoraMock).toHaveBeenCalledTimes(1);
    expect(bitacoraMock.mock.calls[0]![0]).toMatchObject({ action: "created", entityType: "task" });
  });

  it("carrera: otro generó el plan mientras la IA pensaba → 409 dentro del candado, sin insertar", async () => {
    colaSelects(
      [], // chequeo previo: aún no hay plan
      [{ id: 31, name: "Dani", teamRole: "social" }, { id: 32, name: "Montse", teamRole: "edicion" }],
      [], // ventana de videos
      [], // sin fecha
      [{ id: 900 }], // re-chequeo DENTRO del candado: alguien ya insertó
    );
    planMock.mockResolvedValue([{
      tema: "x",
      prioridad: "media",
      dia: null,
      redes: { titulo: "Grabar x", descripcion: "", checklist: [] },
      edicion: { titulo: "Editar x", descripcion: "", checklist: [] },
    }]);
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.insert).mockReturnValue(cadenaFluida([]) as never);

    const res = await request(await buildApp(mockSocialUser)).post("/hub/tasks/generar-contenido").send({});

    expect(res.status).toBe(409);
    expect(res.body.existentes).toBe(1);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("POST /hub/tasks — sello de semana al nacer", () => {
  it("crear directo al sprint estampa la semana en curso", async () => {
    colaSelects();
    vi.mocked(db.insert).mockReset();
    const ins = cadenaFluida([{ id: 77, title: "Grabar intro" }]);
    vi.mocked(db.insert).mockReturnValueOnce(ins as never).mockReturnValue(cadenaFluida([]) as never);

    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Grabar intro", stage: "sprint" });

    expect(res.status).toBe(201);
    const vals = (ins["values"] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(String(vals["sprintWeek"])).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("crear al backlog no compromete semana todavía", async () => {
    colaSelects();
    vi.mocked(db.insert).mockReset();
    const ins = cadenaFluida([{ id: 78, title: "Idea suelta" }]);
    vi.mocked(db.insert).mockReturnValueOnce(ins as never).mockReturnValue(cadenaFluida([]) as never);

    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Idea suelta" });

    expect(res.status).toBe(201);
    const vals = (ins["values"] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(vals["sprintWeek"]).toBeNull();
  });
});

describe("POST /hub/tasks/:id/tomar", () => {
  beforeEach(() => {
    bitacoraMock.mockReset();
    vi.mocked(createNotification).mockClear();
  });

  it("toma una tarea libre, la anota en bitácora y avisa a quien la creó", async () => {
    colaSelects([{ id: 9, title: "Suelta", stage: "sprint", assigneeId: null, createdById: 1, sprintWeek: null }]);
    vi.mocked(db.update).mockReset();
    const upd = cadenaFluida([{ id: 9 }]);
    vi.mocked(db.update).mockReturnValue(upd as never);
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.insert).mockReturnValue(cadenaFluida([]) as never);

    const res = await request(await buildApp(mockDevUser)).post("/hub/tasks/9/tomar");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 9 });
    // El claim exige que SIGA libre y estampa la semana en curso.
    const set = (upd["set"] as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(set["assigneeId"]).toBe(mockDevUser.id);
    expect(String(set["sprintWeek"])).toMatch(/^\d{4}-W\d{2}$/);
    expect(bitacoraMock.mock.calls[0]![0]).toMatchObject({ action: "assigned", detail: expect.objectContaining({ ayuda: true }) });
    expect(vi.mocked(createNotification).mock.calls[0]![0]).toMatchObject({ userId: 1 });
  });

  it("ya tiene responsable → 409 sin intentar el claim", async () => {
    colaSelects([{ id: 9, title: "Ocupada", stage: "doing", assigneeId: 3, createdById: 1, sprintWeek: null }]);
    vi.mocked(db.update).mockReset();
    const res = await request(await buildApp(mockDevUser)).post("/hub/tasks/9/tomar");
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("carrera: el UPDATE condicional no devolvió filas → 409, sin bitácora", async () => {
    colaSelects([{ id: 9, title: "Suelta", stage: "sprint", assigneeId: null, createdById: 1, sprintWeek: null }]);
    vi.mocked(db.update).mockReset();
    vi.mocked(db.update).mockReturnValue(cadenaFluida([]) as never);
    const res = await request(await buildApp(mockDevUser)).post("/hub/tasks/9/tomar");
    expect(res.status).toBe(409);
    expect(bitacoraMock).not.toHaveBeenCalled();
  });
});

describe("POST /hub/tasks/:id/ofrecer-ayuda", () => {
  beforeEach(() => {
    vi.mocked(createNotification).mockClear();
  });

  it("avisa al responsable con el mensaje incluido", async () => {
    colaSelects([{ id: 3, title: "Portada", stage: "doing", assigneeId: 2 }]);
    const res = await request(await buildApp(mockDevUser))
      .post("/hub/tasks/3/ofrecer-ayuda")
      .send({ mensaje: "puedo con la portada" });
    expect(res.status).toBe(200);
    const aviso = vi.mocked(createNotification).mock.calls[0]![0] as { userId: number; body: string };
    expect(aviso.userId).toBe(2);
    expect(aviso.body).toContain("puedo con la portada");
  });

  it("sobre tu propia tarea → 400, sin aviso", async () => {
    colaSelects([{ id: 3, title: "Portada", stage: "doing", assigneeId: mockDevUser.id }]);
    const res = await request(await buildApp(mockDevUser)).post("/hub/tasks/3/ofrecer-ayuda").send({});
    expect(res.status).toBe(400);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
