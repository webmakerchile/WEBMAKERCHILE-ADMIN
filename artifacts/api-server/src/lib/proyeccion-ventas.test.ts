// Una proyección de ventas se usa para decidir contrataciones y gastos. Si
// está mal, no se nota hasta que el mes cierra por debajo de lo previsto — así
// que lo que se comprueba aquí es la aritmética contra casos con resultado
// conocido, y sobre todo los bordes donde una proyección mentiría con
// seguridad: series de un punto, meses sin ventas y divisiones por cero.

import { describe, it, expect } from "vitest";
import {
  ajustarRecta,
  proyectarVentas,
  bondadDelAjuste,
  tasaDeVariacion,
  variacionUltimoMes,
  completarMeses,
  mesSiguiente,
} from "./proyeccion-ventas.js";

const serie = (...montos: number[]) =>
  montos.map((monto, i) => ({ mes: `2026-${String(i + 1).padStart(2, "0")}`, monto }));

describe("ajuste por mínimos cuadrados", () => {
  it("una recta perfecta se recupera exacta", () => {
    const r = ajustarRecta(serie(100, 200, 300, 400))!;
    expect(r.pendiente).toBeCloseTo(100, 6);
    expect(r.interseccion).toBeCloseTo(100, 6);
  });

  it("detecta una tendencia a la baja", () => {
    expect(ajustarRecta(serie(400, 300, 200))!.pendiente).toBeCloseTo(-100, 6);
  });

  it("una serie plana tiene pendiente cero", () => {
    expect(ajustarRecta(serie(500, 500, 500))!.pendiente).toBeCloseTo(0, 6);
  });

  // Con un punto hay infinitas rectas: devolver una sería inventarse una
  // tendencia a partir de un mes suelto.
  it("con menos de dos meses no hay tendencia", () => {
    expect(ajustarRecta(serie(100))).toBeNull();
    expect(ajustarRecta([])).toBeNull();
  });

  it("aguanta montos corruptos sin devolver NaN", () => {
    const r = ajustarRecta([
      { mes: "2026-01", monto: Number.NaN },
      { mes: "2026-02", monto: 200 },
    ])!;
    expect(Number.isFinite(r.pendiente)).toBe(true);
    expect(Number.isFinite(r.interseccion)).toBe(true);
  });
});

describe("proyección", () => {
  it("continúa la recta en los meses siguientes", () => {
    const p = proyectarVentas(serie(100, 200, 300), 2);
    expect(p).toEqual([
      { mes: "2026-04", monto: 400 },
      { mes: "2026-05", monto: 500 },
    ]);
  });

  it("cruza bien el cambio de año", () => {
    const p = proyectarVentas([
      { mes: "2026-11", monto: 100 },
      { mes: "2026-12", monto: 200 },
    ], 2);
    expect(p.map((x) => x.mes)).toEqual(["2027-01", "2027-02"]);
  });

  // Una recta muy a la baja acaba dando ventas negativas, que no significan
  // nada y en un gráfico se leen como un error del sistema.
  it("nunca proyecta ventas negativas", () => {
    const p = proyectarVentas(serie(1000, 500, 100), 6);
    expect(p.every((x) => x.monto >= 0)).toBe(true);
  });

  it("sin serie no proyecta nada, en vez de proyectar ceros", () => {
    expect(proyectarVentas([], 3)).toEqual([]);
    expect(proyectarVentas(serie(100), 3)).toEqual([]);
  });
});

describe("bondad del ajuste", () => {
  it("una recta perfecta da 1", () => {
    expect(bondadDelAjuste(serie(100, 200, 300))).toBeCloseTo(1, 6);
  });

  // Es el aviso de "esta raya no significa nada": sin él se toman decisiones
  // sobre ruido creyendo que hay una tendencia.
  it("con datos dispersos baja mucho", () => {
    const r = bondadDelAjuste(serie(100, 900, 150, 800, 120))!;
    expect(r).toBeLessThan(0.3);
  });

  it("siempre queda entre 0 y 1", () => {
    for (const s of [serie(1, 1000, 2), serie(500, 500), serie(0, 0, 0)]) {
      const r = bondadDelAjuste(s)!;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe("tasa de variación", () => {
  it("calcula la proporción respecto al mes anterior", () => {
    expect(tasaDeVariacion(1000, 1250).tasa).toBeCloseTo(0.25, 6);
    expect(tasaDeVariacion(1000, 750).tasa).toBeCloseTo(-0.25, 6);
  });

  // Dividir por cero da Infinity, y un "+∞ %" en el panel no informa de nada.
  it("desde cero no hay porcentaje, pero sí diferencia", () => {
    const v = tasaDeVariacion(0, 500);
    expect(v.tasa).toBeNull();
    expect(v.diferencia).toBe(500);
  });

  it("toma los dos últimos meses de la serie", () => {
    const v = variacionUltimoMes(serie(100, 200, 400))!;
    expect(v.anterior).toBe(200);
    expect(v.actual).toBe(400);
    expect(v.tasa).toBeCloseTo(1, 6);
  });

  it("con un solo mes no hay con qué comparar", () => {
    expect(variacionUltimoMes(serie(100))).toBeNull();
  });
});

describe("meses sin ventas", () => {
  // Sin rellenarlos, un mes sin cerrar nada no aparece y la recta se ajusta
  // como si no hubiera existido: la tendencia sale mejor de lo que fue.
  it("rellena con cero los huecos de la serie", () => {
    const r = completarMeses([
      { mes: "2026-01", monto: 100 },
      { mes: "2026-04", monto: 400 },
    ]);
    expect(r.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(r.map((p) => p.monto)).toEqual([100, 0, 0, 400]);
  });

  it("ordena aunque lleguen desordenados", () => {
    const r = completarMeses([
      { mes: "2026-03", monto: 300 },
      { mes: "2026-01", monto: 100 },
    ]);
    expect(r[0]!.mes).toBe("2026-01");
  });

  it("rellenar cambia la tendencia, que es justo el motivo", () => {
    // Enero 100 y abril 400, con febrero y marzo a cero. Sin rellenar parece
    // que se sube 300 por mes; contando los meses vacíos, 90. Es la diferencia
    // entre "vamos disparados" y la realidad.
    const conHueco = [{ mes: "2026-01", monto: 100 }, { mes: "2026-04", monto: 400 }];
    expect(ajustarRecta(conHueco)!.pendiente).toBeCloseTo(300, 6);
    expect(ajustarRecta(completarMeses(conHueco))!.pendiente).toBeCloseTo(90, 6);
  });

  it("no se cuelga con una fecha corrupta", () => {
    expect(() => completarMeses([{ mes: "basura", monto: 1 }, { mes: "2026-01", monto: 2 }])).not.toThrow();
  });

  it("mesSiguiente cruza el año", () => {
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesSiguiente("2026-01")).toBe("2026-02");
  });
});
