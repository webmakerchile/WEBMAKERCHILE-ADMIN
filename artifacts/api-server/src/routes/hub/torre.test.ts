import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela para que el mock de db distinga a cuál se apunta. */
const USERS = { __table: "users" };
const GOALS = { __table: "goals", companyGoalId: "company_goal_id" };
const COMPANY_GOALS = { __table: "company_goals", id: "id", createdAt: "created_at" };
const ASSIGNMENTS = { __table: "project_assignments", projectRef: "project_ref" };

vi.mock("@workspace/db/schema", () => ({
  users: USERS, goals: GOALS, companyGoals: COMPANY_GOALS, projectAssignments: ASSIGNMENTS,
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  desc: (a: unknown) => a,
}));
vi.mock("../../lib/activity", () => ({ recordActivity: vi.fn() }));
const notified: unknown[] = [];
vi.mock("../../lib/notifications", () => ({
  createNotification: vi.fn(async (n: unknown) => { notified.push(n); }),
}));

const semaforoResult = [{ area: "ejecutivo", status: "green", slaOverdue: [], saturated: [], goalsPct: null, goalsTotal: 0, goalsDone: 0 }];
const profitResult = [{ projectRef: "p1", name: "Web X", client: "ACME", status: "dev", contractId: "c1", hours: 10, cost: 100000, revenue: 500000, cobroEstado: "pagado", margin: 400000, missingCost: [], assignments: [] }];
vi.mock("../../lib/torre", () => ({
  computeSemaforo: vi.fn(async () => semaforoResult),
  computeProfitability: vi.fn(async () => profitResult),
}));

const rows: {
  me: Record<string, unknown>[];
  users: Record<string, unknown>[];
  companyGoals: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
} = { me: [], users: [], companyGoals: [], goals: [], assignments: [] };

const inserted: Array<{ table: unknown; values: unknown }> = [];
const deleted: Array<{ table: unknown }> = [];

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    let hasWhere = false;
    const resolveRows = () => {
      if (table === USERS) return hasWhere ? rows.me : rows.users;
      if (table === COMPANY_GOALS) return rows.companyGoals;
      if (table === GOALS) return rows.goals;
      if (table === ASSIGNMENTS) return rows.assignments;
      return [];
    };
    const chain: Record<string, unknown> = {};
    chain.where = () => { hasWhere = true; return chain; };
    chain.orderBy = () => chain;
    chain.limit = async () => resolveRows();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveRows());
    return chain;
  };
  const insert = (table: unknown) => ({
    values: (v: unknown) => {
      inserted.push({ table, values: v });
      return {
        returning: async () => [{ id: 77, ...(Array.isArray(v) ? {} : (v as object)) }],
        then: (resolve: (x: unknown) => unknown) => resolve(undefined),
      };
    },
  });
  const del = (table: unknown) => ({
    where: async () => { deleted.push({ table }); },
  });
  const dbObj = {
    select: () => ({ from }),
    insert,
    delete: del,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj),
  };
  return { db: dbObj };
});

const CEO = { id: 1, name: "CEO", email: "ceo@x.cl", role: "user", teamRole: "ceo", approvalStatus: "approved" };
const EDITORA = { id: 2, name: "Edi", email: "edi@x.cl", role: "user", teamRole: "editora", approvalStatus: "approved" };

let sessionUserId = 1;

async function makeApp() {
  const { default: router } = await import("./torre");
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: sessionUserId };
    next();
  });
  app.use(router);
  return app;
}

async function call(app: express.Express, method: string, path: string, body?: unknown) {
  const http = await import("node:http");
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json as Record<string, unknown> | null };
  } finally {
    server.close();
    void http;
  }
}

beforeEach(() => {
  rows.me = [CEO];
  rows.users = [CEO, EDITORA];
  rows.companyGoals = [];
  rows.goals = [];
  rows.assignments = [];
  inserted.length = 0;
  deleted.length = 0;
  notified.length = 0;
  sessionUserId = 1;
});

describe("GET /hub/torre/semaforo", () => {
  it("devuelve el semáforo a dirección", async () => {
    const app = await makeApp();
    const r = await call(app, "GET", "/hub/torre/semaforo");
    expect(r.status).toBe(200);
    expect(r.body?.areas).toEqual(semaforoResult);
  });

  it("rechaza a quien no es dirección", async () => {
    rows.me = [EDITORA];
    sessionUserId = 2;
    const app = await makeApp();
    const r = await call(app, "GET", "/hub/torre/semaforo");
    expect(r.status).toBe(403);
  });
});

