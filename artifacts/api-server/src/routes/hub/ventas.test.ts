import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela para que el mock de db distinga a cuál se apunta. */
const USERS = { __table: "users" };
const PROFILES = { __table: "employee_profiles", userId: "user_id", commissionPct: "commission_pct" };
const SETTINGS = { __table: "sales_settings", id: "id" };
const ALERTS = { __table: "sales_alerts" };

vi.mock("@workspace/db/schema", () => ({
  users: USERS, employeeProfiles: PROFILES, salesSettings: SETTINGS, salesAlerts: ALERTS,
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
}));
vi.mock("../../lib/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("../../lib/notifications", () => ({ createNotification: vi.fn() }));

/** Tablero simulado + última escritura. */
let boardData: Record<string, unknown> = {};
let saved: Record<string, unknown> | null = null;
vi.mock("../../lib/hub-board", () => ({
  resolveBoard: async () => ({ boardUserId: 1, data: boardData, owner: null, version: 0 }),
  saveBoard: async (_uid: number, data: Record<string, unknown>) => { saved = data; },
}));

const rows: {
  users: Record<string, unknown>[];
  me: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  settings: Record<string, unknown>[];
} = { users: [], me: [], profiles: [], settings: [] };

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    let hasWhere = false;
    const resolveRows = () => {
      if (table === PROFILES) return rows.profiles;
      if (table === SETTINGS) return rows.settings;
      if (table === USERS) return hasWhere ? rows.me : rows.users;
      return [];
    };
    const chain: Record<string, unknown> = {};
    chain.where = () => { hasWhere = true; return chain; };
    chain.limit = async () => resolveRows();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveRows());
    return chain;
  };
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoUpdate: () => ({ returning: async () => [v] }),
      onConflictDoNothing: () => ({ returning: async () => [v] }),
    }),
  });
  return { db: { select: () => ({ from }), insert } };
});

const CEO = { id: 1, name: "CEO", email: "ceo@x.cl", role: "user", teamRole: "ceo", approvalStatus: "approved" };
const VENDEDORA = { id: 7, name: "Vale Ventas", email: "vale@x.cl", role: "user", teamRole: "ventas", approvalStatus: "approved" };
const CONTADOR = { id: 9, name: "Ana", email: "ana@x.cl", role: "user", teamRole: "contador", approvalStatus: "approved" };

async function api(as: Record<string, unknown>, method: string, path: string, body?: unknown) {
  rows.users = [CEO, VENDEDORA, CONTADOR];
  rows.me = [as];
  const router = (await import("./ventas")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: as.id as number };
    next();
  });
  app.use("/api", router);
  const port = await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const resBody = (await res.json().catch(() => null)) as Record<string, any>;
  return { status: res.status, body: resBody };
}

beforeEach(() => {
  boardData = {};
  saved = null;
  rows.profiles = [];
  rows.settings = [{ id: 1, renewalAlertDays: 30 }];
});

describe("GET /hub/ventas/resumen", () => {
  it("normaliza oportunidades legacy y calcula la proyección del mes", async () => {
    boardData = {
      contracts: [
        { id: "o1", title: "Web ACME", client: "ACME", status: "borrador", doc: { modules: [{ price: 1000000 }] }, expectedClose: "2026-07-20", probability: 50, pipelineStage: "propuesta" },
        { id: "o2", title: "Legacy", client: "B", status: "borrador", value: "$119.000" },
        { id: "a1", title: "Activo", client: "C", status: "activo", expiresAt: "2026-08-10" },
      ],
    };
    const r = await api(VENDEDORA, "GET", "/hub/ventas/resumen?month=2026-07");
    expect(r.status).toBe(200);
    expect(r.body.opportunities).toHaveLength(2);
    const legacy = r.body.opportunities.find((o: { id: string }) => o.id === "o2");
    expect(legacy.stage).toBe("prospecto");
    expect(legacy.probability).toBe(10);
    // 1.000.000×50% + 100.000×10% (legacy sin cierre cuenta en el mes)
    expect(r.body.projection).toBe(510000);
    expect(r.body.canSeeMoney).toBe(true);
    // El activo que vence dentro de la antelación aparece como renovación.
    expect(r.body.renewals.map((x: { id: string }) => x.id)).toContain("a1");
  });

  it("otros roles no entran a la torre", async () => {
    const r = await api(CONTADOR, "GET", "/hub/ventas/resumen");
    expect(r.status).toBe(403);
  });
});

