import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/**
 * Router /panel (sección Agencia), SOLO de dirección — con una excepción:
 * - dirección (teamRole ceo o superadmin): ve todo tal cual llega del panel
 * - "tester" (cuenta de revisión de TikTok, no se toca): entra en modo
 *   equipo, con CADA respuesta saneada (sin plata, sin finanzas, sin
 *   documentos de dirección) y proyectos terminados solo si se compartieron.
 * - cualquier otro rol del equipo: 403 en la puerta, no entra ni reducido.
 * El rol se lee SIEMPRE de la base; la caché de vistas guarda el payload
 * crudo y se sanea por request (dirección y equipo comparten entrada).
 */

let usuarioDb: { id: number; role: string; teamRole: string | null } | null = null;
let visibilidadFilas: Array<{ panelId: string }> = [];
let valoresInsertados: unknown[] = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const promesa = Promise.resolve(visibilidadFilas.map((f) => ({ ...f }))) as Promise<unknown> & {
            limit?: (n: number) => Promise<unknown[]>;
          };
          promesa.limit = vi.fn(async () => (usuarioDb ? [usuarioDb] : []));
          return promesa;
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        valoresInsertados.push(v);
        return { onConflictDoUpdate: vi.fn(async () => {}) };
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => {}) })),
  },
}));
vi.mock("@workspace/db/schema", () => ({
  users: { id: "id" },
  panelEspejo: { id: "id", recurso: "recurso", datos: "datos" },
  panelVisibilidad: { recurso: "recurso", panelId: "panelId", compartido: "compartido", actualizado: "actualizado" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})), and: vi.fn(() => ({})), inArray: vi.fn(() => ({})) }));

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
const leerRegistroMock = vi.fn(async (..._a: unknown[]) => null as Record<string, unknown> | null);
const estadoFilaMock = vi.fn(
  async (): Promise<Record<string, unknown>> => ({
    id: 1,
    cursor: "2026-08-01T00:00:00.000Z",
    ultimaCorrida: null,
    ultimoExito: null,
    ultimoError: null,
    detalle: null,
  }),
);
vi.mock("../../lib/panel/espejo", () => ({
  ESTADOS_PROYECTO_FINAL: ["COMPLETED", "CANCELLED", "DELIVERED", "ARCHIVED"],
  esRecursoPanel: (r: string) =>
    [
      "clientes",
      "presupuestos",
      "proyectos",
      "contratos-servicio",
      "contratos-mantenimiento",
      "pagos-mantenimiento",
      "tareas",
      "bitacora",
      "leads",
    ].includes(r),
  guardarRegistros: (...a: unknown[]) => guardarMock(...a),
  leerEspejo: (...a: unknown[]) => leerEspejoMock(...a),
  leerRegistro: (...a: unknown[]) => leerRegistroMock(...a),
  estadoSyncFila: () => estadoFilaMock(),
  conteoPorRecurso: vi.fn(async () => ({ clientes: 5, presupuestos: 3, "pagos-mantenimiento": 12 })),
}));

const sincronizarMock = vi.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ ok: true, modo: "manual" }));
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

const comoCeo = () => {
  usuarioDb = { id: 7, role: "admin", teamRole: "ceo" };
};
const comoEditora = () => {
  usuarioDb = { id: 8, role: "admin", teamRole: "editora" };
};
/** Cuenta de revisión de TikTok: la única excepción que sigue en modo equipo. */
const comoTester = () => {
  usuarioDb = { id: 10, role: "admin", teamRole: "tester" };
};

/** El sync manual limpia la caché real de vistas: lo usamos entre tests. */
const limpiarCache = async () => {
  await llamar("POST", "/panel/sync");
};

