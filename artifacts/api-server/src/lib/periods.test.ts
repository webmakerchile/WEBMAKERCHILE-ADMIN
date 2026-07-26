import { describe, it, expect } from "vitest";
import { currentKeys, isPastKey, isPeriod, periodKey } from "./periods";

/** Un instante concreto: martes 28 de julio de 2026, 15:00 en Chile (UTC-4). */
const MARTES = new Date("2026-07-28T19:00:00Z");

describe("ventanas de tiempo de las metas", () => {
  it("la clave diaria es el día local, no el UTC", () => {
    expect(periodKey("diaria", MARTES)).toBe("2026-07-28");
    // 21:00 en Chile del día 28 sigue siendo el 28, aunque en UTC ya sea 29.
    expect(periodKey("diaria", new Date("2026-07-29T01:00:00Z"))).toBe("2026-07-28");
  });

  it("la clave mensual agrupa por mes local", () => {
    expect(periodKey("mensual", MARTES)).toBe("2026-07");
    expect(periodKey("mensual", new Date("2026-08-01T03:00:00Z"))).toBe("2026-07");
  });

  it("la semana usa la numeración ISO y empieza el lunes", () => {
    const semana = periodKey("semanal", MARTES);
    expect(semana).toMatch(/^2026-W\d{2}$/);
    // Lunes y domingo de la misma semana caen en la misma clave.
    const lunes = periodKey("semanal", new Date("2026-07-27T14:00:00Z"));
    const domingo = periodKey("semanal", new Date("2026-08-02T14:00:00Z"));
    expect(lunes).toBe(semana);
    expect(domingo).toBe(semana);
  });

  it("el lunes siguiente ya es otra semana", () => {
    const estaSemana = periodKey("semanal", MARTES);
    const proxima = periodKey("semanal", new Date("2026-08-03T14:00:00Z"));
    expect(proxima).not.toBe(estaSemana);
  });

  it("las tres ventanas vigentes se calculan juntas", () => {
    const keys = currentKeys(MARTES);
    expect(keys.diaria).toBe("2026-07-28");
    expect(keys.mensual).toBe("2026-07");
    expect(keys.semanal).toBe(periodKey("semanal", MARTES));
  });

  it("reconoce las ventanas que ya pasaron", () => {
    expect(isPastKey("diaria", "2026-07-27", MARTES)).toBe(true);
    expect(isPastKey("diaria", "2026-07-28", MARTES)).toBe(false);
    expect(isPastKey("mensual", "2026-06", MARTES)).toBe(true);
    expect(isPastKey("mensual", "2026-08", MARTES)).toBe(false);
  });

  it("compara semanas por año y número, no como texto", () => {
    // "2025-W52" es texto mayor que "2026-W05" en varios ordenamientos ingenuos.
    expect(isPastKey("semanal", "2025-W52", MARTES)).toBe(true);
    const actual = periodKey("semanal", MARTES);
    expect(isPastKey("semanal", actual, MARTES)).toBe(false);
    const numero = Number(actual.split("-W")[1]);
    expect(isPastKey("semanal", `2026-W${String(numero + 1).padStart(2, "0")}`, MARTES)).toBe(false);
  });

  it("solo acepta los tres períodos del negocio", () => {
    expect(isPeriod("diaria")).toBe(true);
    expect(isPeriod("semanal")).toBe(true);
    expect(isPeriod("mensual")).toBe(true);
    expect(isPeriod("trimestral")).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
  });
});
