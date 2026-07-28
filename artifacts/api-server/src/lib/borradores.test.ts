import { describe, it, expect } from "vitest";
import {
  planPurga,
  diasRestantes,
  avisoCaducidad,
  DIAS_RETENCION,
  MIN_CONSERVADOS,
} from "./borradores";

const AHORA = new Date("2026-07-28T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

/** n borradores, el índice 0 es el más nuevo (1 día de separación). */
function filas(n: number, desdeDias = 0) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, createdAt: hace(desdeDias + i) }));
}

describe("planPurga", () => {
  it("no toca nada cuando todo es reciente", () => {
    expect(planPurga(filas(10), AHORA).ids).toEqual([]);
  });

  it("borra lo que pasó de los días de retención", () => {
    const f = [
      { id: 1, createdAt: hace(1) },
      { id: 2, createdAt: hace(2) },
      { id: 3, createdAt: hace(3) },
      { id: 4, createdAt: hace(4) },
      { id: 5, createdAt: hace(5) },
      { id: 6, createdAt: hace(DIAS_RETENCION + 1) },
      { id: 7, createdAt: hace(90) },
    ];
    const plan = planPurga(f, AHORA);
    expect(plan.ids.sort()).toEqual([6, 7]);
    expect(plan.motivos[6]).toBe("caducado");
  });

  // Volver de vacaciones y encontrar la lista vacía no se lee como "se
  // limpiaron solos", se lee como "se rompió".
  it("nunca deja la lista vacía por antiguo que sea todo", () => {
    const plan = planPurga(filas(20, 400), AHORA);
    expect(plan.ids).toHaveLength(20 - MIN_CONSERVADOS);
    expect(plan.ids).not.toContain(1); // el más nuevo sobrevive
  });

  it("respeta el suelo exacto de conservados", () => {
    const plan = planPurga(filas(MIN_CONSERVADOS, 400), AHORA);
    expect(plan.ids).toEqual([]);
  });

  it("recorta por el tope aunque nada haya caducado", () => {
    const plan = planPurga(filas(12), AHORA, { maxBorradores: 8 });
    expect(plan.ids.sort((a, b) => a - b)).toEqual([9, 10, 11, 12]);
    expect(plan.motivos[9]).toBe("excede_tope");
  });

  // Si el plan dependiera del orden de la consulta, una cláusula cambiada en
  // el futuro borraría lo recién creado en vez de lo viejo.
  it("da el mismo resultado venga como venga ordenada la lista", () => {
    const f = filas(20, 20);
    const alReves = [...f].reverse();
    const mezclada = [...f].sort((a, b) => (a.id * 7) % 11 - (b.id * 7) % 11);
    const esperado = planPurga(f, AHORA).ids.sort((a, b) => a - b);
    expect(planPurga(alReves, AHORA).ids.sort((a, b) => a - b)).toEqual(esperado);
    expect(planPurga(mezclada, AHORA).ids.sort((a, b) => a - b)).toEqual(esperado);
  });

  it("aguanta fechas ilegibles sin borrar de más", () => {
    const f = [
      { id: 1, createdAt: hace(1) }, { id: 2, createdAt: hace(2) },
      { id: 3, createdAt: hace(3) }, { id: 4, createdAt: hace(4) },
      { id: 5, createdAt: hace(5) },
      { id: 6, createdAt: "no-es-fecha" },
    ];
    const plan = planPurga(f, AHORA);
    // La fecha ilegible cuenta como epoch: caduca, pero no arrastra a nadie.
    expect(plan.ids).toEqual([6]);
  });

  it("con la lista vacía no hace nada", () => {
    expect(planPurga([], AHORA).ids).toEqual([]);
  });
});

describe("diasRestantes", () => {
  it("cuenta hacia atrás desde la retención", () => {
    expect(diasRestantes(hace(0), AHORA)).toBe(DIAS_RETENCION);
    expect(diasRestantes(hace(DIAS_RETENCION - 1), AHORA)).toBe(1);
  });

  it("nunca baja de cero", () => {
    expect(diasRestantes(hace(500), AHORA)).toBe(0);
  });
});

describe("avisoCaducidad", () => {
  it("calla mientras queda tiempo de sobra", () => {
    expect(avisoCaducidad(hace(1), AHORA)).toBeNull();
  });

  it("avisa solo cuando queda poco", () => {
    expect(avisoCaducidad(hace(DIAS_RETENCION - 2), AHORA)).toBe("Se borra en 2 días");
    expect(avisoCaducidad(hace(DIAS_RETENCION - 1), AHORA)).toBe("Se borra mañana");
    expect(avisoCaducidad(hace(DIAS_RETENCION), AHORA)).toBe("Se borra hoy");
  });
});