beforeEach(() => {
  comoCeo();
  visibilidadFilas = [];
  valoresInsertados = [];
  panelGetMock.mockReset();
  panelPostMock.mockReset();
  panelPatchMock.mockReset();
  guardarMock.mockClear();
  leerEspejoMock.mockClear();
  leerRegistroMock.mockReset();
  leerRegistroMock.mockResolvedValue(null);
});

describe("modos de acceso", () => {
  it("sin usuario en sesión → 403", async () => {
    usuarioDb = null;
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(403);
  });

  it("una editora ya no entra a Agencia: 403 en la puerta, ni con vista reducida", async () => {
    comoEditora();
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(403);
    expect(r.cuerpo.porRecurso).toBeUndefined();
  });

  it("el resto de los roles del equipo tampoco entra a Agencia", async () => {
    for (const teamRole of ["social", "ventas", "dev", "marketing", "rrhh", "contador"] as const) {
      usuarioDb = { id: 20, role: "admin", teamRole };
      const r = await llamar("GET", "/panel/estado");
      expect(r.status, `${teamRole} no debería entrar a Agencia`).toBe(403);
    }
  });

  it("tester (cuenta de revisión) sigue entrando en modo equipo: estado sin recursos de dirección", async () => {
    comoTester();
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(200);
    expect(r.cuerpo.porRecurso.clientes).toBe(5);
    expect(r.cuerpo.porRecurso["pagos-mantenimiento"]).toBeUndefined();
  });

  it("el ceo ve el estado completo con conteos del espejo", async () => {
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(200);
    expect(r.cuerpo.porRecurso.clientes).toBe(5);
    expect(r.cuerpo.porRecurso["pagos-mantenimiento"]).toBe(12);
    expect(r.cuerpo.cursor).toBe("2026-08-01T00:00:00.000Z");
  });

  it("equipo (tester): el estado no trae diagnóstico interno (cursor/detalle/error crudo)", async () => {
    comoTester();
    estadoFilaMock.mockResolvedValueOnce({
      id: 1,
      cursor: "2026-08-01T00:00:00.000Z",
      ultimaCorrida: "2026-08-02T10:00:00.000Z",
      ultimoExito: null,
      ultimoError: "panel 500: cuerpo con detalle interno",
      detalle: { porRecurso: { "pagos-mantenimiento": 12 } },
    });
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(200);
    expect(r.cuerpo.cursor).toBeNull();
    expect(r.cuerpo.detalle).toBeNull();
    expect(r.cuerpo.ultimoError).toBeTruthy();
    expect(String(r.cuerpo.ultimoError)).not.toContain("detalle interno");
  });

  it("dirección: el estado conserva el error crudo para diagnosticar", async () => {
    estadoFilaMock.mockResolvedValueOnce({
      id: 1,
      cursor: "c1",
      ultimaCorrida: null,
      ultimoExito: null,
      ultimoError: "panel 500: cuerpo con detalle interno",
      detalle: { duracionMs: 40 },
    });
    const r = await llamar("GET", "/panel/estado");
    expect(r.status).toBe(200);
    expect(r.cuerpo.ultimoError).toContain("detalle interno");
    expect(r.cuerpo.detalle).toEqual({ duracionMs: 40 });
  });

  it("equipo (tester): el sync devuelve solo si se aplicó, sin diagnóstico", async () => {
    comoTester();
    sincronizarMock.mockResolvedValueOnce({ aplicado: true, motivo: "cursor movido", porRecurso: { "pagos-mantenimiento": 4 } });
    const r = await llamar("POST", "/panel/sync");
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ aplicado: true });
  });

  it("dirección: el sync devuelve el resultado completo", async () => {
    sincronizarMock.mockResolvedValueOnce({ aplicado: true, motivo: "al día", porRecurso: { clientes: 2 } });
    const r = await llamar("POST", "/panel/sync");
    expect(r.status).toBe(200);
    expect(r.cuerpo.motivo).toBe("al día");
    expect(r.cuerpo.porRecurso).toEqual({ clientes: 2 });
  });

  it("ventas: bloqueada en la puerta de Agencia, ni llega al gate de finanzas", async () => {
    usuarioDb = { id: 9, role: "admin", teamRole: "ventas" };
    const r = await llamar("GET", "/panel/finanzas/resumen");
    expect(r.status).toBe(403);
    expect(r.cuerpo.error).not.toBe("solo_direccion");
  });

  it("superadmin manda aunque su teamRole sea otro: modo completo", async () => {
    usuarioDb = { id: 1, role: "superadmin", teamRole: "editora" };
    panelGetMock.mockResolvedValueOnce({ ok: true, anio: 2026 });
    const r = await llamar("GET", "/panel/finanzas/resumen?anio=2026");
    expect(r.status).toBe(200);
  });
});

