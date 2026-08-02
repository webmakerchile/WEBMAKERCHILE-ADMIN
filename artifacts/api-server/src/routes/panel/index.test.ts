import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/**
 * Router /panel (sección Agencia). Lo que importa:
 * - gate por rol: solo quien ve dinero entra (el rol se lee de la base)
 * - las escrituras se delegan al panel y lo devuelto se refleja en el espejo
 * - un 409 del panel (transicion_no_permitida) pasa tal cual, sin inventos
 * - recursos desconocidos → 404; cuerpos inválidos → 400 sin llamar al panel
 */

let usuarioDb: { id: number; role: string; teamRole: string | null } | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => (usuarioDb ? [usuarioDb] : [])) })),
      })),
    })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));

const panelGetMock = vi.fn();
const panelPostMock = vi.fn();
const panelPatchMock = vi.fn();
vi.mock("../../lib/panel/cliente", () => {
  class PanelError extends Error {
    constructor(
      readonly status: number,
      readonly codigo: string,
      mensaje: string
    ) {
      super(mensaje);
      this.name = "PanelError";
    }
  }
  return {
    PanelError,
    panelGet: (...a: unknown[]) => panelGetMock(...a),
    panelPost: (...a: unknown[]) => panelPostMock(...a),
    panelPatch: (...a: unknown[]) => panelPatchMock(...a),
    panelConfigurado: () => true,
  };
});

const guardarMock = vi.fn(async (..._a: unknown[]) => {});
const leerEspejoMock = vi.fn(async (..._a: unknown[]) => ({ total: 0, limite: 100, offset: 0, datos: [] as unknown[] }));
vi.mock("../../lib/panel/espejo", () => ({
  esRecursoPanel: (r: string) =>
    ["clientes", "presupuestos", "proyectos", "contratos-servicio", "contratos-mantenimiento", "pagos-mantenimiento", "tareas", "leads"].includes(r),
  guardarRegistros: (...a: unknown[]) => guardarMock(...a),
  leerEspejo: (...a: unknown[]) => leerEspejoMock(...a),
  leerRegistro: vi.fn(async () => null),
  estadoSyncFila: vi.fn(async () => ({
    id: 1,
    cursor: "2026-08-01T00:00:00.000Z",
    ultimaCorrida: null,
    ultimoExito: null,
    ultimoError: null,
    detalle: null,
  })),
  conteoPorRecurso: vi.fn(async () => ({ clientes: 5, presupuestos: 3 })),
}));

const sincronizarMock = vi.fn(async (..._a: unknown[]) => ({ ok: true, modo: "manual" }));
vi.mock("../../lib/panel/sync", () => ({
  sincronizarPanel: (...a: unknown[]) => sincronizarMock(...a),
}));

let puerto = 0;
let servidor: ReturnType<typeof express.application.listen> | null = null;

