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
vi.mock("../../lib/hr-ops", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  seedOnboardingTemplatesIfEmpty: vi.fn().mockResolvedValue(undefined),
  leaveBalance: vi.fn(),
  getHrRecipientIds: vi.fn().mockResolvedValue([1, 6]),
  computePerformanceMetrics: vi.fn().mockResolvedValue({
    periodKey: "2026-07", goalsTotal: 4, goalsMet: 3, attendanceMinutes: 6000, attendanceDays: 18, leaveDays: 2,
  }),
}));

import { db } from "@workspace/db";
import { createNotification } from "../../lib/notifications";
import { leaveBalance } from "../../lib/hr-ops";

const rrhhUser = { id: 6, role: "user", teamRole: "rrhh", email: "rh@t.com", name: "RRHH" };
const devUser = { id: 5, role: "user", teamRole: "dev", email: "dev@t.com", name: "Dev" };

async function buildOps(user: Record<string, unknown>) {
  const mod = await import("./ops");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as express.Request & { user: unknown }).user = user; next(); });
  app.use(mod.default);
  return app;
}

async function buildSelf(user: Record<string, unknown>) {
  const mod = await import("./self");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as express.Request & { user: unknown }).user = user; next(); });
  app.use(mod.default);
  return app;
}

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // La transacción ejecuta el callback con el propio mock de db como tx.
  vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db) as never);
  vi.mocked(db.execute).mockResolvedValue({ rows: [] } as never);
});

describe("authz de gestión RRHH", () => {
  it("un rol sin canManagePeople recibe 403 en /hr/leave", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([devUser]));
    const res = await request(await buildOps(devUser)).get("/hr/leave");
    expect(res.status).toBe(403);
  });

  it("RRHH puede listar solicitudes", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([]));
    const res = await request(await buildOps(rrhhUser)).get("/hr/leave");
    expect(res.status).toBe(200);
  });

  it("403 al editar plantillas sin permiso", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([devUser]));
    const res = await request(await buildOps(devUser))
      .put("/hr/onboarding/templates/dev")
      .send({ items: ["a"] });
    expect(res.status).toBe(403);
  });
});

describe("aprobación de vacaciones y saldo", () => {
  const pendiente = {
    id: 9, userId: 5, type: "vacaciones", startDate: "2026-08-03", endDate: "2026-08-07",
    days: 5, status: "pendiente",
  };

  it("rechaza aprobar si el saldo real no alcanza (nunca negativo)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([pendiente]));
    vi.mocked(leaveBalance).mockResolvedValueOnce({
      allowance: 15, usedDays: 12, pendingDays: 5, available: 0, year: "2026",
    });
    const res = await request(await buildOps(rrhhUser))
      .patch("/hr/leave/9").send({ action: "aprobar" });
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("aprueba con saldo suficiente, notifica y descuenta solo", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([pendiente]));
    vi.mocked(leaveBalance).mockResolvedValueOnce({
      allowance: 15, usedDays: 5, pendingDays: 5, available: 5, year: "2026",
    });
    const upd = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...pendiente, status: "aprobada" }]),
    };
    vi.mocked(db.update).mockReturnValue(upd as never);
    const res = await request(await buildOps(rrhhUser))
      .patch("/hr/leave/9").send({ action: "aprobar" });
    expect(res.status).toBe(200);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
  });

  it("409 si la solicitud ya fue resuelta", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([{ ...pendiente, status: "aprobada" }]));
    const res = await request(await buildOps(rrhhUser))
      .patch("/hr/leave/9").send({ action: "rechazar" });
    expect(res.status).toBe(409);
  });
});

