import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela: solo sirven para que el mock de `db` sepa a cuál se apunta. */
const USERS = { __table: "users", id: "users.id" };
const HUB_STATE = { __table: "hub_state", userId: "hub_state.user_id" };

vi.mock("@workspace/db/schema", () => ({ users: USERS, hubState: HUB_STATE }));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), asc: (a: unknown) => a }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: vi.fn() } }));
vi.mock("pdf-parse", () => ({ PDFParse: class {} }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: vi.fn() } }; } }));

const rows: {
  users: Record<string, unknown>[];
  me: Record<string, unknown>[];
  hub: Record<string, unknown>[];
} = { users: [], me: [], hub: [] };

/** Última escritura que recibió `saveBoard`, para verificar QUÉ se guardó. */
let guardado: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    let filtered = false;
    const chain = {
      where: () => { filtered = true; return chain; },
      limit: async () => (table === HUB_STATE ? rows.hub : filtered ? rows.me : rows.users),
      orderBy: async () => (table === HUB_STATE ? rows.hub : rows.users),
      then: (resolve: (v: unknown) => unknown) => resolve(table === HUB_STATE ? rows.hub : rows.users),
    };
    return chain;
  };
  const insert = () => ({
    values: (v: { data: Record<string, unknown> }) => {
      guardado = v.data;
      return {
        onConflictDoUpdate: () => ({ returning: async () => [{ data: v.data }] }),
      };
    },
  });
  return { db: { select: () => ({ from }), insert } };
});

const CONTRATO = {
  id: "c1",
  title: "Landing ACME",
  client: "ACME",
  value: "$119.000",
  doc: { modules: [{ id: "m1", name: "Landing", desc: "One-page", price: 100000 }] },
  createdAt: 1770000000000,
  updatedAt: 1770000000000,
};

async function patchCobro(teamRole: string, body: unknown, role = "admin") {
  const ceo = { id: 1, name: "CEO", email: "ceo@x.cl", role: "superadmin", teamRole: "reviewer" };
  const persona = { id: 7, name: "Ana Contadora", email: "ana@x.cl", role, teamRole };
  rows.users = [ceo, persona];
  rows.me = [role === "superadmin" ? ceo : persona];
  rows.hub = [{ userId: 1, data: { contracts: [{ ...CONTRATO }] }, updatedAt: new Date("2026-07-01T00:00:00Z") }];

  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
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
  return fetch(`http://127.0.0.1:${port}/api/hub/contracts/c1/cobro`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/hub/contracts/:id/cobro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.users = []; rows.me = []; rows.hub = [];
    guardado = null;
  });

  it("el contador registra la factura sin tocar el contenido comercial", async () => {
    const r = await patchCobro("contador", {
      cobro: { estado: "facturado", factura: "F-2026-104", nota: "Pagan a 30 días" },
    });
    expect(r.status).toBe(200);

    const contrato = (guardado?.contracts as Record<string, unknown>[])[0];
    expect((contrato.cobro as { estado: string }).estado).toBe("facturado");
    expect((contrato.cobro as { by: string }).by).toBe("Ana Contadora");
    // Nada del contrato cambió salvo la cobranza y su marca de tiempo.
    expect(contrato.value).toBe("$119.000");
    expect(contrato.title).toBe("Landing ACME");
    expect(contrato.doc).toEqual(CONTRATO.doc);
    expect(Number(contrato.updatedAt)).toBeGreaterThan(CONTRATO.updatedAt);
  });

  it("ventas y dirección también gestionan cobranza", async () => {
    for (const rol of ["ventas", "reviewer"]) {
      const r = await patchCobro(rol, { cobro: { estado: "pagado", fechaPago: "2026-07-20" } }, rol === "reviewer" ? "superadmin" : "admin");
      expect(r.status, `${rol} debería poder`).toBe(200);
    }
  });

  it("quien no ve montos no puede tocar la cobranza", async () => {
    const r = await patchCobro("dev", { cobro: { estado: "pagado" } });
    expect(r.status).toBe(403);
    expect(guardado).toBeNull();
  });

  it("rechaza estados inventados y fechas mal escritas", async () => {
    expect((await patchCobro("contador", { cobro: { estado: "casi_pagado" } })).status).toBe(400);
    expect((await patchCobro("contador", { cobro: { estado: "pagado", fechaPago: "20-07-2026" } })).status).toBe(400);
    expect(guardado).toBeNull();
  });

  it("404 si el contrato no está en el tablero", async () => {
    const ceo = { id: 1, name: "CEO", email: "ceo@x.cl", role: "superadmin", teamRole: "reviewer" };
    rows.users = [ceo];
    rows.me = [ceo];
    rows.hub = [{ userId: 1, data: { contracts: [{ id: "otro", title: "X" }] }, updatedAt: new Date() }];

    const router = (await import("./index")).default;
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: number } }).user = { id: 1 };
      next();
    });
    app.use("/api", router);
    const port = await new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const a = s.address();
        if (typeof a === "object" && a) resolve(a.port);
      });
    });
    const r = await fetch(`http://127.0.0.1:${port}/api/hub/contracts/c1/cobro`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cobro: { estado: "pagado" } }),
    });
    expect(r.status).toBe(404);
  });
});