describe("espejo", () => {
  it("recurso desconocido → 404 honesto", async () => {
    const r = await llamar("GET", "/panel/espejo/nope");
    expect(r.status).toBe(404);
    expect(r.cuerpo.error).toBe("recurso_desconocido");
  });

  it("dirección: pasa los filtros al espejo sin filtro de equipo", async () => {
    const r = await llamar("GET", "/panel/espejo/presupuestos?status=SENT&clientId=abc&limite=50");
    expect(r.status).toBe(200);
    expect(leerEspejoMock).toHaveBeenCalledWith(
      "presupuestos",
      expect.objectContaining({ status: "SENT", clientId: "abc", limite: 50 }),
      { soloEquipo: false }
    );
  });

  it("equipo: pide el listado con visibilidad de equipo y lo entrega saneado", async () => {
    comoTester();
    leerEspejoMock.mockResolvedValueOnce({
      total: 1,
      limite: 100,
      offset: 0,
      datos: [{ id: "p1", clientId: "c1", status: "SENT", total: 119000, notes: "dcto", tokenUrl: "tok", _enlaces: { pdf: "x" } }],
    });
    const r = await llamar("GET", "/panel/espejo/presupuestos");
    expect(r.status).toBe(200);
    expect(leerEspejoMock).toHaveBeenCalledWith("presupuestos", expect.anything(), { soloEquipo: true });
    expect(r.cuerpo.datos[0]).toEqual({ id: "p1", clientId: "c1", status: "SENT" });
  });

  it("equipo: recursos de dirección (pagos-mantenimiento) → 403", async () => {
    comoTester();
    const r = await llamar("GET", "/panel/espejo/pagos-mantenimiento");
    expect(r.status).toBe(403);
    expect(r.cuerpo.error).toBe("solo_direccion");
  });

  it("equipo: proyecto terminado NO compartido → 404 (mismo mensaje que inexistente)", async () => {
    comoTester();
    leerRegistroMock.mockResolvedValueOnce({ id: "pr1", status: "COMPLETED", name: "Sitio", totalValue: 5 });
    const r = await llamar("GET", "/panel/espejo/proyectos/pr1");
    expect(r.status).toBe(404);
    expect(r.cuerpo.error).toBe("no_encontrado");
  });

  it("equipo: proyecto terminado compartido → 200 saneado", async () => {
    comoTester();
    visibilidadFilas = [{ panelId: "pr1" }];
    leerRegistroMock.mockResolvedValueOnce({ id: "pr1", status: "COMPLETED", name: "Sitio", totalValue: 5 });
    const r = await llamar("GET", "/panel/espejo/proyectos/pr1");
    expect(r.status).toBe(200);
    expect(r.cuerpo.datos.name).toBe("Sitio");
    expect(r.cuerpo.datos).not.toHaveProperty("totalValue");
  });

  it("equipo: tarea de un proyecto terminado no compartido → 404", async () => {
    comoTester();
    leerRegistroMock
      .mockResolvedValueOnce({ id: "t1", projectId: "pr1", title: "Deploy", status: "DOING" })
      .mockResolvedValueOnce({ id: "pr1", status: "COMPLETED" });
    const r = await llamar("GET", "/panel/espejo/tareas/t1");
    expect(r.status).toBe(404);
  });

  it("dirección: el registro llega tal cual, con plata incluida", async () => {
    leerRegistroMock.mockResolvedValueOnce({ id: "pr1", status: "COMPLETED", totalValue: 5 });
    const r = await llamar("GET", "/panel/espejo/proyectos/pr1");
    expect(r.status).toBe(200);
    expect(r.cuerpo.datos.totalValue).toBe(5);
  });
});

