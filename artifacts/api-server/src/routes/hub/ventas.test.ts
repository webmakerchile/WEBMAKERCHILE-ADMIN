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
/** Cuántos guardados condicionados deben "chocar" (simula escrituras cruzadas). */
let choquesDeVersion = 0;
vi.mock("../../lib/hub-board", () => ({
  resolveBoard: async () => ({ boardUserId: 1, data: boardData, owner: null, version: 0 }),
  saveBoard: async (_uid: number, data: Record<string, unknown>) => { saved = data; },
  saveBoardSiVersion: async (_uid: number, data: Record<string, unknown>, _v: number) => {
    if (choquesDeVersion > 0) { choquesDeVersion--; return null; }
    saved = data;
    return { data, version: Date.now() };
  },
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
  choquesDeVersion = 0;
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
    // Embudo por fases: o1 tiene propuesta sobre la mesa, o2 sigue en
    // reuniones y el activo cuenta como ganado. Recuentos, sin montos.
    expect(r.body.embudo).toEqual({ enReuniones: 1, propuestaEnviada: 1, aFuturo: 0, ganados: 1, perdidos: 0 });
    expect(r.body.casosFuturo).toEqual([]);
    expect(r.body.casosPerdidos).toEqual([]);
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

describe("POST /hub/ventas/opportunities/:id/reuniones", () => {
  it("agenda la reunión vinculada, fija el seguimiento y reactiva casos a futuro", async () => {
    boardData = {
      contracts: [{ id: "o1", title: "Web ACME", client: "ACME", status: "borrador", futuroFecha: "2026-09-01", futuroMotivo: "fondos" }],
      meetings: [],
    };
    const r = await api(VENDEDORA, "POST", "/hub/ventas/opportunities/o1/reuniones", { tipo: "discovery", date: "2026-08-05" });
    expect(r.status).toBe(201);
    const meetings = saved!.meetings as Record<string, unknown>[];
    expect(meetings).toHaveLength(1);
    expect(meetings[0].tipo).toBe("discovery");
    expect(meetings[0].contractId).toBe("o1");
    expect(meetings[0].client).toBe("ACME");
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.nextFollowUp).toBe("2026-08-05");
    expect(c.futuroFecha).toBe(""); // volver a agendar reactiva el caso
    expect(c.futuroMotivo).toBe("");
  });

  it("no se agenda sobre un contrato que ya salió del embudo", async () => {
    boardData = { contracts: [{ id: "o1", status: "activo" }], meetings: [] };
    const r = await api(VENDEDORA, "POST", "/hub/ventas/opportunities/o1/reuniones", { tipo: "discovery", date: "2026-08-05" });
    expect(r.status).toBe(409);
    expect(saved).toBeNull();
  });

  it("otros roles no agendan reuniones de venta", async () => {
    boardData = { contracts: [{ id: "o1", status: "borrador" }], meetings: [] };
    const r = await api(CONTADOR, "POST", "/hub/ventas/opportunities/o1/reuniones", { tipo: "discovery", date: "2026-08-05" });
    expect(r.status).toBe(403);
    expect(saved).toBeNull();
  });
});

describe("POST /hub/ventas/reuniones/:id/desenlace", () => {
  const conReunion = (extraMeeting: Record<string, unknown> = {}, extraContract: Record<string, unknown> = {}) => {
    boardData = {
      contracts: [{ id: "o1", title: "Web", client: "ACME", status: "borrador", nextFollowUp: "2026-07-30", ...extraContract }],
      meetings: [{ id: "m1", client: "ACME", date: "2026-07-30", tipo: "discovery", contractId: "o1", ...extraMeeting }],
    };
  };

  it("siguiente_reunion crea la próxima (discovery → propuesta) y mueve el seguimiento", async () => {
    conReunion();
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "siguiente_reunion", siguienteFecha: "2026-08-10" });
    expect(r.status).toBe(200);
    const meetings = saved!.meetings as Record<string, unknown>[];
    expect(meetings).toHaveLength(2);
    expect(meetings[0].desenlace).toBe("siguiente_reunion");
    expect(meetings[1].tipo).toBe("propuesta"); // el tipo siguiente sale solo
    expect(meetings[1].date).toBe("2026-08-10");
    expect(meetings[1].contractId).toBe("o1");
    expect((saved!.contracts as Record<string, unknown>[])[0].nextFollowUp).toBe("2026-08-10");
    expect(r.body.siguiente).not.toBeNull();
  });

  it("acepta_inmediato empuja la oportunidad a cierre (la activa la firma, no esto)", async () => {
    conReunion({ tipo: "propuesta" });
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "acepta_inmediato" });
    expect(r.status).toBe(200);
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.pipelineStage).toBe("cierre");
    expect(c.probability).toBe(90);
    expect(c.status).toBe("borrador");
    // El seguimiento apuntaba a la reunión ya resuelta: se apaga para que no
    // suene "seguimiento vencido" por una fecha que ya pasó bien.
    expect(c.nextFollowUp).toBe("");
  });

  it("acepta_futuro guarda motivo y fecha, y apaga el seguimiento normal", async () => {
    conReunion();
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", {
      desenlace: "acepta_futuro", futuroMotivo: "fondos", futuroFecha: "2026-10-01", futuroNota: "espera aprobación del banco",
    });
    expect(r.status).toBe(200);
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.futuroMotivo).toBe("fondos");
    expect(c.futuroFecha).toBe("2026-10-01");
    expect(c.futuroNota).toBe("espera aprobación del banco");
    expect(c.nextFollowUp).toBe(""); // de recordarlo se encarga el aviso de casos a futuro
  });

  it("acepta_futuro sin fecha no pasa", async () => {
    conReunion();
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "acepta_futuro", futuroMotivo: "fondos" });
    expect(r.status).toBe(400);
    expect(saved).toBeNull();
  });

  it("perdido marca el contrato con su motivo", async () => {
    conReunion();
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "perdido", motivoPerdida: "precio" });
    expect(r.status).toBe(200);
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.status).toBe("perdido");
    expect(c.motivoPerdida).toBe("precio");
    expect((saved!.meetings as Record<string, unknown>[])[0].desenlace).toBe("perdido");
  });

  it("perdido sin motivo no pasa", async () => {
    conReunion();
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "perdido" });
    expect(r.status).toBe(400);
    expect(saved).toBeNull();
  });

  it("una reunión ya resuelta no se resuelve dos veces", async () => {
    conReunion({ desenlace: "siguiente_reunion" });
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "perdido", motivoPerdida: "precio" });
    expect(r.status).toBe(409);
    expect(saved).toBeNull();
  });

  it("las reuniones manuales (sin oportunidad) no llevan desenlace", async () => {
    boardData = { contracts: [], meetings: [{ id: "m1", date: "2026-07-30" }] };
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "acepta_inmediato" });
    expect(r.status).toBe(409);
    expect(saved).toBeNull();
  });

  it("una reunión enlazada a mano pero sin tipo de venta tampoco: no puede cerrar ni perder un contrato", async () => {
    conReunion({ tipo: undefined });
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "perdido", motivoPerdida: "precio" });
    expect(r.status).toBe(409);
    expect(saved).toBeNull();
    expect((boardData.contracts as Record<string, unknown>[])[0].status).toBe("borrador");
  });

  it("si otro guardado del tablero se cruza, reintenta con la copia fresca en vez de pisarla", async () => {
    conReunion();
    choquesDeVersion = 1;
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "acepta_inmediato" });
    expect(r.status).toBe(200);
    expect((saved!.contracts as Record<string, unknown>[])[0].pipelineStage).toBe("cierre");
  });

  it("si el tablero no deja de cambiar, avisa (503) en vez de guardar una copia vieja", async () => {
    conReunion();
    choquesDeVersion = 99;
    const r = await api(VENDEDORA, "POST", "/hub/ventas/reuniones/m1/desenlace", { desenlace: "acepta_inmediato" });
    expect(r.status).toBe(503);
    expect(saved).toBeNull();
  });
});
