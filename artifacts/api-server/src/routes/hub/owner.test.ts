import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela: solo sirven para que el mock de `db` sepa a cuál se apunta. */
const USERS = { __table: "users", id: "users.id", userId: "users.id" };
const HUB_STATE = { __table: "hub_state", userId: "hub_state.user_id" };

vi.mock("@workspace/db/schema", () => ({ users: USERS, hubState: HUB_STATE }));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), asc: (a: unknown) => a }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: vi.fn() } }));
vi.mock("pdf-parse", () => ({ PDFParse: class {} }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));

/**
 * Filas que devuelve el mock. `users` responde a la consulta sin filtro (la que
 * busca al dueño del tablero) y `me` a la consulta con `where` (el usuario
 * autenticado). `callAsRole` las prepara en cada caso.
 */
const rows: {
  users: Record<string, unknown>[];
  me: Record<string, unknown>[];
  hub: Record<string, unknown>[];
} = { users: [], me: [], hub: [] };

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    let filtered = false;
    const chain = {
      where: () => { filtered = true; return chain; },
      limit: async () => {
        if (table === HUB_STATE) return rows.hub;
        return filtered ? rows.me : rows.users;
      },
      orderBy: async () => (table === HUB_STATE ? rows.hub : rows.users),
      // `resolveBoard` hace `await db.select().from(hubState)` sin filtros.
      then: (resolve: (v: unknown) => unknown) => resolve(table === HUB_STATE ? rows.hub : rows.users),
    };
    return chain;
  };
  return { db: { select: () => ({ from }) } };
});

const HUB_BLOB = {
  contracts: [{ id: "c1", title: "Landing", value: "$119.000" }],
  clients: [{ id: "cl1", name: "ACME" }],
  meetings: [{ id: "m1", client: "ACME" }],
  projects: [{ id: "p1", name: "Landing ACME" }],
  tasks: [{ id: "t1", title: "Maquetar hero" }],
  notes: [{ id: "n1", title: "Idea" }],
};

async function callAsRole(teamRole: string, role = "admin") {
  const ceo = { id: 1, name: "CEO", email: "ceo@x.cl", role: "superadmin", teamRole: "reviewer" };
  const persona = { id: 7, name: "Persona", email: "p@x.cl", role, teamRole };
  rows.users = [ceo, persona];
  rows.me = [role === "superadmin" ? ceo : persona];
  if (rows.hub.length === 0) rows.hub = [{ userId: 1, data: HUB_BLOB, updatedAt: new Date("2026-07-01T00:00:00Z") }];

  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // El handler resuelve el usuario real desde la DB; aquí solo hace falta el id.
    (req as Request & { user?: { id: number } }).user = { id: role === "superadmin" ? 1 : 7 };
    next();
  });
  app.use("/api", router);
  const port = await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  return fetch(`http://127.0.0.1:${port}/api/hub/owner`);
}

describe("GET /api/hub/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.users = []; rows.me = []; rows.hub = [];
  });

  it("el contador solo recibe los contratos", async () => {
    const r = await callAsRole("contador");
    expect(r.status).toBe(200);
    const body = await r.json() as { data: Record<string, unknown[]>; scopes: string[] };
    expect(Object.keys(body.data)).toEqual(["contracts"]);
    expect(body.data.contracts).toHaveLength(1);
    expect(body.scopes).toEqual(["contracts"]);
  });

  it("ventas recibe su cartera y los proyectos que enlaza — nunca tareas ni notas", async () => {
    const r = await callAsRole("ventas");
    const body = await r.json() as { data: Record<string, unknown[]> };
    expect(Object.keys(body.data).sort()).toEqual(["clients", "contracts", "meetings", "projects"]);
    expect(body.data.tasks).toBeUndefined();
    expect(body.data.notes).toBeUndefined();
  });

  it("el programador recibe proyectos, tareas y notas, no contratos ni clientes", async () => {
    const r = await callAsRole("dev");
    const body = await r.json() as { data: Record<string, unknown[]> };
    expect(Object.keys(body.data).sort()).toEqual(["notes", "projects", "tasks"]);
    expect(body.data.contracts).toBeUndefined();
    expect(body.data.clients).toBeUndefined();
  });

  it("marketing ve proyectos, tareas y clientes para coordinar campañas", async () => {
    const r = await callAsRole("marketing");
    const body = await r.json() as { data: Record<string, unknown[]> };
    expect(Object.keys(body.data).sort()).toEqual(["clients", "projects", "tasks"]);
    expect(body.data.contracts).toBeUndefined();
  });

  it("los roles de producción pura no leen el tablero: se conectan por tickets", async () => {
    for (const role of ["editora", "social", "rrhh"]) {
      const r = await callAsRole(role);
      expect(r.status, `${role} debería recibir 403`).toBe(403);
    }
  });

  it("el CEO recibe todas las colecciones", async () => {
    const r = await callAsRole("reviewer", "superadmin");
    const body = await r.json() as { data: Record<string, unknown[]>; owner: { email: string } };
    expect(Object.keys(body.data).sort()).toEqual(["clients", "contracts", "meetings", "notes", "projects", "tasks"]);
    expect(body.owner.email).toBe("ceo@x.cl");
  });

  it("una colección ausente en el blob se devuelve como array vacío", async () => {
    rows.hub = [{ userId: 1, data: { contracts: [{ id: "c1" }] }, updatedAt: null }];
    const r = await callAsRole("dev");
    const body = await r.json() as { data: Record<string, unknown[]> };
    expect(body.data.projects).toEqual([]);
    expect(body.data.tasks).toEqual([]);
  });
});