describe("evaluaciones", () => {
  it("cierra una evaluación con métricas congeladas", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([{ id: 5, name: "Dev", email: "dev@t.com" }]));
    const ins = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1, userId: 5, periodKey: "2026-07", goalsMet: 3 }]),
    };
    vi.mocked(db.insert).mockReturnValue(ins as never);
    const res = await request(await buildOps(rrhhUser))
      .post("/hr/reviews").send({ userId: 5, periodKey: "2026-07", comment: "Buen mes" });
    expect(res.status).toBe(201);
    expect(ins.values).toHaveBeenCalledWith(expect.objectContaining({ goalsMet: 3, leaveDays: 2 }));
  });

  it("409 si el período ya está cerrado (conflicto único)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([rrhhUser]))
      .mockReturnValueOnce(selectChain([{ id: 5, name: "Dev", email: "dev@t.com" }]));
    const ins = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.insert).mockReturnValue(ins as never);
    const res = await request(await buildOps(rrhhUser))
      .post("/hr/reviews").send({ userId: 5, periodKey: "2026-07" });
    expect(res.status).toBe(409);
  });

  it("el evaluado NO puede cerrar ni ver métricas de terceros (403)", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([devUser]));
    const res = await request(await buildOps(devUser))
      .post("/hr/reviews").send({ userId: 5, periodKey: "2026-07" });
    expect(res.status).toBe(403);
  });
});

// Fechas dinámicas: el endpoint exige solicitudes "desde hoy en adelante",
// así que un lunes fijo se vence solo (estos tests reventaron el día que
// 2026-08-03 quedó atrás). Próximo lunes → viernes: siempre futuro y siempre
// 5 días hábiles.
const proximoLunes = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
})();
const viernesDeEsaSemana = (() => {
  const d = new Date(`${proximoLunes}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
})();

describe("self-service", () => {
  it("POST /me/leave rechaza vacaciones sin saldo", async () => {
    vi.mocked(leaveBalance).mockResolvedValueOnce({
      allowance: 15, usedDays: 13, pendingDays: 1, available: 1, year: "2026",
    });
    const res = await request(await buildSelf(devUser))
      .post("/me/leave")
      .send({ type: "vacaciones", startDate: proximoLunes, endDate: viernesDeEsaSemana });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Saldo insuficiente/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("POST /me/leave crea la solicitud y notifica a RRHH/dirección", async () => {
    vi.mocked(leaveBalance).mockResolvedValueOnce({
      allowance: 15, usedDays: 0, pendingDays: 0, available: 15, year: "2026",
    });
    const ins = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1, userId: 5, days: 5 }]),
    };
    vi.mocked(db.insert).mockReturnValue(ins as never);
    vi.mocked(db.select).mockReturnValue(selectChain([{ name: "Dev" }]));
    const res = await request(await buildSelf(devUser))
      .post("/me/leave")
      .send({ type: "vacaciones", startDate: proximoLunes, endDate: viernesDeEsaSemana });
    expect(res.status).toBe(201);
    expect(ins.values).toHaveBeenCalledWith(expect.objectContaining({ days: 5, userId: 5 }));
  });

  it("POST /me/leave rechaza fechas pasadas", async () => {
    const res = await request(await buildSelf(devUser))
      .post("/me/leave")
      .send({ type: "permiso", startDate: "2020-01-06", endDate: "2020-01-07" });
    expect(res.status).toBe(400);
  });

  it("DELETE /me/leave/:id solo cancela pendientes propias", async () => {
    const del = {
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.delete).mockReturnValue(del as never);
    const res = await request(await buildSelf(devUser)).delete("/me/leave/99");
    expect(res.status).toBe(404);
  });

  it("PATCH /me/onboarding/items/:idx marca el paso propio", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([{
      id: 2, userId: 5, completedAt: null,
      items: [{ text: "a", done: false, doneAt: null }, { text: "b", done: false, doneAt: null }],
    }]));
    const upd = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 2 }]),
    };
    vi.mocked(db.update).mockReturnValue(upd as never);
    const res = await request(await buildSelf(devUser))
      .patch("/me/onboarding/items/0").send({ done: true });
    expect(res.status).toBe(200);
    expect(upd.set).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }));
  });
});
