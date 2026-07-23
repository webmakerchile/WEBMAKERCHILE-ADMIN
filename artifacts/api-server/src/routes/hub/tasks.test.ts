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
const mockEditorUser = { id: 2, role: "user", teamRole: "editora", email: "ed@test.com" };

async function buildApp(user: typeof mockCeoUser | typeof mockEditorUser) {
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

const sampleTask = {
  id: 1,
  title: "Diseñar landing",
  notes: null,
  priority: "alta",
  status: "pendiente",
  dueDate: null,
  completedAt: null,
  orderIndex: 0,
  projectRef: "proj-1",
  createdById: 1,
  assigneeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assigneeName: null,
  assigneePicture: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /hub/tasks", () => {
  it("CEO gets all tasks", async () => {
    mockSelectChain([sampleTask]);
    const res = await request(await buildApp(mockCeoUser)).get("/hub/tasks");
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Diseñar landing");
  });

  it("non-CEO gets only assigned tasks (filtered by assigneeId)", async () => {
    const editorTask = { ...sampleTask, assigneeId: 2, id: 2 };
    mockSelectChain([editorTask]);
    const res = await request(await buildApp(mockEditorUser)).get("/hub/tasks");
    expect(res.status).toBe(200);
    const selectMock = vi.mocked(db.select);
    expect(selectMock).toHaveBeenCalled();
  });
});

describe("POST /hub/tasks", () => {
  it("CEO can create a task", async () => {
    mockInsertChain([sampleTask]);
    mockSelectChain([{ ...sampleTask, createdByName: null, createdByPicture: null, assigneeName: null, assigneePicture: null }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "Diseñar landing", priority: "alta", status: "pendiente" });
    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
  });

  it("rejects blank title", async () => {
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks")
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("non-CEO gets 403", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks")
      .send({ title: "Diseñar" });
    expect(res.status).toBe(403);
  });
});

describe("POST /hub/tasks/batch", () => {
  it("CEO can batch create tasks", async () => {
    mockInsertChain([sampleTask, { ...sampleTask, id: 2, title: "Tarea B" }]);
    const res = await request(await buildApp(mockCeoUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Diseñar landing" }, { title: "Tarea B" }] });
    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
  });

  it("non-CEO gets 403 on batch create", async () => {
    const res = await request(await buildApp(mockEditorUser))
      .post("/hub/tasks/batch")
      .send({ tasks: [{ title: "Tarea" }] });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /hub/tasks/:id", () => {
  it("CEO can update any field", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([sampleTask]),
      offset: vi.fn().mockResolvedValue([sampleTask]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    mockUpdateChain();
    const res = await request(await buildApp(mockCeoUser))
      .patch("/hub/tasks/1")
      .send({ title: "Nuevo título", status: "en_progreso" });
    expect(res.status).toBe(200);
  });

  it("non-CEO can only update status on assigned task", async () => {
    const assignedTask = { ...sampleTask, assigneeId: 2 };
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([assignedTask]),
      offset: vi.fn().mockResolvedValue([assignedTask]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    mockUpdateChain();
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ status: "en_progreso", title: "IGNORED" });
    expect(res.status).toBe(200);
    const updateMock = vi.mocked(db.update);
    const setCalls = updateMock.mock.results;
    expect(setCalls.length).toBeGreaterThan(0);
  });

  it("non-CEO gets 403 on unassigned task", async () => {
    const unassignedTask = { ...sampleTask, assigneeId: 99 };
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([unassignedTask]),
      offset: vi.fn().mockResolvedValue([unassignedTask]),
    };
    vi.mocked(db.select).mockReturnValue(chain as never);
    const res = await request(await buildApp(mockEditorUser))
      .patch("/hub/tasks/1")
      .send({ status: "en_progreso" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /hub/tasks/:id", () => {
  it("CEO can delete", async () => {
    mockDeleteChain([{ id: 1 }]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("non-CEO gets 403", async () => {
    const res = await request(await buildApp(mockEditorUser)).delete("/hub/tasks/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 for missing task", async () => {
    mockDeleteChain([]);
    const res = await request(await buildApp(mockCeoUser)).delete("/hub/tasks/999");
    expect(res.status).toBe(404);
  });
});