describe("vistas en vivo", () => {
  it("resumen: dirección y equipo comparten la caché CRUDA, cada uno su versión", async () => {
    await limpiarCache();
    panelGetMock.mockResolvedValue({
      ok: true,
      generadoEn: "2026-08-02T12:00:00Z",
      registros: { clientes: 2, "pagos-mantenimiento": 9 },
      negocio: { mrrNeto: 7, contratosMantenimientoActivos: 1, proyectosActivos: 3, presupuestosAbiertos: 2 },
    });
    const ceo = await llamar("GET", "/panel/resumen");
    expect(ceo.status).toBe(200);
    expect(ceo.cuerpo.negocio.mrrNeto).toBe(7);

    comoTester();
    const equipo = await llamar("GET", "/panel/resumen");
    expect(panelGetMock).toHaveBeenCalledTimes(1); // misma entrada de caché
    expect(equipo.cuerpo.negocio).toEqual({ contratosMantenimientoActivos: 1, proyectosActivos: 3, presupuestosAbiertos: 2 });
    expect(JSON.stringify(equipo.cuerpo)).not.toMatch(/mrr|pagos-mantenimiento/);
  });

  it("equipo: finanzas y contratos en vivo → 403; plantillas → solo id y nombre", async () => {
    comoTester();
    const fin = await llamar("GET", "/panel/finanzas/resumen");
    expect(fin.status).toBe(403);
    const con = await llamar("GET", "/panel/contratos");
    expect(con.status).toBe(403);
    expect(panelGetMock).not.toHaveBeenCalled();

    await llamar("GET", "/panel/plantillas-contrato").then(async (r0) => {
      // primera llamada llena caché (cruda); la respuesta ya viene reducida
      expect(r0.cuerpo.datos ?? []).toEqual([]);
    });
  });

  it("equipo: vista de detalle saneada en profundidad (items sin precios)", async () => {
    comoTester();
    panelGetMock.mockResolvedValueOnce({
      ok: true,
      datos: {
        presupuesto: { id: "p1", status: "SENT", total: 119000 },
        items: [{ id: "i1", name: "Sitio", quantity: 1, unitPrice: 100000 }],
        cliente: { id: "c1", companyName: "ACME" },
      },
    });
    const r = await llamar("GET", "/panel/vistas/presupuestos/p1");
    expect(r.status).toBe(200);
    expect(r.cuerpo.datos.presupuesto).toEqual({ id: "p1", status: "SENT" });
    expect(r.cuerpo.datos.items).toEqual([{ id: "i1", name: "Sitio", quantity: 1 }]);
    expect(r.cuerpo.datos.cliente.companyName).toBe("ACME");
  });

  it("equipo: vista de proyecto que no está en el espejo o no compartido → 404 sin tocar el panel", async () => {
    comoTester();
    const r = await llamar("GET", "/panel/vistas/proyectos/pr9");
    expect(r.status).toBe(404);
    expect(panelGetMock).not.toHaveBeenCalled();
  });
});