describe("PATCH /hub/ventas/opportunities/:id", () => {
  it("cambia etapa y aplica la probabilidad por defecto de la etapa", async () => {
    boardData = { contracts: [{ id: "o1", title: "X", status: "borrador", probability: 10 }] };
    const r = await api(VENDEDORA, "PATCH", "/hub/ventas/opportunities/o1", { pipelineStage: "negociacion" });
    expect(r.status).toBe(200);
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.pipelineStage).toBe("negociacion");
    expect(c.probability).toBe(75);
  });

  it("rechaza roles sin gestión de ventas", async () => {
    boardData = { contracts: [{ id: "o1", status: "borrador" }] };
    const r = await api(CONTADOR, "PATCH", "/hub/ventas/opportunities/o1", { probability: 90 });
    expect(r.status).toBe(403);
    expect(saved).toBeNull();
  });
});

describe("POST /hub/ventas/contracts/:id/renew", () => {
  it("crea la oportunidad de renovación enlazada", async () => {
    boardData = { contracts: [{ id: "a1", title: "Plan Anual", client: "ACME", status: "activo", expiresAt: "2026-08-01", value: "$119.000" }] };
    const r = await api(VENDEDORA, "POST", "/hub/ventas/contracts/a1/renew");
    expect(r.status).toBe(201);
    const contracts = saved!.contracts as Record<string, unknown>[];
    expect(contracts).toHaveLength(2);
    const nuevo = contracts[1];
    expect(nuevo.status).toBe("borrador");
    expect(nuevo.renewalOfId).toBe("a1");
    expect(nuevo.salesOwnerId).toBe(7);
  });

  it("no permite dos renovaciones del mismo contrato", async () => {
    boardData = {
      contracts: [
        { id: "a1", title: "Plan", status: "activo" },
        { id: "r1", title: "Plan (renovación)", status: "borrador", renewalOfId: "a1" },
      ],
    };
    const r = await api(CEO, "POST", "/hub/ventas/contracts/a1/renew");
    expect(r.status).toBe(409);
  });
});

describe("GET /hub/ventas/comisiones", () => {
  const contratos = [
    { id: "c1", title: "Web", client: "ACME", salesOwnerId: 7, doc: { modules: [{ price: 1000000 }] }, cobro: { estado: "pagado", fechaPago: "2026-07-10" } },
    { id: "c2", title: "SEO", client: "B", salesOwnerId: 1, doc: { modules: [{ price: 500000 }] }, cobro: { estado: "pagado", fechaPago: "2026-07-20" } },
    { id: "c3", title: "Solo facturado", client: "C", salesOwnerId: 7, doc: { modules: [{ price: 900000 }] }, cobro: { estado: "facturado", fechaPago: "2026-07-05" } },
    { id: "c4", title: "Otro mes", client: "D", salesOwnerId: 7, doc: { modules: [{ price: 900000 }] }, cobro: { estado: "pagado", fechaPago: "2026-06-30" } },
  ];

  it("solo cuenta lo pagado del mes; ventas ve únicamente lo suyo", async () => {
    boardData = { contracts: contratos };
    rows.profiles = [{ userId: 7, pct: 10 }, { userId: 1, pct: 5 }];
    const r = await api(VENDEDORA, "GET", "/hub/ventas/comisiones?month=2026-07");
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: { contractId: string }) => x.contractId)).toEqual(["c1"]);
    expect(r.body.rows[0].commission).toBe(100000); // 10% de 1.000.000 neto
    expect(r.body.totals.commission).toBe(100000);
  });

  it("el CEO ve las comisiones de todos", async () => {
    boardData = { contracts: contratos };
    rows.profiles = [{ userId: 7, pct: 10 }, { userId: 1, pct: 5 }];
    const r = await api(CEO, "GET", "/hub/ventas/comisiones?month=2026-07");
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(2);
    expect(r.body.totals.commission).toBe(100000 + 25000);
  });

  it("roles sin dinero no acceden", async () => {
    const r = await api(CONTADOR, "GET", "/hub/ventas/comisiones");
    expect(r.status).toBe(403);
  });
});
