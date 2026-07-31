// Cobros por dentro: quién puede mirar la caja, cómo se agrupan los pagos
// contra cada proyecto y el único cruce delicado — el pago que completa el
// total marca el contrato "pagado" (lo que alimenta las comisiones) sin
// pisar el tablero cuando alguien más está guardando.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

type Rec = Record<string, unknown>;

/* Tablas centinela; las columnas son referencias para que el mock de db
   pueda interpretar los where() construidos con el drizzle-orm simulado. */
const USERS = { __table: "users" };
const PAYMENTS = {
  __table: "contract_payments",
  id: { col: "id" },
  contractRef: { col: "contract_ref" },
  fecha: { col: "fecha" },
};
const PROFILES = { __table: "employee_profiles" };
const SETTINGS = { __table: "sales_settings" };

vi.mock("@workspace/db/schema", () => ({
  users: USERS,
  contractPayments: PAYMENTS,
  contractSignatures: { __table: "contract_signatures" },
  employeeProfiles: PROFILES,
  salesSettings: SETTINGS,
  salesAlerts: { __table: "sales_alerts" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  and: (...xs: unknown[]) => ({ op: "and", xs }),
  inArray: (a: unknown, b: unknown) => ({ op: "in", a, b }),
  desc: (c: unknown) => ({ desc: c }),
}));

const { recordActivityMock, notifyCeosMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn(),
  notifyCeosMock: vi.fn(async (_aviso: { title: string; body?: string; link?: string; type?: string; excludeUserId?: number }) => 1),
}));
vi.mock("../../lib/activity", () => ({ recordActivity: recordActivityMock }));
vi.mock("../../lib/notifications", () => ({
  createNotification: vi.fn(),
  notifyCeos: notifyCeosMock,
}));

/** Tablero simulado + última escritura condicionada. */
let boardData: Rec = {};
let saved: Rec | null = null;
let choquesDeVersion = 0;
/** Tableros que devuelven las RELECTURAS (simula una escritura rival entre medio). */
let boardSecuencia: Rec[] = [];
let lecturasDeTablero = 0;
vi.mock("../../lib/hub-board", () => ({
  resolveBoard: async () => {
    lecturasDeTablero++;
    const data = lecturasDeTablero > 1 && boardSecuencia.length > 0
      ? (boardSecuencia.shift() as Rec)
      : boardData;
    return { boardUserId: 1, data, owner: null, version: 0 };
  },
  saveBoard: async (_uid: number, data: Rec) => { saved = data; },
  saveBoardSiVersion: async (_uid: number, data: Rec, _v: number) => {
    if (choquesDeVersion > 0) { choquesDeVersion--; return null; }
    saved = data;
    return { data, version: Date.now() };
  },
}));

const rows: { me: Rec[]; users: Rec[]; pagos: Rec[] } = { me: [], users: [], pagos: [] };
let nextPagoId = 1;

vi.mock("@workspace/db", () => {
  const filtrarPagos = (cond: { op?: string; a?: unknown; b?: unknown } | null): Rec[] => {
    if (!cond) return rows.pagos;
    if (cond.op === "eq" && cond.a === PAYMENTS.id) return rows.pagos.filter((p) => p.id === cond.b);
    if (cond.op === "eq" && cond.a === PAYMENTS.contractRef) return rows.pagos.filter((p) => p.contractRef === cond.b);
    if (cond.op === "in" && cond.a === PAYMENTS.contractRef) {
      return rows.pagos.filter((p) => (cond.b as unknown[]).includes(p.contractRef));
    }
    return rows.pagos;
  };
  const from = (table: unknown) => {
    let cond: { op?: string; a?: unknown; b?: unknown } | null = null;
    const resolveRows = () => {
      if (table === PAYMENTS) return filtrarPagos(cond);
      if (table === USERS) return cond ? rows.me : rows.users;
      if (table === SETTINGS) return [{ id: 1, renewalAlertDays: 30 }];
      return [];
    };
    const chain: Record<string, unknown> = {};
    chain.where = (c: typeof cond) => { cond = c; return chain; };
    chain.orderBy = () => chain;
    chain.limit = async () => resolveRows();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(resolveRows());
    return chain;
  };
  return {
    db: {
      select: () => ({ from }),
      insert: (_t: unknown) => ({
        values: (v: Rec) => ({
          returning: async () => {
            const fila = { id: nextPagoId++, createdAt: new Date(), ...v };
            rows.pagos.push(fila);
            return [fila];
          },
        }),
      }),
      delete: (_t: unknown) => ({
        where: async (c: { b?: unknown }) => {
          rows.pagos = rows.pagos.filter((p) => p.id !== c.b);
        },
      }),
    },
  };
});