describe("compartir proyectos terminados (solo dirección)", () => {
  it("equipo no puede ni mirar ni tocar", async () => {
    comoTester();
    const ver = await llamar("GET", "/panel/compartidos/proyectos");
    expect(ver.status).toBe(403);
    const tocar = await llamar("PUT", "/panel/compartidos/proyectos", { compartido: true });
    expect(tocar.status).toBe(403);
  });

  it("dirección lee el estado de compartir (global + puntuales)", async () => {
    visibilidadFilas = [{ panelId: "*" }, { panelId: "pr2" }];
    const r = await llamar("GET", "/panel/compartidos/proyectos");
    expect(r.status).toBe(200);
    expect(r.cuerpo.todos).toBe(true);
    expect(r.cuerpo.ids).toEqual(["pr2"]);
  });

  it("dirección comparte todos con la fila global '*'", async () => {
    const r = await llamar("PUT", "/panel/compartidos/proyectos", { compartido: true });
    expect(r.status).toBe(200);
    expect(r.cuerpo.todos).toBe(true);
    expect(valoresInsertados[0]).toMatchObject({ recurso: "proyectos", panelId: "*", compartido: true });
  });

  it("dirección comparte un proyecto puntual; '*' como id → 400", async () => {
    leerRegistroMock.mockResolvedValueOnce({ id: "pr1", status: "COMPLETED" });
    const r = await llamar("PUT", "/panel/compartidos/proyectos/pr1", { compartido: true });
    expect(r.status).toBe(200);
    expect(valoresInsertados[0]).toMatchObject({ recurso: "proyectos", panelId: "pr1", compartido: true });
    const feo = await llamar("PUT", "/panel/compartidos/proyectos/*", { compartido: true });
    expect(feo.status).toBe(400);
  });

  it("dirección no puede compartir un id que no existe en el espejo → 404", async () => {
    leerRegistroMock.mockResolvedValueOnce(null);
    const r = await llamar("PUT", "/panel/compartidos/proyectos/fantasma", { compartido: true });
    expect(r.status).toBe(404);
    expect(valoresInsertados).toHaveLength(0);
  });
});

