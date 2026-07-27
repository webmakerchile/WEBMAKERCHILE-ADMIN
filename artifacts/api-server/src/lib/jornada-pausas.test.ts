import { describe, it, expect } from "vitest";
import { minutosDePausas, minutosNetos, formatearDuracion } from "./jornada-pausas.js";

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 27, h, m, 0));
const sesion = (desde: number, hasta: number | null) => ({
  checkIn: T(desde),
  checkOut: hasta === null ? null : T(hasta),
});

describe("minutosDePausas", () => {
  it("suma pausas cerradas", () => {
    const p = [
      { startedAt: T(10, 0), endedAt: T(10, 15) },
      { startedAt: T(13, 0), endedAt: T(14, 0) },
    ];
    expect(minutosDePausas(sesion(9, 18), p)).toBe(75);
  });

  it("una pausa abierta cuenta hasta ahora: el contador se detiene en vivo", () => {
    const p = [{ startedAt: T(10, 0), endedAt: null }];
    expect(minutosDePausas(sesion(9, null), p, T(10, 20))).toBe(20);
  });

  it("no descuenta dos veces cuando dos pausas se solapan", () => {
    // Caso real: la persona pausa y RRHH pausa también sin saberlo.
    const p = [
      { startedAt: T(10, 0), endedAt: T(10, 30) },
      { startedAt: T(10, 10), endedAt: T(10, 40) },
    ];
    expect(minutosDePausas(sesion(9, 18), p)).toBe(40);
  });

  it("fusiona pausas contiguas sin inflar el total", () => {
    const p = [
      { startedAt: T(10, 0), endedAt: T(10, 30) },
      { startedAt: T(10, 30), endedAt: T(11, 0) },
    ];
    expect(minutosDePausas(sesion(9, 18), p)).toBe(60);
  });

  it("recorta la pausa que se sale de la sesión", () => {
    // Una pausa abierta que sobrevive al check-out no puede descontar tiempo
    // posterior al cierre de la jornada.
    const p = [{ startedAt: T(17, 30), endedAt: T(19, 0) }];
    expect(minutosDePausas(sesion(9, 18), p)).toBe(30);
  });

  it("ignora pausas anteriores a la entrada", () => {
    const p = [{ startedAt: T(7, 0), endedAt: T(8, 0) }];
    expect(minutosDePausas(sesion(9, 18), p)).toBe(0);
  });

  it("aguanta listas vacías y sesiones de duración cero", () => {
    expect(minutosDePausas(sesion(9, 18), [])).toBe(0);
    expect(minutosDePausas(sesion(9, 9), [{ startedAt: T(9), endedAt: T(9, 30) }])).toBe(0);
  });
});

describe("minutosNetos", () => {
  it("descuenta y nunca baja de cero", () => {
    expect(minutosNetos(480, 60)).toBe(420);
    expect(minutosNetos(30, 90)).toBe(0);
  });
});

describe("formatearDuracion", () => {
  it("formatea horas y minutos", () => {
    expect(formatearDuracion(125)).toBe("2h 05m");
    expect(formatearDuracion(45)).toBe("45m");
    expect(formatearDuracion(0)).toBe("0m");
    expect(formatearDuracion(-5)).toBe("0m");
  });
});
