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
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));
vi.mock("../../lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("../../lib/activity", () => ({ recordActivity: vi.fn(), sanitizeLabel: (s: string) => s }));
vi.mock("../../lib/sla", () => ({
  seedSlaPoliciesIfEmpty: vi.fn().mockResolvedValue(undefined),
  getDireccionIds: vi.fn().mockResolvedValue([1]),
  stageLabel: (s: string) => s,
}));

import { db } from "@workspace/db";
import { recordActivity } from "../../lib/activity";
import { createNotification } from "../../lib/notifications";

const ceoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@t.com", name: "CEO", approvalStatus: "approved" };
const ventasUser = { id: 3, role: "user", teamRole: "ventas", email: "ve@t.com", name: "Ventas" };
const devUser = { id: 5, role: "user", teamRole: "dev", email: "dev@t.com", name: "Dev" };
const rrhhUser = { id: 6, role: "user", teamRole: "rrhh", email: "rh@t.com", name: "RRHH" };

async function buildApp(user: Record<string, unknown>) {
  const mod = await import("./index");
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
    groupBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /team/workload", () => {
  it("cualquier usuario autenticado ve los contadores con semáforo", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([devUser]) as never) // loadMe
      .mockReturnValueOnce(selectChain([
        { id: 5, name: "Dev", email: "dev@t.com", picture: null },
        { id: 7, name: "Otro", email: "o@t.com", picture: null },
      ]) as never)
      .mockReturnValueOnce(selectChain([{ userId: 5, n: 6 }]) as never) // tareas
      .mockReturnValueOnce(selectChain([{ userId: 5, n: 3 }]) as never); // tickets

    const res = await request(await buildApp(devUser)).get("/team/workload");
    expect(res.status).toBe(200);
    const dev = res.body.members.find((m: { id: number }) => m.id === 5);
    expect(dev).toMatchObject({ openTasks: 6, openTickets: 3, total: 9, semaphore: "red" });
    const otro = res.body.members.find((m: { id: number }) => m.id === 7);
    expect(otro).toMatchObject({ total: 0, semaphore: "green" });
    // Solo contadores: nunca títulos ni montos.
    expect(JSON.stringify(res.body)).not.toMatch(/title|label|monto/);
  });

  it("401 sin sesión", async () => {
    const res = await request(await buildApp({})).get("/team/workload");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /sla/policies/:id (authz)", () => {
  it("dirección (ceo) puede ajustar", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([ceoUser]) as never);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 2, maxHours: 12 }]) }),
      }),
    } as never);
    const res = await request(await buildApp(ceoUser)).patch("/sla/policies/2").send({ maxHours: 12 });
    expect(res.status).toBe(200);
    expect(res.body.maxHours).toBe(12);
  });

  it("ventas también (dirección comercial)", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([ventasUser]) as never);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 2, maxHours: 8 }]) }),
      }),
    } as never);
    const res = await request(await buildApp(ventasUser)).patch("/sla/policies/2").send({ maxHours: 8 });
    expect(res.status).toBe(200);
  });

  it("rrhh no puede (403)", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([rrhhUser]) as never);
    const res = await request(await buildApp(rrhhUser)).patch("/sla/policies/2").send({ maxHours: 8 });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("valida horas", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([ceoUser]) as never);
    const res = await request(await buildApp(ceoUser)).patch("/sla/policies/2").send({ maxHours: -5 });
    expect(res.status).toBe(400);
  });
});

describe("GET /sla/breaches (censura por rol)", () => {
  it("un no-CEO solo ve los suyos (where con responsibleId)", async () => {
    const whereSpy = vi.fn().mockReturnThis();
    const chain: Record<string, unknown> = {
      from: vi.fn().mockReturnThis(),
      where: whereSpy,
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve([]),
    };
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([devUser]) as never)
      .mockReturnValueOnce(chain as never);

    const res = await request(await buildApp(devUser)).get("/sla/breaches?pending=1");
    expect(res.status).toBe(200);
    expect(res.body.isDireccion).toBe(false);
    expect(whereSpy).toHaveBeenCalledWith(expect.anything()); // filtro aplicado
  });
});

describe("POST /sla/breaches/:id/reason", () => {
  const breach = {
    id: 9, entityType: "task", entityId: "10", stage: "doing",
    label: "Atrasada", responsibleId: 5, reason: null,
  };

  function mockUpdateReturning(row: unknown) {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }),
      }),
    } as never);
  }

  it("el responsable registra el motivo: queda en bitácora y avisa a dirección", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([devUser]) as never)
      .mockReturnValueOnce(selectChain([breach]) as never);
    mockUpdateReturning({ ...breach, reason: "El cliente no envió los textos" });

    const res = await request(await buildApp(devUser))
      .post("/sla/breaches/9/reason")
      .send({ reason: "El cliente no envió los textos" });
    expect(res.status).toBe(200);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "commented",
      detail: expect.objectContaining({ sla: "motivo_atraso" }),
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
  });

  it("otro usuario no puede responder por él (403)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]) as never)
      .mockReturnValueOnce(selectChain([breach]) as never);
    const res = await request(await buildApp(rrhhUser))
      .post("/sla/breaches/9/reason")
      .send({ reason: "no fui yo" });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("no se puede sobreescribir un motivo ya registrado (409)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([devUser]) as never)
      .mockReturnValueOnce(selectChain([{ ...breach, reason: "ya explicado" }]) as never);
    const res = await request(await buildApp(devUser))
      .post("/sla/breaches/9/reason")
      .send({ reason: "otro motivo" });
    expect(res.status).toBe(409);
  });
});
