// Lo delicado de Proyecciones son los permisos (RRHH no ve montos) y que la
// respuesta traiga la serie + recta + proyección coherentes. La matemática
// fina ya está cubierta en lib/proyecciones.test.ts; aquí se prueba la puerta.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela para que el mock de db distinga a cuál se apunta. */
const PAYMENTS = { __table: "contract_payments", fecha: "fecha", monto: "monto" };
const SESSIONS = { __table: "hub_work_sessions", userId: "u", workDate: "d", checkIn: "ci", checkOut: "co" };
const ASSIGN = { __table: "project_assignments", projectRef: "ref", userId: "u", allocationPct: "pct" };
const CLOSURES = { __table: "sprint_week_closures", weekKey: "wk", total: "t", done: "dn" };
const TASKS = { __table: "hub_tasks", completedAt: "ca" };

vi.mock("@workspace/db/schema", () => ({
  contractPayments: PAYMENTS,
  hubWorkSessions: SESSIONS,
  projectAssignments: ASSIGN,
  sprintWeekClosures: CLOSURES,
  hubTasks: TASKS,
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  isNotNull: (a: unknown) => ({ isNotNull: a }),
}));

let boardData: Record<string, unknown> = {};
vi.mock("../../lib/hub-board", () => ({
  resolveBoard: async () => ({ boardUserId: 1, data: boardData, owner: null, version: 0 }),
}));

const rows: {
  payments: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  closures: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
} = { payments: [], sessions: [], assignments: [], closures: [], tasks: [] };

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    const resolveRows = () => {
      if (table === PAYMENTS) return rows.payments;
      if (table === SESSIONS) return rows.sessions;
      if (table === ASSIGN) return rows.assignments;
      if (table === CLOSURES) return rows.closures;
      if (table === TASKS) return rows.tasks;
      return [];
    };
    const chain: Record<string, unknown> = {};
    chain.where = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveRows());
    return chain;
  };
  return { db: { select: () => ({ from }) } };
});

const CEO = { id: 1, role: "user", teamRole: "ceo" };
const VENDEDORA = { id: 7, role: "user", teamRole: "ventas" };
const RRHH = { id: 8, role: "user", teamRole: "rrhh" };
const EDITORA = { id: 9, role: "user", teamRole: "editora" };