describe("escrituras delegadas", () => {
  it("crear presupuesto (dirección): delega al panel y refleja lo devuelto en el espejo", async () => {
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

  it("crear presupuesto (equipo): puede tipear precios, pero la respuesta vuelve sin plata", async () => {
    comoTester();
    const devuelto = { id: "p2", clientId: "c1", status: "DRAFT", total: 119000, notes: "n" };
    panelPostMock.mockResolvedValueOnce({ ok: true, datos: devuelto, calculo: { total: 119000 } });
    const r = await llamar("POST", "/panel/presupuestos", {
      clienteId: "c1",
      items: [{ name: "Sitio web", quantity: 1, unitPrice: 100000 }],
    });
    expect(r.status).toBe(200);
    // los precios que tipeó viajan al panel tal cual…
    const [, cuerpo] = panelPostMock.mock.calls[0] as [string, { items: Array<{ unitPrice: number }> }];
    expect(cuerpo.items[0].unitPrice).toBe(100000);
    // …pero no los vuelve a ver: ni calculo ni total ni notas
    expect(r.cuerpo).not.toHaveProperty("calculo");
    expect(r.cuerpo.datos).toEqual({ id: "p2", clientId: "c1", status: "DRAFT" });
    // y el espejo guarda el registro CRUDO (para dirección)
    expect(guardarMock).toHaveBeenCalledWith("presupuestos", [devuelto]);
  });

  it("editar presupuesto (equipo): solo viaja el estado, nada de notas ni vigencia", async () => {
    comoTester();
    panelPatchMock.mockResolvedValueOnce({ ok: true, datos: { id: "p1", status: "SENT", total: 9 } });
    const r = await llamar("PATCH", "/panel/presupuestos/p1", { estado: "SENT", notes: "hack", validUntil: "2027-01-01" });
    expect(r.status).toBe(200);
    const [, cuerpo] = panelPatchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(cuerpo).toEqual({ estado: "SENT" });
    expect(r.cuerpo.datos).toEqual({ id: "p1", status: "SENT" });
  });

  it("crear contrato (equipo): sin contenido libre; la respuesta conserva SOLO el link de firma", async () => {
    comoTester();
    panelPostMock.mockResolvedValueOnce({
      ok: true,
      creado: true,
      datos: {
        id: "cs1",
        proposalId: "p1",
        status: "PENDING_SIGNATURE",
        clientCompanyName: "ACME",
        tokenUrl: "tok",
        contenido: "$$$",
        total: 119000,
        _enlaces: { contrato: "https://f/abc", pdf: "https://p/pdf" },
      },
    });
    const r = await llamar("POST", "/panel/contratos-servicio", {
      presupuestoId: "p1",
      plantillaId: "t1",
      contenido: "texto que no debe viajar",
      estado: "PENDING_SIGNATURE",
    });
    expect(r.status).toBe(200);
    const [, cuerpo] = panelPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(cuerpo.contenido).toBeUndefined();
    expect(cuerpo.plantillaId).toBe("t1");
    expect(r.cuerpo.creado).toBe(true);
    expect(r.cuerpo.datos._enlaces).toEqual({ contrato: "https://f/abc" });
    expect(r.cuerpo.datos).not.toHaveProperty("tokenUrl");
    expect(r.cuerpo.datos).not.toHaveProperty("contenido");
    expect(r.cuerpo.datos).not.toHaveProperty("total");
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

describe("redacción de contratos con IA", () => {
  it("equipo → 403 en redactar y corregir (la redacción trae plata)", async () => {
    comoTester();
    const r1 = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { presupuestoId: "p1" });
    expect(r1.status).toBe(403);
    expect(r1.cuerpo.error).toBe("solo_direccion");
    const r2 = await llamar("POST", "/panel/contratos-servicio/corregir-ia", {
      correccion: "más corto",
      secciones: [{ titulo: "GARANTÍA", contenido: "1 mes" }],
    });
    expect(r2.status).toBe(403);
    expect(panelPostMock).not.toHaveBeenCalled();
  });

  it("dirección: redactar delega al panel con timeout amplio y devuelve secciones sin guardar nada", async () => {
    panelPostMock.mockResolvedValueOnce({
      ok: true,
      modelo: "gemini",
      contexto: { cliente: "ACME", total: 119000, formaDePago: "50% y 50%" },
      secciones: [{ titulo: "ALCANCE DEL PROYECTO", contenido: "**Sitio** a medida" }],
    });
    const r = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { presupuestoId: "p1", campoRaro: 1 });
    expect(r.status).toBe(200);
    expect(r.cuerpo.secciones[0].titulo).toBe("ALCANCE DEL PROYECTO");
    const [ruta, cuerpo, opciones] = panelPostMock.mock.calls[0] as [string, Record<string, unknown>, { timeoutMs?: number }];
    expect(ruta).toBe("/contratos-servicio/redactar-ia");
    expect(cuerpo.campoRaro).toBeUndefined();
    expect(opciones?.timeoutMs).toBe(120_000);
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("redactar sin presupuesto ni (cliente + items) → 400 sin molestar al panel", async () => {
    const r = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { paymentModality: "50% y 50%" });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toBe("datos_invalidos");
    expect(panelPostMock).not.toHaveBeenCalled();
  });

  it("panel sin su actualización publicada (SPA devuelve HTML 200) → 503 ia_no_disponible honesto", async () => {
    const { PanelError } = await import("../../lib/panel/cliente");
    panelPostMock.mockRejectedValueOnce(new PanelError(502, "respuesta_invalida", "no era JSON"));
    const r1 = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { presupuestoId: "p1" });
    expect(r1.status).toBe(503);
    expect(r1.cuerpo.error).toBe("ia_no_disponible");
  });

  it("un 404 legítimo del panel (presupuesto inexistente) NO se disfraza de IA no disponible", async () => {
    const { PanelError } = await import("../../lib/panel/cliente");
    panelPostMock.mockRejectedValueOnce(new PanelError(404, "no_encontrado", "El presupuesto no existe."));
    const r = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { presupuestoId: "fantasma" });
    expect(r.status).toBe(404);
    expect(r.cuerpo.error).toBe("no_encontrado");
    expect(r.cuerpo.mensaje).toBe("El presupuesto no existe.");
  });

  it("equipo: la vista en vivo de un contrato no trae email ni IP del firmante", async () => {
    comoTester();
    panelGetMock.mockResolvedValueOnce({
      ok: true,
      datos: {
        id: "cs1",
        status: "SIGNED",
        signedAt: "2026-08-01T12:00:00Z",
        signedByName: "Juan Pérez",
        signedByEmail: "juan@acme.cl",
        signedByIp: "200.1.2.3",
        signedPdfUrl: "https://p/pdf",
        contenido: "$$$",
        _enlaces: { contrato: "https://f/abc", pdf: "https://p/pdf" },
      },
    });
    const r = await llamar("GET", "/panel/vistas/contratos-servicio/cs1");
    expect(r.status).toBe(200);
    expect(r.cuerpo.datos.signedByName).toBe("Juan Pérez");
    expect(r.cuerpo.datos).not.toHaveProperty("signedByEmail");
    expect(r.cuerpo.datos).not.toHaveProperty("signedByIp");
    expect(r.cuerpo.datos).not.toHaveProperty("signedPdfUrl");
    expect(r.cuerpo.datos).not.toHaveProperty("contenido");
    expect(r.cuerpo.datos._enlaces).toEqual({ contrato: "https://f/abc" });
  });

  it("la IA apagada en el propio panel (503 ia_no_configurada) pasa tal cual", async () => {
    const { PanelError } = await import("../../lib/panel/cliente");
    panelPostMock.mockRejectedValueOnce(new PanelError(503, "ia_no_configurada", "El administrador debe configurar la API key."));
    const r = await llamar("POST", "/panel/contratos-servicio/redactar-ia", { presupuestoId: "p1" });
    expect(r.status).toBe(503);
    expect(r.cuerpo.error).toBe("ia_no_configurada");
  });

  it("corregir exige la instrucción y las secciones actuales", async () => {
    const r = await llamar("POST", "/panel/contratos-servicio/corregir-ia", { correccion: "ok", secciones: [] });
    expect(r.status).toBe(400);
    expect(panelPostMock).not.toHaveBeenCalled();
  });

  it("crear contrato (dirección): las secciones redactadas viajan al panel y el formato confirmado vuelve", async () => {
    panelPostMock.mockResolvedValueOnce({
      ok: true,
      creado: true,
      formatoContenido: "secciones",
      datos: { id: "cs2", proposalId: "p1", status: "DRAFT" },
    });
    const secciones = [{ titulo: "GARANTÍA", contenido: "1 mes de **garantía**\n\n- bugs\n- hosting" }];
    const r = await llamar("POST", "/panel/contratos-servicio", { presupuestoId: "p1", secciones });
    expect(r.status).toBe(200);
    expect(r.cuerpo.formatoContenido).toBe("secciones");
    const [, cuerpo] = panelPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(cuerpo.secciones).toEqual(secciones);
    expect(cuerpo.plantillaId).toBeUndefined();
  });

  it("crear contrato (equipo): las secciones se descartan igual que el contenido libre", async () => {
    comoTester();
    panelPostMock.mockResolvedValueOnce({ ok: true, creado: true, datos: { id: "cs3", proposalId: "p1", status: "DRAFT" } });
    const r = await llamar("POST", "/panel/contratos-servicio", {
      presupuestoId: "p1",
      secciones: [{ titulo: "X", contenido: "no debe viajar" }],
    });
    expect(r.status).toBe(200);
    const [, cuerpo] = panelPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(cuerpo.secciones).toBeUndefined();
  });
});
