// El desglose tiene que explicar el número grande, no contar otra historia.
//
// La propiedad que se comprueba aquí una y otra vez es que los tramos CUBREN
// todo el rango: trabajado + pausado + fuera = de la entrada a la salida. Si
// eso deja de cumplirse, el desglose muestra un día con horas que no están en
// ningún tramo, que es exactamente la duda que venía a resolver.

import { describe, it, expect } from "vitest";
import {
  desglosarJornada,
  minutosNetosDelDesglose,
  MAX_SESION_MS,
  type PausaDesglosable,
  type SesionDesglosable,
} from "./jornada-desglose.js";
import { minutosDePausas, minutosNetos } from "./jornada-pausas.js";

const T0 = new Date("2026-07-28T12:00:00.000Z").getTime();
const h = (horas: number) => new Date(T0 + horas * 3600_000);
const AHORA = h(24);

const sesion = (id: number, desde: number, hasta: number | null): SesionDesglosable =>
  ({ id, checkIn: h(desde), checkOut: hasta === null ? null : h(hasta) });

const pausa = (desde: number, hasta: number | null, reason = ""): PausaDesglosable =>
  ({ startedAt: h(desde), endedAt: hasta === null ? null : h(hasta), reason });

/** La suma de los tramos tiene que ser el rango completo. */
function cuadra(d: ReturnType<typeof desglosarJornada>) {
  return Math.abs(d.trabajado + d.pausado + d.fuera - d.abarcado) <= 1;
}

describe("los tramos cubren toda la jornada", () => {
  it("una sesión de corrido: todo es trabajo", () => {
    const d = desglosarJornada([sesion(1, 0, 8)], new Map(), AHORA);
    expect(d.trabajado).toBe(480);
    expect(d.pausado).toBe(0);
    expect(d.fuera).toBe(0);
    expect(d.abarcado).toBe(480);
    expect(d.tramos).toHaveLength(1);
    expect(cuadra(d)).toBe(true);
  });

  it("una pausa parte la sesión en trabajo · pausa · trabajo", () => {
    const d = desglosarJornada([sesion(1, 0, 8)], new Map([[1, [pausa(3, 4, "almuerzo")]]]), AHORA);
    expect(d.tramos.map((t) => t.tipo)).toEqual(["trabajo", "pausa", "trabajo"]);
    expect(d.trabajado).toBe(420);
    expect(d.pausado).toBe(60);
    expect(d.abarcado).toBe(480);
    expect(d.tramos[1]!.motivo).toBe("almuerzo");
    expect(cuadra(d)).toBe(true);
  });

  // El caso que motivó todo: el rango decía 14 h y el contador 6 h, y las 8 h
  // que faltaban no aparecían por ningún lado porque estaban ENTRE sesiones.
  it("el hueco entre dos sesiones aparece como tiempo fuera", () => {
    const d = desglosarJornada([sesion(1, 0, 4), sesion(2, 9, 13)], new Map(), AHORA);
    expect(d.tramos.map((t) => t.tipo)).toEqual(["trabajo", "fuera", "trabajo"]);
    expect(d.trabajado).toBe(480);
    expect(d.fuera).toBe(300);
    expect(d.abarcado).toBe(780);
    expect(cuadra(d)).toBe(true);
  });

  it("varias sesiones con pausas siguen cuadrando", () => {
    const d = desglosarJornada(
      [sesion(1, 0, 5), sesion(2, 7, 12)],
      new Map([[1, [pausa(2, 2.5)]], [2, [pausa(8, 9), pausa(10.5, 11)]]]),
      AHORA,
    );
    expect(cuadra(d)).toBe(true);
    expect(d.pausado).toBe(30 + 60 + 30);
  });

  it("da igual el orden en que lleguen las sesiones", () => {
    const ordenadas = desglosarJornada([sesion(1, 0, 4), sesion(2, 9, 13)], new Map(), AHORA);
    const revueltas = desglosarJornada([sesion(2, 9, 13), sesion(1, 0, 4)], new Map(), AHORA);
    expect(revueltas).toEqual(ordenadas);
  });

  it("sin sesiones no inventa nada", () => {
    const d = desglosarJornada([], new Map(), AHORA);
    expect(d).toEqual({
      tramos: [], trabajado: 0, pausado: 0, fuera: 0, abarcado: 0,
      entrada: null, salida: null, abierta: false,
    });
  });
});