async function api(as: Record<string, unknown>, path: string) {
  const router = (await import("./proyecciones")).default;
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: unknown }).user = as;
    next();
  });
  app.use("/api", router);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`);
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  boardData = {};
  rows.payments = [];
  rows.sessions = [];
  rows.assignments = [];
  rows.closures = [];
  rows.tasks = [];
});

describe("GET /hub/proyecciones/series", () => {
  it("rechaza a quien no es dirección, ventas ni RRHH", async () => {
    const r = await api(EDITORA, "/hub/proyecciones/series");
    expect(r.status).toBe(403);
  });

  it("para RRHH las series con montos vienen como no disponibles", async () => {
    const r = await api(RRHH, "/hub/proyecciones/series");
    expect(r.status).toBe(200);
    const series = r.body.series as { id: string; disponible: boolean }[];
    const porId = new Map(series.map((s) => [s.id, s.disponible]));
    expect(porId.get("ventas")).toBe(false);
    expect(porId.get("cobros")).toBe(false);
    expect(porId.get("horas")).toBe(true);
    expect(porId.get("cumplimiento")).toBe(true);
    expect(porId.get("produccion")).toBe(true);
  });

  it("lista solo proyectos con horas imputadas, con su nombre del tablero", async () => {
    boardData = {
      projects: [
        { id: "p1", name: "Sitio Zeta" },
        { id: "p2", name: "App Alfa" },
        { id: "p3", name: "Sin gente" },
      ],
    };
    rows.assignments = [{ projectRef: "p1" }, { projectRef: "p2" }];
    const r = await api(CEO, "/hub/proyecciones/series");
    expect(r.body.proyectos).toEqual([
      { id: "p2", nombre: "App Alfa" },
      { id: "p1", nombre: "Sitio Zeta" },
    ]);
  });
});

describe("GET /hub/proyecciones/datos", () => {
  it("RRHH no puede pedir series con montos", async () => {
    for (const serie of ["ventas", "cobros"]) {
      const r = await api(RRHH, `/hub/proyecciones/datos?serie=${serie}`);
      expect(r.status).toBe(403);
    }
  });

  it("valida serie y horizonte", async () => {
    expect((await api(CEO, "/hub/proyecciones/datos?serie=magia")).status).toBe(400);
    expect((await api(CEO, "/hub/proyecciones/datos?serie=horas&horizonte=9")).status).toBe(400);
  });

  it("ventas: arma la serie desde los contratos ganados y proyecta meses siguientes", async () => {
    boardData = {
      contracts: [
        { status: "activo", issuedAt: "2026-01-10", doc: { modules: [{ price: 100 }] } },
        { status: "activo", issuedAt: "2026-02-12", doc: { modules: [{ price: 200 }] } },
        { status: "activo", issuedAt: "2026-03-15", doc: { modules: [{ price: 300 }] } },
        { status: "perdido", issuedAt: "2026-03-20", doc: { modules: [{ price: 999 }] } },
      ],
    };
    const r = await api(VENDEDORA, "/hub/proyecciones/datos?serie=ventas&horizonte=2");
    expect(r.status).toBe(200);
    expect(r.body.historico).toEqual([
      { periodo: "2026-01", valor: 100 },
      { periodo: "2026-02", valor: 200 },
      { periodo: "2026-03", valor: 300 },
    ]);
    expect(r.body.pendiente).toBe(100);
    expect(r.body.r2).toBe(1);
    expect(r.body.proyeccion).toEqual([
      { periodo: "2026-04", valor: 400 },
      { periodo: "2026-05", valor: 500 },
    ]);
    expect((r.body.serie as { unidad: string }).unidad).toBe("clp");
  });

  it("horas: RRHH sí puede, y el proyecto elegido aplica el % de dedicación", async () => {
    rows.sessions = [
      { userId: 1, workDate: "2026-01-05", checkIn: new Date("2026-01-05T12:00:00Z"), checkOut: new Date("2026-01-05T20:00:00Z") },
      { userId: 2, workDate: "2026-01-06", checkIn: new Date("2026-01-06T12:00:00Z"), checkOut: new Date("2026-01-06T20:00:00Z") },
    ];
    rows.assignments = [{ userId: 1, allocationPct: 50 }];
    const r = await api(RRHH, "/hub/proyecciones/datos?serie=horas&proyecto=p1");
    expect(r.status).toBe(200);
    // Solo el usuario 1 (8 h × 50 %); el 2 no está asignado al proyecto.
    expect(r.body.historico).toEqual([{ periodo: "2026-01", valor: 4 }]);
    expect(r.body.proyecto).toBe("p1");
  });

  it("cumplimiento: serie semanal con techo 100 en la proyección", async () => {
    rows.closures = [
      { weekKey: "2026-W28", total: 10, done: 6 },
      { weekKey: "2026-W29", total: 10, done: 8 },
      { weekKey: "2026-W30", total: 10, done: 9 },
    ];
    const r = await api(CEO, "/hub/proyecciones/datos?serie=cumplimiento&horizonte=4");
    expect(r.status).toBe(200);
    expect((r.body.serie as { tipoPeriodo: string }).tipoPeriodo).toBe("semana");
    const proyeccion = r.body.proyeccion as { periodo: string; valor: number }[];
    expect(proyeccion.map((p) => p.periodo)).toEqual(["2026-W31", "2026-W32", "2026-W33", "2026-W34"]);
    for (const p of proyeccion) expect(p.valor).toBeLessThanOrEqual(100);
  });

  it("el rango recorta el histórico antes de ajustar", async () => {
    rows.payments = [
      { fecha: "2025-01-10", monto: 900 },
      { fecha: "2026-01-10", monto: 100 },
      { fecha: "2026-02-10", monto: 200 },
    ];
    const r = await api(CEO, "/hub/proyecciones/datos?serie=cobros&rango=2");
    expect(r.status).toBe(200);
    expect(r.body.historico).toEqual([
      { periodo: "2026-01", valor: 100 },
      { periodo: "2026-02", valor: 200 },
    ]);
  });

  it("con un solo punto no inventa tendencia: proyección vacía y pendiente null", async () => {
    rows.payments = [{ fecha: "2026-01-10", monto: 100 }];
    const r = await api(CEO, "/hub/proyecciones/datos?serie=cobros");
    expect(r.status).toBe(200);
    expect(r.body.pendiente).toBeNull();
    expect(r.body.proyeccion).toEqual([]);
  });

  it("producción: RRHH también puede (no es serie de dinero) y cuenta tareas por mes", async () => {
    rows.tasks = [
      { completedAt: "2026-01-10T15:00:00Z" },
      { completedAt: "2026-01-20T15:00:00Z" },
      { completedAt: "2026-02-05T15:00:00Z" },
    ];
    const r = await api(RRHH, "/hub/proyecciones/datos?serie=produccion");
    expect(r.status).toBe(200);
    expect(r.body.historico).toEqual([
      { periodo: "2026-01", valor: 2 },
      { periodo: "2026-02", valor: 1 },
    ]);
    expect((r.body.serie as { unidad: string }).unidad).toBe("unidades");
  });
});
