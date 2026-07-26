import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela para que el mock de `db` sepa a cuál se apunta. */
const USERS = { __t: "users", id: "users.id" };
const PROFILES = { __t: "employee_profiles", userId: "employee_profiles.user_id" };

vi.mock("@workspace/db/schema", () => ({ users: USERS, employeeProfiles: PROFILES }));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), asc: (a: unknown) => a }));

/** Estado del mock: quién llama, qué hay en la tabla y qué se escribió. */
const state: {
  me: Record<string, unknown>[];
  target: Record<string, unknown>[];
  people: Record<string, unknown>[];
  inserted: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
} = { me: [], target: [], people: [], inserted: null, updated: null };

vi.mock("@workspace/db", () => {
  let selectCall = 0;
  const chain = () => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.leftJoin = () => c;
    c.where = () => c;
    c.orderBy = async () => state.people;
    c.limit = async () => {
      // La primera consulta de cada request resuelve al usuario autenticado;
      // las siguientes, a la persona objetivo.
      selectCall += 1;
      return selectCall === 1 ? state.me : state.target;
    };
    return c;
  };
  return {
    db: {
      select: () => { return chain(); },
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: () => ({
            returning: async () => { state.inserted = v; return [v]; },
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => { state.updated = v; return [{ id: 9, email: "x@y.cl", ...v }]; },
          }),
        }),
      }),
      __reset: () => { selectCall = 0; },
    },
  };
});

async function startApp(callerId = 5) {
  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: callerId };
    next();
  });
  app.use("/api", router);
  return await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
}

async function reset(callerRole: string, callerRootRole = "admin") {
  const db = (await import("@workspace/db")).db as unknown as { __reset: () => void };
  db.__reset();
  state.me = [{ id: 5, teamRole: callerRole, role: callerRootRole, email: "caller@x.cl" }];
  state.target = [{ id: 9, role: "admin" }];
  state.people = [];
  state.inserted = null;
  state.updated = null;
}

const VALID = {
  position: "Editora senior", area: "Contenido", contractType: "indefinido",
  employmentStatus: "activo", startDate: "2025-03-01", endDate: "",
  monthlySalary: 1200000, phone: "+56 9 1234 5678",
  emergencyContact: "Mamá", emergencyPhone: "+56 9 8765 4321",
  documentsUrl: "https://drive.google.com/x", notes: "",
};

describe("/api/hr/people", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloquea a los roles que no gestionan personas", async () => {
    for (const role of ["editora", "social", "ventas", "dev", "marketing", "contador"]) {
      await reset(role);
      const port = await startApp();
      const r = await fetch(`http://127.0.0.1:${port}/api/hr/people`);
      expect(r.status, `${role} debería recibir 403`).toBe(403);
    }
  });

  it("deja entrar a RRHH y al superadministrador aunque su team_role diga otra cosa", async () => {
    await reset("rrhh");
    let port = await startApp();
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/people`)).status).toBe(200);

    await reset("contador", "superadmin");
    port = await startApp();
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/people`)).status).toBe(200);
  });

  it("guarda la ficha laboral validada", async () => {
    await reset("rrhh");
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hr/people/9`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID),
    });
    expect(r.status).toBe(200);
    expect(state.inserted).toMatchObject({ userId: 9, position: "Editora senior", monthlySalary: 1200000 });
  });

  it("rechaza un tipo de contrato inventado y una fecha mal formada", async () => {
    await reset("rrhh");
    const port = await startApp();
    const bad = await fetch(`http://127.0.0.1:${port}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, contractType: "esclavitud" }),
    });
    expect(bad.status).toBe(400);

    await reset("rrhh");
    const port2 = await startApp();
    const badDate = await fetch(`http://127.0.0.1:${port2}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, startDate: "01-03-2025" }),
    });
    expect(badDate.status).toBe(400);
    expect(state.inserted).toBeNull();
  });

  it("rechaza un término anterior al ingreso", async () => {
    await reset("rrhh");
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, startDate: "2025-03-01", endDate: "2025-01-01" }),
    });
    expect(r.status).toBe(400);
    expect(state.inserted).toBeNull();
  });

  it("acepta renta vacía como 'sin registrar' y rechaza una negativa", async () => {
    await reset("rrhh");
    const port = await startApp();
    const ok = await fetch(`http://127.0.0.1:${port}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, monthlySalary: null }),
    });
    expect(ok.status).toBe(200);
    expect(state.inserted).toMatchObject({ monthlySalary: null });

    // El input vacío del formulario tampoco puede terminar como renta 0.
    await reset("rrhh");
    const portEmpty = await startApp();
    const empty = await fetch(`http://127.0.0.1:${portEmpty}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, monthlySalary: "" }),
    });
    expect(empty.status).toBe(200);
    expect(state.inserted).toMatchObject({ monthlySalary: null });

    await reset("rrhh");
    const port2 = await startApp();
    const bad = await fetch(`http://127.0.0.1:${port2}/api/hr/people/9`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, monthlySalary: -50 }),
    });
    expect(bad.status).toBe(400);
  });

  it("aprueba accesos pero nunca revoca el del administrador principal", async () => {
    await reset("rrhh");
    let port = await startApp();
    const ok = await fetch(`http://127.0.0.1:${port}/api/hr/people/9/approval`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(ok.status).toBe(200);
    expect(state.updated).toMatchObject({ approvalStatus: "approved" });

    await reset("rrhh");
    state.target = [{ id: 1, role: "superadmin" }];
    port = await startApp();
    const blocked = await fetch(`http://127.0.0.1:${port}/api/hr/people/1/approval`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    expect(blocked.status).toBe(400);
  });

  it("no deja que RRHH cambie el estado de su propia cuenta", async () => {
    await reset("rrhh");
    const port = await startApp(5);
    const r = await fetch(`http://127.0.0.1:${port}/api/hr/people/5/approval`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    expect(r.status).toBe(400);
    expect(state.updated).toBeNull();
  });
});