describe("jornada en curso", () => {
  it("el último tramo queda sin cerrar y la salida es null", () => {
    const d = desglosarJornada([sesion(1, 0, null)], new Map(), h(6));
    expect(d.abierta).toBe(true);
    expect(d.salida).toBeNull();
    expect(d.tramos[d.tramos.length - 1]!.hasta).toBeNull();
    expect(d.trabajado).toBe(360);
  });

  it("una pausa abierta corre hasta ahora y el reloj no avanza", () => {
    const d = desglosarJornada([sesion(1, 0, null)], new Map([[1, [pausa(4, null, "trámite")]]]), h(6));
    expect(d.tramos.map((t) => t.tipo)).toEqual(["trabajo", "pausa"]);
    expect(d.trabajado).toBe(240);
    expect(d.pausado).toBe(120);
    expect(d.tramos[1]!.hasta).toBeNull();
    expect(cuadra(d)).toBe(true);
  });
});

describe("datos sucios", () => {
  it("dos pausas solapadas cuentan una sola vez", () => {
    // Puede pasar de verdad: la persona pausa y quien supervisa pausa también.
    const d = desglosarJornada([sesion(1, 0, 8)], new Map([[1, [pausa(2, 5), pausa(3, 6)]]]), AHORA);
    expect(d.pausado).toBe(240);
    expect(d.tramos.filter((t) => t.tipo === "pausa")).toHaveLength(1);
    expect(cuadra(d)).toBe(true);
  });

  it("una salida olvidada se corta a las 16 h y no crece para siempre", () => {
    const d = desglosarJornada([sesion(1, 0, null)], new Map(), h(40));
    expect(d.trabajado).toBe(MAX_SESION_MS / 60000);
    expect(d.abarcado).toBe(MAX_SESION_MS / 60000);
    expect(cuadra(d)).toBe(true);
  });

  it("sesiones solapadas no generan un hueco negativo", () => {
    const d = desglosarJornada([sesion(1, 0, 6), sesion(2, 4, 10)], new Map(), AHORA);
    expect(d.fuera).toBe(0);
    expect(d.tramos.every((t) => t.minutos >= 0)).toBe(true);
  });
});

describe("el desglose no contradice el total que ya se mostraba", () => {
  // Si el desglose dijera una cosa y el número grande otra, el desglose
  // dejaría de servir para explicarlo: serían dos versiones del mismo día.
  const casos: Array<[string, SesionDesglosable[], Map<number, PausaDesglosable[]>]> = [
    ["de corrido", [sesion(1, 0, 8)], new Map()],
    ["con pausa", [sesion(1, 0, 8)], new Map([[1, [pausa(3, 4)]]])],
    ["dos sesiones", [sesion(1, 0, 4), sesion(2, 9, 13)], new Map()],
    ["pausas solapadas", [sesion(1, 0, 8)], new Map([[1, [pausa(2, 5), pausa(3, 6)]]])],
    ["abierta con pausa", [sesion(1, 0, null)], new Map([[1, [pausa(4, null)]]])],
  ];

  for (const [nombre, sesiones, pausas] of casos) {
    it(`${nombre}: trabajado = suma de netos por sesión`, () => {
      const ahora = h(14);
      const d = desglosarJornada(sesiones, pausas, ahora);
      const referencia = sesiones.reduce((acc, s) => {
        const fin = s.checkOut ? new Date(s.checkOut).getTime() : ahora.getTime();
        const brutos = Math.round((Math.min(fin, new Date(s.checkIn).getTime() + MAX_SESION_MS) - new Date(s.checkIn).getTime()) / 60000);
        return acc + minutosNetos(brutos, minutosDePausas(s, pausas.get(s.id) ?? [], ahora));
      }, 0);
      expect(d.trabajado).toBe(referencia);
      expect(minutosNetosDelDesglose(sesiones, pausas, ahora)).toBe(referencia);
    });
  }
});