const CEO = { id: 1, name: "CEO", email: "ceo@x.cl", role: "user", teamRole: "ceo", approvalStatus: "approved" };
const VENDEDORA = { id: 7, name: "Vale Ventas", email: "vale@x.cl", role: "user", teamRole: "ventas", approvalStatus: "approved" };
const DEV = { id: 3, name: "Dev", email: "dev@x.cl", role: "user", teamRole: "dev", approvalStatus: "approved" };

async function api(as: Rec, method: string, path: string, body?: unknown) {
  rows.users = [CEO, VENDEDORA, DEV];
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
  boardSecuencia = [];
  lecturasDeTablero = 0;
  rows.pagos = [];
  nextPagoId = 1;
  recordActivityMock.mockClear();
  notifyCeosMock.mockClear();
});

const activo = (id: string, precioNeto: number, extra: Rec = {}): Rec => ({
  id, title: `Proyecto ${id}`, client: `Cliente ${id}`, status: "activo",
  doc: { modules: [{ price: precioNeto }] }, ...extra,
});

describe("GET /hub/cobros", () => {
  it("un rol sin montos no ve la caja", async () => {
    const r = await api(DEV, "GET", "/hub/cobros");
    expect(r.status).toBe(403);
  });

  it("agrupa pagos por proyecto, calcula estado/saldos y deja fuera los borradores", async () => {
    boardData = {
      contracts: [
        activo("c1", 1_000_000),
        activo("c2", 500_000, { cobro: { estado: "facturado", factura: "F-77", fechaPago: "", nota: "" } }),
        { id: "b1", title: "Borrador", status: "borrador", doc: { modules: [{ price: 900_000 }] } },
        { id: "v1", title: "Viejo", client: "Antiguo", status: "vencido", value: "$119.000" },
      ],
    };
    rows.pagos = [
      { id: 1, contractRef: "c1", fecha: "2026-07-10", monto: 595_000, nota: "abono 50%", createdById: 7, createdAt: new Date() },
    ];

    const r = await api(VENDEDORA, "GET", "/hub/cobros");
    expect(r.status).toBe(200);
    expect(r.body.proyectos.map((p: { id: string }) => p.id).sort()).toEqual(["c1", "c2", "v1"]);

    const c1 = r.body.proyectos.find((p: { id: string }) => p.id === "c1");
    expect(c1).toMatchObject({ neto: 1_000_000, iva: 190_000, total: 1_190_000, pagado: 595_000, saldo: 595_000, estadoPago: "parcial" });
    expect(c1.pagos).toHaveLength(1);
    expect(c1.pagos[0].creadoPor).toBe("Vale Ventas");

    const c2 = r.body.proyectos.find((p: { id: string }) => p.id === "c2");
    expect(c2.estadoPago).toBe("pendiente");
    expect(c2.cobro.estado).toBe("facturado");

    // El vencido (contrato viejo con value con IVA) queda al final de la lista.
    expect(r.body.proyectos[r.body.proyectos.length - 1].id).toBe("v1");
    const v1 = r.body.proyectos.find((p: { id: string }) => p.id === "v1");
    expect(v1).toMatchObject({ neto: 100_000, total: 119_000, estadoPago: "pendiente" });

    expect(r.body.totales).toEqual({ proyectos: 3, total: 1_904_000, pagado: 595_000, saldo: 1_309_000 });
    expect(r.body.cuenta.numero).toBe("1041474795");
    expect(r.body.cuenta.rutFormateado).toBe("78.042.968-2");
    expect(r.body.cuenta.textoCopiar).toContain("Mercado Pago");
    expect(r.body.miId).toBe(7);
    expect(r.body.esDireccion).toBe(false);
  });
});

