import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

const USERS = { __t: "users", id: "users.id" };
const TICKETS = { __t: "tickets", id: "tickets.id", area: "tickets.area", status: "tickets.status", createdBy: "c", assignedTo: "a", updatedAt: "u" };
const COMMENTS = { __t: "ticket_comments", ticketId: "t", createdAt: "c" };
const HUB = { __t: "hub_state", userId: "u" };

vi.mock("@workspace/db/schema", () => ({
  users: USERS, tickets: TICKETS, ticketComments: COMMENTS, hubState: HUB,
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  or: (...a: unknown[]) => ({ or: a }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  asc: (a: unknown) => a,
  desc: (a: unknown) => a,
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
  sql: Object.assign(() => ({ sql: true }), { raw: () => ({ sql: true }) }),
}));

const notify = vi.fn(async () => {});
vi.mock("../../lib/notifications", () => ({ createNotification: notify }));

/** Datos por tabla + registro de escrituras, que cada test ajusta. */
const state: {
  me: Record<string, unknown>[];
  tickets: Record<string, unknown>[];
  users: Record<string, unknown>[];
  hub: Record<string, unknown>[];
  inserted: { table: string; values: Record<string, unknown> }[];
  updated: Record<string, unknown>[];
} = { me: [], tickets: [], users: [], hub: [], inserted: [], updated: [] };

vi.mock("@workspace/db", () => {
  const makeChain = (table: unknown) => {
    let filtered = false;
    const data = () => {
      if (table === TICKETS) return state.tickets;
      if (table === HUB) return state.hub;
      if (table === COMMENTS) return [];
      return filtered ? state.me : state.users;
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["leftJoin", "orderBy", "groupBy"]) chain[m] = () => chain;
    chain.where = () => { filtered = true; return chain; };
    chain.limit = async () => data();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(data());
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => makeChain(table) }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          const tableName = (table as { __t: string }).__t;
          const row = { id: 101, ...values };
          const api = {
            returning: async () => { state.inserted.push({ table: tableName, values }); return [row]; },
            onConflictDoUpdate: () => ({
              returning: async () => { state.inserted.push({ table: tableName, values }); return [row]; },
              then: (resolve: (v: unknown) => unknown) => { state.inserted.push({ table: tableName, values }); return resolve([row]); },
            }),
            then: (resolve: (v: unknown) => unknown) => { state.inserted.push({ table: tableName, values }); return resolve([row]); },
          };
          return api;
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => { state.updated.push(values); return [{ id: 7, ...values }]; },
            then: (resolve: (v: unknown) => unknown) => { state.updated.push(values); return resolve([{ id: 7, ...values }]); },
          }),
        }),
      }),
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

function asRole(teamRole: string, role = "admin") {
  state.me = [{ id: 5, teamRole, role, name: "Yo", email: "yo@x.cl" }];
  state.users = [{ id: 5, teamRole, role, name: "Yo", email: "yo@x.cl" }];
  state.tickets = [];
  state.hub = [];
  state.inserted = [];
  state.updated = [];
}

const NEW_TICKET = { title: "Cambiar el checkout de ACME", description: "El cliente pidió pago en cuotas", area: "desarrollo", priority: "alta" };

describe("/api/tickets", () => {
  beforeEach(() => { vi.clearAllMocks(); notify.mockClear(); });

  it("crea un ticket dirigido a un área", async () => {
    asRole("ventas");
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(NEW_TICKET),
    });
    expect(r.status).toBe(201);
    expect(state.inserted[0].values).toMatchObject({ area: "desarrollo", priority: "alta", createdBy: 5 });
  });

  it("rechaza un área inventada y un título vacío", async () => {
    asRole("ventas");
    const port = await startApp();
    const badArea = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...NEW_TICKET, area: "recepcion" }),
    });
    expect(badArea.status).toBe(400);

    const badTitle = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...NEW_TICKET, title: "x" }),
    });
    expect(badTitle.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("no deja tocar un ticket de otra área", async () => {
    asRole("ventas");
    // Ticket de RRHH creado por otra persona: ventas no lo toca.
    state.tickets = [{ id: 7, title: "Vacaciones", description: "", area: "rrhh", status: "abierto", createdBy: 9, assignedTo: null }];
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets/7`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cerrado" }),
    });
    expect(r.status).toBe(403);
    expect(state.updated).toHaveLength(0);
  });

  it("deja avanzar el ticket a quien atiende esa área", async () => {
    asRole("dev");
    state.tickets = [{ id: 7, title: "Checkout", description: "", area: "desarrollo", status: "abierto", createdBy: 9, assignedTo: null }];
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets/7`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "en_progreso" }),
    });
    expect(r.status).toBe(200);
    expect(state.updated[0]).toMatchObject({ status: "en_progreso" });
    // A quien lo pidió se le avisa del avance.
    expect(notify).toHaveBeenCalled();
  });

  it("quien lo pidió siempre puede seguir su propio ticket", async () => {
    asRole("ventas");
    state.tickets = [{ id: 7, title: "Checkout", description: "", area: "desarrollo", status: "abierto", createdBy: 5, assignedTo: null }];
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets/7`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: "crítica" }),
    });
    expect(r.status).toBe(200);
  });

  it("solo los roles que escriben tareas convierten un ticket en tarea del tablero", async () => {
    asRole("ventas");
    state.tickets = [{ id: 7, title: "Checkout", description: "d", area: "desarrollo", status: "abierto", createdBy: 5, assignedTo: null, priority: "alta", projectId: "", taskId: "" }];
    let port = await startApp();
    const denied = await fetch(`http://127.0.0.1:${port}/api/tickets/7/to-task`, { method: "POST" });
    expect(denied.status).toBe(403);

    asRole("dev");
    state.tickets = [{ id: 7, title: "Checkout", description: "d", area: "desarrollo", status: "abierto", createdBy: 9, assignedTo: null, priority: "alta", projectId: "p1", taskId: "" }];
    state.users = [{ id: 1, role: "superadmin", teamRole: "ceo" }, { id: 5, role: "admin", teamRole: "dev" }];
    state.me = [{ id: 5, teamRole: "dev", role: "admin", name: "Dev", email: "dev@x.cl" }];
    state.hub = [{ userId: 1, data: { tasks: [] } }];
    port = await startApp();
    const ok = await fetch(`http://127.0.0.1:${port}/api/tickets/7/to-task`, { method: "POST" });
    expect(ok.status).toBe(201);
    const body = await ok.json() as { task: { title: string; stage: string; ticketId: number; projectId: string } };
    expect(body.task).toMatchObject({ title: "Checkout", stage: "sprint", ticketId: 7, projectId: "p1" });
    // La tarea queda escrita en el tablero compartido.
    const boardWrite = state.inserted.find(i => i.table === "hub_state");
    expect(boardWrite).toBeTruthy();
    expect((boardWrite!.values.data as { tasks: unknown[] }).tasks).toHaveLength(1);
  });

  it("no convierte dos veces el mismo ticket", async () => {
    asRole("dev");
    state.tickets = [{ id: 7, title: "Checkout", description: "", area: "desarrollo", status: "en_progreso", createdBy: 9, assignedTo: 5, taskId: "tk7-abc", priority: "alta", projectId: "" }];
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets/7/to-task`, { method: "POST" });
    expect(r.status).toBe(409);
  });

  it("un comentario vacío no pasa", async () => {
    asRole("dev");
    state.tickets = [{ id: 7, title: "Checkout", description: "", area: "desarrollo", status: "abierto", createdBy: 9, assignedTo: null }];
    const port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/tickets/7/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "   " }),
    });
    expect(r.status).toBe(400);
  });
});
