// El cierre semanal: FOTO por persona primero, ARRASTRE de pendientes después.
// Lo que se defiende aquí: (1) la foto no se duplica aunque el cierre corra
// dos veces, (2) el arrastre corre SIEMPRE sobre toda semana vencida — así un
// proceso caído a mitad de camino se completa solo en el próximo tick — y
// (3) las tareas sin responsable no le anotan cumplimiento a nadie pero
// tampoco se pierden.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    selectDistinct: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "@workspace/db";
import {
  claveSemanaActual,
  agruparPorPersona,
  cerrarSemanasVencidas,
  checkCierreSemanal,
  __resetCierreSemanal,
} from "./sprint-semanal";

/** Cadena drizzle "acepta todo": cualquier método encadena, await resuelve filas. */
function cadena(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "values", "set", "returning", "onConflictDoNothing"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(ok, ko);
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

// Viernes 31 de julio de 2026, mediodía UTC (08:00 en Santiago).
const AHORA = new Date("2026-07-31T12:00:00Z");
const SEMANA_ACTUAL = claveSemanaActual(AHORA);
const SEMANA_PASADA = claveSemanaActual(new Date(AHORA.getTime() - 7 * 86_400_000));

beforeEach(() => {
  vi.mocked(db.selectDistinct).mockReset();
  vi.mocked(db.select).mockReset();
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.update).mockReset();
});

describe("claveSemanaActual", () => {
  it("devuelve la clave ISO de la casa (AAAA-Wnn)", () => {
    expect(SEMANA_ACTUAL).toMatch(/^\d{4}-W\d{2}$/);
    expect(SEMANA_PASADA).toMatch(/^\d{4}-W\d{2}$/);
    expect(SEMANA_PASADA < SEMANA_ACTUAL).toBe(true);
  });
});

describe("agruparPorPersona", () => {
  it("cuenta total, listas y arrastradas por persona; ignora las sin responsable", () => {
    const stats = agruparPorPersona([
      { assigneeId: 1, stage: "done" },
      { assigneeId: 1, stage: "doing" },
      { assigneeId: 1, stage: "sprint" },
      { assigneeId: 2, stage: "done" },
      { assigneeId: null, stage: "doing" }, // sin responsable: no puntúa
    ]);
    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.userId === 1)).toEqual({ userId: 1, total: 3, done: 1, carried: 2 });
    expect(stats.find((s) => s.userId === 2)).toEqual({ userId: 2, total: 1, done: 1, carried: 0 });
  });

  it("sin filas → sin estadística", () => {
    expect(agruparPorPersona([])).toEqual([]);
  });
});

describe("cerrarSemanasVencidas", () => {
  it("semana vencida sin foto: fotografía y arrastra las pendientes", async () => {
    vi.mocked(db.selectDistinct)
      .mockReturnValueOnce(cadena([{ semana: SEMANA_PASADA }, { semana: SEMANA_ACTUAL }]) as never)
      .mockReturnValueOnce(cadena([]) as never); // ninguna foto previa
    vi.mocked(db.select).mockReturnValueOnce(cadena([
      { assigneeId: 1, stage: "done" },
      { assigneeId: 1, stage: "doing" },
      { assigneeId: null, stage: "doing" },
    ]) as never);
    const insertChain = cadena([]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    vi.mocked(db.update).mockReturnValue(cadena([{ id: 10 }, { id: 11 }]) as never);

    const r = await cerrarSemanasVencidas(AHORA);

    expect(r).toEqual({ semanasCerradas: 1, tareasArrastradas: 2 });
    // La foto lleva la semana y la cuenta por persona (carried = pendientes).
    expect(insertChain["values"]).toHaveBeenCalledWith([
      { weekKey: SEMANA_PASADA, userId: 1, total: 2, done: 1, carried: 1 },
    ]);
    expect(insertChain["onConflictDoNothing"]).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("semana ya fotografiada: NO duplica la foto pero igual arrastra (cierre interrumpido)", async () => {
    vi.mocked(db.selectDistinct)
      .mockReturnValueOnce(cadena([{ semana: SEMANA_PASADA }]) as never)
      .mockReturnValueOnce(cadena([{ semana: SEMANA_PASADA }]) as never); // foto ya existe
    vi.mocked(db.update).mockReturnValue(cadena([{ id: 7 }]) as never);

    const r = await cerrarSemanasVencidas(AHORA);

    expect(r).toEqual({ semanasCerradas: 0, tareasArrastradas: 1 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("solo la semana en curso a la vista → no toca nada", async () => {
    vi.mocked(db.selectDistinct).mockReturnValueOnce(
      cadena([{ semana: SEMANA_ACTUAL }]) as never,
    );

    const r = await cerrarSemanasVencidas(AHORA);

    expect(r).toEqual({ semanasCerradas: 0, tareasArrastradas: 0 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("checkCierreSemanal", () => {
  it("se auto-limita: dos llamadas seguidas revisan una sola vez", async () => {
    __resetCierreSemanal();
    vi.mocked(db.selectDistinct).mockReturnValue(cadena([]) as never);

    await checkCierreSemanal();
    await checkCierreSemanal();

    expect(db.selectDistinct).toHaveBeenCalledTimes(1);
    __resetCierreSemanal();
  });
});
