import { describe, expect, it } from "vitest";
import { GOALS_YELLOW_THRESHOLD, areaSemaforo, goalsCompliance } from "./torre";

describe("goalsCompliance", () => {
  it("sin metas devuelve pct null", () => {
    expect(goalsCompliance([])).toEqual({ pct: null, total: 0, done: 0 });
  });

  it("con target pondera avance sobre total", () => {
    const r = goalsCompliance([
      { target: 10, progress: 5, status: "pendiente" },
      { target: 10, progress: 10, status: "cumplida" },
    ]);
    expect(r.pct).toBe(75);
    expect(r.total).toBe(2);
    expect(r.done).toBe(1);
  });

  it("sin target cuenta cumplidas / total", () => {
    const r = goalsCompliance([
      { target: null, progress: 0, status: "cumplida" },
      { target: null, progress: 0, status: "pendiente" },
    ]);
    expect(r.pct).toBe(50);
  });

  it("el avance no puede superar el target (no hay >100%)", () => {
    const r = goalsCompliance([{ target: 10, progress: 25, status: "cumplida" }]);
    expect(r.pct).toBe(100);
  });

  it("mezcla metas con y sin target", () => {
    const r = goalsCompliance([
      { target: 4, progress: 4, status: "cumplida" },
      { target: null, progress: 0, status: "pendiente" },
    ]);
    // 4/4 + 0/1 => 4/5 = 80%
    expect(r.pct).toBe(80);
  });
});

describe("areaSemaforo", () => {
  it("rojo si hay SLA vencidos", () => {
    expect(areaSemaforo(1, 0, 100)).toBe("red");
  });
  it("rojo si hay gente saturada", () => {
    expect(areaSemaforo(0, 2, 100)).toBe("red");
  });
  it("amarillo si las metas van bajo el umbral", () => {
    expect(areaSemaforo(0, 0, GOALS_YELLOW_THRESHOLD - 1)).toBe("yellow");
  });
  it("verde sin problemas ni metas (pct null)", () => {
    expect(areaSemaforo(0, 0, null)).toBe("green");
  });
  it("verde con metas al día", () => {
    expect(areaSemaforo(0, 0, GOALS_YELLOW_THRESHOLD)).toBe("green");
  });
});
