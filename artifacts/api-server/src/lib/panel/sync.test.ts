import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Reconciliación completa del espejo (además del sync por cursor, que solo
 * aplica altas/cambios y NUNCA borra). Lo que importa:
 * - pisa cada recurso con el listado COMPLETO y actual (autocura lo que el
 *   delta nunca vuelve a traer)
 * - poda del espejo los ids que ya no vienen en ese listado fresco (bajas
 *   del origen que el cursor nunca detecta)
 * - salvaguarda: un listado fresco VACÍO salta la poda de ese recurso en
 *   vez de borrarlo entero (protección ante una respuesta rara del origen)
 * - mismo anti-carrera que el sync normal: si otra instancia movió el
 *   cursor mientras bajábamos datos, se descarta en paz
 * - checkPanelSync alterna reconciliación (1x/día) vs. sync delta normal
 */

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
  notInArray: (col: unknown, vals: unknown[]) => ({ __notInArray: [col, vals] }),
  sql: () => ({ __sql: true }),
}));

vi.mock("@workspace/db/schema", () => ({
  panelEspejo: { recurso: "recurso", id: "id" },
  panelSyncEstado: { id: "id" },
}));

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  },
}));

vi.mock("./cliente", () => ({
  panelConfigurado: vi.fn(() => true),
  panelGet: vi.fn(),
}));

vi.mock("./espejo", () => ({
  RECURSOS_PANEL: ["proyectos", "tareas", "presupuestos"],
  estadoSyncFila: vi.fn(),
  guardarRegistros: vi.fn(async (_r: string, datos: unknown[]) => datos.length),
}));

vi.mock("./equipo", () => ({
  retirarCompartidosDeTerminados: vi.fn(async () => 0),
}));

vi.mock("./cache-vistas", () => ({
  limpiarCacheVistas: vi.fn(),
}));

import { db } from "@workspace/db";
import { panelGet } from "./cliente";
import { estadoSyncFila, guardarRegistros } from "./espejo";
import { retirarCompartidosDeTerminados } from "./equipo";
import { checkPanelSync, reconciliarPanel } from "./sync";

type Cond = { __and: Array<{ __eq?: [unknown, unknown] }> };