async function arrancar(): Promise<number> {
  if (puerto) return puerto;
  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (usuarioDb) (req as Request & { user?: { id: number } }).user = { id: usuarioDb.id };
    next();
  });
  app.use("/api", router);
  puerto = await new Promise<number>((resolve) => {
    servidor = app.listen(0, () => {
      const a = servidor!.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  return puerto;
}

afterAll(() => {
  servidor?.close();
});

const llamar = async (metodo: string, ruta: string, body?: unknown) => {
  const p = await arrancar();
  const r = await fetch(`http://127.0.0.1:${p}/api${ruta}`, {
    method: metodo,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, cuerpo: (await r.json().catch(() => null)) as any };
};

beforeEach(() => {
  usuarioDb = { id: 7, role: "admin", teamRole: "ceo" };
  panelGetMock.mockReset();
  panelPostMock.mockReset();
  panelPatchMock.mockReset();
  guardarMock.mockClear();
  leerEspejoMock.mockClear();
});

describe("gate por rol", () => {
  it("una editora no ve los datos del negocio", async () => {
    usuarioDb = { id: 7, role: "admin", teamRole: "editora" };
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(403);
  });

  it("sin usuario en sesión tampoco", async () => {
    usuarioDb = null;
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(403);
  });

  it("el ceo ve el estado con conteos del espejo", async () => {
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(200);
    expect(r.cuerpo.porRecurso.clientes).toBe(5);
    expect(r.cuerpo.cursor).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("espejo", () => {
  it("recurso desconocido → 404 honesto", async () => {
    const r = await llamar("GET", "/panel/espejo/nope");
    expect(r.status).toBe(404);
    expect(r.cuerpo.error).toBe("recurso_desconocido");
  });

  it("pasa los filtros soportados al espejo", async () => {
    const r = await llamar("GET", "/panel/espejo/presupuestos?status=SENT&clientId=abc&limite=50");
    expect(r.status).toBe(200);
    expect(leerEspejoMock).toHaveBeenCalledWith(
      "presupuestos",
      expect.objectContaining({ status: "SENT", clientId: "abc", limite: 50 })
    );
  });
});

describe("escrituras delegadas", () => {
  it("crear presupuesto: delega al panel y refleja lo devuelto en el espejo", async () => {
    const devuelto = { id: "p1", clientId: "c1", status: "SENT", total: 119000 };
    panelPostMock.mockResolvedValueOnce({ ok: true, datos: devuelto, calculo: { subtotal: 100000, descuento: 0, iva: 19000, total: 119000 } });
    const r = await llamar("POST", "/panel/presupuestos", {
      clienteId: "c1",
      items: [{ name: "Sitio web", quantity: 1, unitPrice: 100000 }],
      hasIVA: true,
      estado: "SENT",
      campoRaro: "se descarta",
    });
    expect(r.status).toBe(200);
    expect(r.cuerpo.calculo.total).toBe(119000);
    // el cuerpo que viaja al panel no lleva campos desconocidos ni plata calculada acá
    const [ruta, cuerpo] = panelPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(ruta).toBe("/presupuestos");
    expect(cuerpo.campoRaro).toBeUndefined();
    expect(cuerpo).not.toHaveProperty("total");
    expect(guardarMock).toHaveBeenCalledWith("presupuestos", [devuelto]);
  });

  it("cuerpo inválido → 400 sin molestar al panel", async () => {
    const r = await llamar("POST", "/panel/presupuestos", { clienteId: "c1", items: [] });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toBe("datos_invalidos");
    expect(panelPostMock).not.toHaveBeenCalled();
  });

  it("un 409 del panel pasa tal cual (transicion_no_permitida)", async () => {
    const { PanelError } = await import("../../lib/panel/cliente");
    panelPatchMock.mockRejectedValueOnce(new PanelError(409, "transicion_no_permitida", "El contrato ya está firmado."));
    const r = await llamar("PATCH", "/panel/contratos-servicio/x1", { estado: "EXPIRED" });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toBe("transicion_no_permitida");
    expect(r.cuerpo.mensaje).toBe("El contrato ya está firmado.");
  });

  it("cliente repetido: el aviso creado:false del panel llega intacto", async () => {
    panelPostMock.mockResolvedValueOnce({ ok: true, creado: false, datos: { id: "c9", companyName: "ACME" } });
    const r = await llamar("POST", "/panel/clientes", { companyName: "ACME" });
    expect(r.status).toBe(200);
    expect(r.cuerpo.creado).toBe(false);
    expect(guardarMock).toHaveBeenCalledWith("clientes", [{ id: "c9", companyName: "ACME" }]);
  });
});

describe("vistas en vivo", () => {
  it("cachea el resumen un rato para no golpear al panel", async () => {
    panelGetMock.mockResolvedValue({ ok: true, negocio: { mrrNeto: 1 } });
    const a = await llamar("GET", "/panel/resumen");
    const b = await llamar("GET", "/panel/resumen");
    expect(a.status).toBe(200);
    expect(b.cuerpo.negocio.mrrNeto).toBe(1);
    expect(panelGetMock).toHaveBeenCalledTimes(1);
  });
});