describe("POST /hub/cobros/:id/pagos", () => {
  it("rechaza montos con decimales y fechas futuras", async () => {
    boardData = { contracts: [activo("c1", 1_000_000)] };
    const decimales = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-10", monto: 100.5 });
    expect(decimales.status).toBe(400);
    const futuro = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2999-01-01", monto: 100 });
    expect(futuro.status).toBe(400);
    expect(rows.pagos).toHaveLength(0);
  });

  it("no acepta pagos de borradores ni de contratos que no existen", async () => {
    boardData = { contracts: [{ id: "b1", status: "borrador", title: "B" }] };
    expect((await api(VENDEDORA, "POST", "/hub/cobros/b1/pagos", { fecha: "2026-07-10", monto: 100 })).status).toBe(409);
    expect((await api(VENDEDORA, "POST", "/hub/cobros/nada/pagos", { fecha: "2026-07-10", monto: 100 })).status).toBe(404);
  });

  it("un abono parcial queda registrado SIN marcar pagado el contrato", async () => {
    boardData = { contracts: [activo("c1", 1_000_000)] };
    const r = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-10", monto: 500_000, nota: "primera cuota" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, pagado: 500_000, saldo: 690_000, estadoPago: "parcial", cobroActualizado: false });
    expect(saved).toBeNull(); // el tablero no se tocó
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: "created" }));
    // Dirección se entera del movimiento, sin montos en el texto.
    expect(notifyCeosMock).toHaveBeenCalledTimes(1);
    const aviso = notifyCeosMock.mock.calls[0][0] as { title: string };
    expect(aviso.title).toContain("Pago registrado");
    expect(aviso.title).not.toMatch(/\d{4,}/);
  });

  it("el pago que completa el total marca el contrato 'pagado' con la fecha del pago", async () => {
    boardData = { contracts: [activo("c1", 1_000_000, { cobro: { estado: "facturado", factura: "F-9", fechaPago: "", nota: "n" } })] };
    rows.pagos = [{ id: 1, contractRef: "c1", fecha: "2026-07-01", monto: 600_000, nota: "", createdById: 7, createdAt: new Date() }];
    nextPagoId = 2;

    const r = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-20", monto: 590_000 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ pagado: 1_190_000, saldo: 0, estadoPago: "pagado", cobroActualizado: true });

    const contrato = (saved!.contracts as Rec[])[0];
    const cobro = contrato.cobro as Rec;
    expect(cobro.estado).toBe("pagado");
    expect(cobro.fechaPago).toBe("2026-07-20");
    expect(cobro.factura).toBe("F-9"); // la gestión previa no se pierde
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "status_change",
      detail: expect.objectContaining({ cobranza: true, to: "pagado", auto: true }),
    }));
    const aviso = notifyCeosMock.mock.calls[0][0] as { title: string };
    expect(aviso.title).toContain("pagado al completo");
  });

  it("si el tablero está ocupado, el pago VALE igual y solo queda pendiente la marca", async () => {
    boardData = { contracts: [activo("c1", 100_000)] };
    choquesDeVersion = 99;
    const r = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-10", monto: 119_000 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estadoPago: "pagado", cobroActualizado: false });
    expect(rows.pagos).toHaveLength(1);
  });

  it("un doble clic no duplica el pago: el reintento idéntico e inmediato se rechaza", async () => {
    boardData = { contracts: [activo("c1", 1_000_000)] };
    const cuerpo = { fecha: "2026-07-10", monto: 250_000, nota: "cuota" };
    expect((await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", cuerpo)).status).toBe(201);
    const repetido = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", cuerpo);
    expect(repetido.status).toBe(409);
    expect(rows.pagos).toHaveLength(1);
    // Otro monto sí es otro abono y entra normal.
    expect((await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-10", monto: 100_000 })).status).toBe(201);
    expect(rows.pagos).toHaveLength(2);
  });

  it("si un pago rival ya marcó 'pagado', el segundo NO pisa su fecha (de ahí salen las comisiones)", async () => {
    boardData = { contracts: [activo("c1", 1_000_000, { cobro: { estado: "facturado", factura: "", fechaPago: "", nota: "" } })] };
    rows.pagos = [{ id: 1, contractRef: "c1", fecha: "2026-07-01", monto: 600_000, nota: "", createdById: 7, createdAt: new Date() }];
    nextPagoId = 2;
    // La relectura del tablero ya lo encuentra marcado por el request rival.
    boardSecuencia = [{
      contracts: [activo("c1", 1_000_000, { cobro: { estado: "pagado", factura: "", fechaPago: "2026-07-03", nota: "" } })],
    }];
    const r = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-05", monto: 590_000 });
    expect(r.status).toBe(201);
    expect(r.body.cobroActualizado).toBe(false);
    expect(saved).toBeNull(); // ni una escritura al tablero
  });

  it("la fecha de 'pagado' es la del ÚLTIMO abono, no la del request que llegó al final", async () => {
    boardData = { contracts: [activo("c1", 1_000_000)] };
    rows.pagos = [{ id: 1, contractRef: "c1", fecha: "2026-07-20", monto: 600_000, nota: "", createdById: 7, createdAt: new Date() }];
    nextPagoId = 2;
    const r = await api(VENDEDORA, "POST", "/hub/cobros/c1/pagos", { fecha: "2026-07-05", monto: 590_000 });
    expect(r.status).toBe(201);
    expect(r.body.cobroActualizado).toBe(true);
    expect(((saved!.contracts as Rec[])[0].cobro as Rec).fechaPago).toBe("2026-07-20");
  });
});

describe("DELETE /hub/cobros/pagos/:pagoId", () => {
  const pagoAjeno = () => {
    boardData = { contracts: [activo("c1", 1_000_000, { cobro: { estado: "pagado", factura: "", fechaPago: "2026-07-10", nota: "" } })] };
    rows.pagos = [{ id: 1, contractRef: "c1", fecha: "2026-07-10", monto: 1_190_000, nota: "", createdById: 7, createdAt: new Date() }];
  };

  it("solo quien lo anotó o la dirección pueden quitarlo", async () => {
    pagoAjeno();
    rows.pagos[0].createdById = 1; // lo anotó el CEO
    const r = await api(VENDEDORA, "DELETE", "/hub/cobros/pagos/1");
    expect(r.status).toBe(403);
    expect(rows.pagos).toHaveLength(1);
  });

  it("al quitar un pago recalcula la foto, pero NO desmarca el 'pagado' del contrato", async () => {
    pagoAjeno();
    const r = await api(CEO, "DELETE", "/hub/cobros/pagos/1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, pagado: 0, saldo: 1_190_000, estadoPago: "pendiente" });
    expect(rows.pagos).toHaveLength(0);
    // Deshacer la gestión es decisión humana: el tablero no se toca.
    expect(saved).toBeNull();
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: "deleted" }));
  });

  it("quien lo anotó puede quitar el suyo (y un id inexistente da 404)", async () => {
    pagoAjeno();
    expect((await api(VENDEDORA, "DELETE", "/hub/cobros/pagos/1")).status).toBe(200);
    expect((await api(VENDEDORA, "DELETE", "/hub/cobros/pagos/99")).status).toBe(404);
  });
});