/** tx falso: delete().where().returning() resuelve según el recurso que codifica la condición (ver mock de eq/and arriba). */
function makeTx(podadosPorRecurso: Record<string, Array<{ id: string }>>) {
  return {
    execute: vi.fn(async () => ({ rows: [] })),
    delete: vi.fn(() => ({
      where: vi.fn((cond: Cond) => {
        const recurso = cond.__and[0]?.__eq?.[1] as string;
        return { returning: vi.fn(async () => podadosPorRecurso[recurso] ?? []) };
      }),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
}

function bloque(datos: Array<Record<string, unknown>>, extra: Partial<Record<string, unknown>> = {}) {
  return { total: datos.length, devueltos: datos.length, truncado: false, campoFechaSync: "createdAt", datos, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliarPanel", () => {
  it("pisa cada recurso con el listado fresco y poda los ids que ya no vienen", async () => {
    vi.mocked(estadoSyncFila).mockResolvedValue({ id: 1, cursor: "cursor-viejo" } as never);
    vi.mocked(panelGet).mockResolvedValue({
      ok: true,
      tipo: "snapshot",
      cursor: "cursor-nuevo",
      desde: null,
      totalRegistros: 3,
      recursos: {
        proyectos: bloque([{ id: "p1" }, { id: "p2" }]),
        tareas: bloque([{ id: "t1", projectId: "p1" }]),
      },
    } as never);
    // Local: "p1","p2" siguen; "zzz-viejo" ya no está en el listado fresco -> se poda.
    const tx = makeTx({ proyectos: [{ id: "zzz-viejo" }] });
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const r = await reconciliarPanel();

    expect(r.aplicado).toBe(true);
    expect(r.porRecursoActualizados).toEqual({ proyectos: 2, tareas: 1 });
    expect(r.porRecursoPodados).toEqual({ proyectos: 1 });
    expect(guardarRegistros).toHaveBeenCalledWith("proyectos", [{ id: "p1" }, { id: "p2" }], tx);
    expect(guardarRegistros).toHaveBeenCalledWith("tareas", [{ id: "t1", projectId: "p1" }], tx);
    expect(retirarCompartidosDeTerminados).toHaveBeenCalledWith([{ id: "p1" }, { id: "p2" }], tx);
  });

  it("completa un recurso truncado paginando antes de comparar universos", async () => {
    vi.mocked(estadoSyncFila).mockResolvedValue({ id: 1, cursor: null } as never);
    vi.mocked(panelGet)
      .mockResolvedValueOnce({
        ok: true,
        tipo: "snapshot",
        cursor: "c1",
        desde: null,
        totalRegistros: 1000,
        recursosTruncados: ["presupuestos"],
        recursos: { presupuestos: bloque(Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}` }))) },
      } as never)
      .mockResolvedValueOnce({ datos: [{ id: "b1000" }], paginacion: { hayMas: false } } as never);
    const tx = makeTx({});
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const r = await reconciliarPanel();

    expect(r.porRecursoActualizados).toEqual({ presupuestos: 1001 });
    expect(panelGet).toHaveBeenNthCalledWith(2, "/presupuestos", { params: { limite: 1000, offset: 1000 }, timeoutMs: 60_000 });
  });

  it("si el listado fresco de un recurso viene vacío, salta la poda de ese recurso (no lo vacía)", async () => {
    vi.mocked(estadoSyncFila).mockResolvedValue({ id: 1, cursor: null } as never);
    vi.mocked(panelGet).mockResolvedValue({
      ok: true,
      tipo: "snapshot",
      cursor: "c1",
      desde: null,
      totalRegistros: 0,
      recursos: { presupuestos: bloque([]) },
    } as never);
    const tx = makeTx({});
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const r = await reconciliarPanel();

    expect(r.aplicado).toBe(true);
    expect(r.omitidos).toEqual(["presupuestos"]);
    expect(r.porRecursoPodados).toEqual({});
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("si otra instancia ya movió el cursor mientras bajábamos datos, no aplica nada", async () => {
    vi.mocked(estadoSyncFila)
      .mockResolvedValueOnce({ id: 1, cursor: "c1" } as never) // lectura inicial (fuera de la tx)
      .mockResolvedValueOnce({ id: 1, cursor: "c-otra-instancia" } as never); // re-chequeo adentro de la tx
    vi.mocked(panelGet).mockResolvedValue({
      ok: true, tipo: "snapshot", cursor: "c2", desde: null, totalRegistros: 0, recursos: {},
    } as never);
    const tx = makeTx({});
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const r = await reconciliarPanel();

    expect(r).toEqual({ aplicado: false, motivo: "otra_instancia" });
    expect(guardarRegistros).not.toHaveBeenCalled();
  });
});

describe("checkPanelSync: alterna reconciliación (1x/día) y sync delta normal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("si nunca reconcilió, corre reconciliarPanel (snapshot completo) en vez del delta", async () => {
    vi.mocked(estadoSyncFila).mockResolvedValue({
      id: 1,
      cursor: "cursor-existente",
      ultimaCorrida: new Date("2026-08-09T00:00:00Z"),
      ultimaReconciliacion: null,
    } as never);
    vi.mocked(panelGet).mockResolvedValue({
      ok: true, tipo: "snapshot", cursor: "c2", desde: null, totalRegistros: 0, recursos: {},
    } as never);
    const tx = makeTx({});
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await checkPanelSync();

    // Reconciliación SIEMPRE pide el snapshot completo, sin ?desde=cursor.
    expect(panelGet).toHaveBeenCalledWith("/sync/snapshot", { params: { limitePorRecurso: 1000 }, timeoutMs: 90_000 });
  });

  it("si reconcilió hace poco, corre el sync delta normal (por cursor)", async () => {
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // saltar el throttle en memoria de checkPanelSync
    vi.mocked(estadoSyncFila).mockResolvedValue({
      id: 1,
      cursor: "cursor-existente",
      ultimaCorrida: new Date("2026-08-01T00:00:00Z"),
      ultimaReconciliacion: new Date(),
    } as never);
    vi.mocked(panelGet).mockResolvedValue({
      ok: true, tipo: "delta", cursor: "c3", desde: "cursor-existente", totalRegistros: 0, recursos: {},
    } as never);
    const tx = makeTx({});
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await checkPanelSync();

    expect(panelGet).toHaveBeenCalledWith("/sync/cambios", { params: { desde: "cursor-existente" }, timeoutMs: 60_000 });
  });
});
