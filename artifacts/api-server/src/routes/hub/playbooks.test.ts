import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));
vi.mock("../../lib/handoffs", () => ({ applyPlaybook: vi.fn() }));

import { db } from "@workspace/db";
import { applyPlaybook } from "../../lib/handoffs";

const ceoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const ventasUser = { id: 3, role: "user", teamRole: "ventas", email: "ve@test.com" };
const legacyEjecutivoUser = { id: 4, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const rrhhUser = { id: 5, role: "user", teamRole: "rrhh", email: "rh@test.com" };
const editorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };

async function buildApp(user: Record<string, unknown>) {
  const mod = await import("./playbooks");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // GET seedIfEmpty: count > 0 → no siembra; luego lista vacía/llena según test.
  vi.mocked(db.select).mockReturnValue(selectChain([{ n: 1 }]) as never);
});

describe("gestión de playbooks (authz)", () => {
  it("POST /hub/playbooks: dirección puede crear", async () => {
    const created = { id: 7, name: "Nuevo", workType: "", description: "", tasks: [], archived: false };
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([created]) }),
    } as never);
    const res = await request(await buildApp(ceoUser)).post("/hub/playbooks").send({ name: "Nuevo" });
    expect(res.status).toBe(201);
  });

  it("POST /hub/playbooks: roles sin gestión reciben 403", async () => {
    for (const user of [rrhhUser, editorUser]) {
      const res = await request(await buildApp(user)).post("/hub/playbooks").send({ name: "X" });
      expect(res.status).toBe(403);
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("PATCH /hub/playbooks/:id: 403 para roles sin gestión", async () => {
    const res = await request(await buildApp(rrhhUser)).patch("/hub/playbooks/1").send({ archived: true });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("aplicar playbook (creación de tareas — authz)", () => {
  it("dirección (ceo, ventas y alias legacy 'ejecutivo') puede aplicar", async () => {
    vi.mocked(applyPlaybook).mockResolvedValue(5);
    for (const user of [ceoUser, ventasUser, legacyEjecutivoUser]) {
      const res = await request(await buildApp(user))
        .post("/hub/playbooks/3/apply")
        .send({ projectRef: "p1" });
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(5);
    }
  });

  it("RRHH (acceso /hub pero sin escritura de tareas) recibe 403 y no crea nada", async () => {
    const res = await request(await buildApp(rrhhUser))
      .post("/hub/playbooks/3/apply")
      .send({ projectRef: "p1" });
    expect(res.status).toBe(403);
    expect(applyPlaybook).not.toHaveBeenCalled();
  });

  it("valida projectRef requerido", async () => {
    const res = await request(await buildApp(ceoUser)).post("/hub/playbooks/3/apply").send({});
    expect(res.status).toBe(400);
    expect(applyPlaybook).not.toHaveBeenCalled();
  });
});