describe("POST /hub/torre/company-goals", () => {
  it("crea la meta madre y una meta personal por persona", async () => {
    // La verificación de existencia del reparto también consulta users con where.
    rows.me = [CEO, EDITORA];
    const app = await makeApp();
    const r = await call(app, "POST", "/hub/torre/company-goals", {
      title: "20 publicaciones", period: "mensual", target: 20,
      distribution: [{ userId: 1, target: 8 }, { userId: 2, target: 12 }],
    });
    expect(r.status).toBe(201);
    // 1 insert de meta madre + 1 insert (batch) de hijas
    expect(inserted.filter(i => i.table === COMPANY_GOALS)).toHaveLength(1);
    const hijas = inserted.find(i => i.table === GOALS)?.values as Array<Record<string, unknown>>;
    expect(hijas).toHaveLength(2);
    expect(hijas[0].companyGoalId).toBe(77);
    expect(notified).toHaveLength(2);
  });

  it("rechaza personas repetidas en el reparto", async () => {
    const app = await makeApp();
    const r = await call(app, "POST", "/hub/torre/company-goals", {
      title: "Meta duplicada", period: "semanal",
      distribution: [{ userId: 2 }, { userId: 2 }],
    });
    expect(r.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("valida el cuerpo (sin reparto no hay meta)", async () => {
    const app = await makeApp();
    const r = await call(app, "POST", "/hub/torre/company-goals", {
      title: "Sin reparto", period: "mensual", distribution: [],
    });
    expect(r.status).toBe(400);
  });
});

describe("DELETE /hub/torre/company-goals/:id", () => {
  it("borra la madre y sus hijas", async () => {
    rows.companyGoals = [{ id: 5, title: "Vieja", period: "mensual", periodKey: "2026-06", createdAt: new Date() }];
    const app = await makeApp();
    const r = await call(app, "DELETE", "/hub/torre/company-goals/5");
    expect(r.status).toBe(200);
    expect(deleted.map(d => d.table)).toEqual([GOALS, COMPANY_GOALS]);
  });

  it("404 si no existe", async () => {
    const app = await makeApp();
    const r = await call(app, "DELETE", "/hub/torre/company-goals/99");
    expect(r.status).toBe(404);
  });
});

describe("GET /hub/torre/rentabilidad", () => {
  it("devuelve rentabilidad a dirección", async () => {
    const app = await makeApp();
    const r = await call(app, "GET", "/hub/torre/rentabilidad?from=2026-07-01&to=2026-07-31");
    expect(r.status).toBe(200);
    expect(r.body?.projects).toEqual(profitResult);
    expect(r.body?.from).toBe("2026-07-01");
  });

  it("rechaza rangos invertidos", async () => {
    const app = await makeApp();
    const r = await call(app, "GET", "/hub/torre/rentabilidad?from=2026-07-31&to=2026-07-01");
    expect(r.status).toBe(400);
  });

  it("rechaza a quien no es dirección", async () => {
    rows.me = [EDITORA];
    sessionUserId = 2;
    const app = await makeApp();
    const r = await call(app, "GET", "/hub/torre/rentabilidad");
    expect(r.status).toBe(403);
  });
});

describe("PUT /hub/torre/assignments", () => {
  it("reemplaza la dedicación del proyecto", async () => {
    const app = await makeApp();
    const r = await call(app, "PUT", "/hub/torre/assignments", {
      projectRef: "p1",
      assignments: [{ userId: 2, allocationPct: 50 }],
    });
    expect(r.status).toBe(200);
    expect(deleted.map(d => d.table)).toEqual([ASSIGNMENTS]);
    const ins = inserted.find(i => i.table === ASSIGNMENTS)?.values as Array<Record<string, unknown>>;
    expect(ins).toEqual([{ userId: 2, projectRef: "p1", allocationPct: 50 }]);
  });

  it("rechaza personas repetidas", async () => {
    const app = await makeApp();
    const r = await call(app, "PUT", "/hub/torre/assignments", {
      projectRef: "p1",
      assignments: [{ userId: 2, allocationPct: 50 }, { userId: 2, allocationPct: 50 }],
    });
    expect(r.status).toBe(400);
  });

  it("rechaza si la persona supera 100% sumando otros proyectos", async () => {
    rows.assignments = [{ userId: 2, projectRef: "otro", allocationPct: 80 }];
    const app = await makeApp();
    const r = await call(app, "PUT", "/hub/torre/assignments", {
      projectRef: "p1",
      assignments: [{ userId: 2, allocationPct: 50 }],
    });
    expect(r.status).toBe(400);
    expect(deleted).toHaveLength(0);
    expect(String(r.body?.error)).toContain("100%");
  });

  it("permite reemplazar la dedicación del MISMO proyecto sin contarla doble", async () => {
    rows.assignments = [{ userId: 2, projectRef: "p1", allocationPct: 80 }];
    const app = await makeApp();
    const r = await call(app, "PUT", "/hub/torre/assignments", {
      projectRef: "p1",
      assignments: [{ userId: 2, allocationPct: 100 }],
    });
    expect(r.status).toBe(200);
  });
});
