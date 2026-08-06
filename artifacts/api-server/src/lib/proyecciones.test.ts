// La proyección decide conversaciones de negocio: si la semana ISO avanza mal
// o un hueco se rellena distinto de como se documentó, el gráfico sale
// convincente y equivocado — por eso cada regla rara (años de 53 semanas,
// huecos que NO se rellenan en cumplimiento, techo del %) tiene su test.
import { describe, it, expect } from "vitest";
import {
  analizarSerie,
  completarPeriodos,
  semanaSiguiente,
  semanasDelAno,
  serieCobros,
  serieCumplimiento,
  serieHorasMensuales,
  serieProduccion,
  serieVentasCerradas,
} from "./proyecciones";
import { mesSiguiente } from "./proyeccion-ventas";

describe("semanasDelAno", () => {
  it("distingue años de 52 y 53 semanas por la regla ISO", () => {
    expect(semanasDelAno(2025)).toBe(52); // 1-ene miércoles, no bisiesto
    expect(semanasDelAno(2026)).toBe(53); // 1-ene jueves
    expect(semanasDelAno(2020)).toBe(53); // bisiesto que parte en miércoles
    expect(semanasDelAno(2024)).toBe(52); // bisiesto que parte en lunes
  });
});

describe("semanaSiguiente", () => {
  it("avanza dentro del año con cero a la izquierda", () => {
    expect(semanaSiguiente("2026-W09")).toBe("2026-W10");
    expect(semanaSiguiente("2026-W30")).toBe("2026-W31");
  });

  it("da la vuelta al año respetando cuántas semanas tiene", () => {
    expect(semanaSiguiente("2025-W52")).toBe("2026-W01"); // 2025 tiene 52
    expect(semanaSiguiente("2026-W52")).toBe("2026-W53"); // 2026 tiene 53
    expect(semanaSiguiente("2026-W53")).toBe("2027-W01");
  });

  it("devuelve la clave tal cual si no es una semana válida", () => {
    expect(semanaSiguiente("2026-13")).toBe("2026-13");
    expect(semanaSiguiente("basura")).toBe("basura");
  });
});

describe("completarPeriodos", () => {
  it("rellena huecos de meses con 0", () => {
    const serie = completarPeriodos(
      [
        { periodo: "2026-01", valor: 10 },
        { periodo: "2026-04", valor: 40 },
      ],
      mesSiguiente,
    );
    expect(serie).toEqual([
      { periodo: "2026-01", valor: 10 },
      { periodo: "2026-02", valor: 0 },
      { periodo: "2026-03", valor: 0 },
      { periodo: "2026-04", valor: 40 },
    ]);
  });

  it("rellena huecos de semanas cruzando el año", () => {
    const serie = completarPeriodos(
      [
        { periodo: "2025-W51", valor: 1 },
        { periodo: "2026-W02", valor: 2 },
      ],
      semanaSiguiente,
    );
    expect(serie.map((p) => p.periodo)).toEqual(["2025-W51", "2025-W52", "2026-W01", "2026-W02"]);
  });

  it("con clave corrupta corta en vez de ciclar", () => {
    const serie = completarPeriodos(
      [
        { periodo: "no-valido", valor: 1 },
        { periodo: "zz-final", valor: 2 },
      ],
      semanaSiguiente, // no reconoce la clave: siguiente() no avanza
    );
    expect(serie).toEqual([{ periodo: "no-valido", valor: 1 }]);
  });

  it("serie vacía queda vacía", () => {
    expect(completarPeriodos([], mesSiguiente)).toEqual([]);
  });
});

describe("analizarSerie", () => {
  const lineal = [
    { periodo: "2026-01", valor: 100 },
    { periodo: "2026-02", valor: 200 },
    { periodo: "2026-03", valor: 300 },
  ];

  it("sobre una recta perfecta: pendiente exacta, R²=1 y proyección que continúa", () => {
    const a = analizarSerie(lineal, 2, mesSiguiente);
    expect(a.pendiente).toBe(100);
    expect(a.r2).toBe(1);
    expect(a.ajuste).toEqual([
      { periodo: "2026-01", valor: 100 },
      { periodo: "2026-02", valor: 200 },
      { periodo: "2026-03", valor: 300 },
    ]);
    expect(a.proyeccion).toEqual([
      { periodo: "2026-04", valor: 400 },
      { periodo: "2026-05", valor: 500 },
    ]);
    expect(a.variacion?.diferencia).toBe(100);
  });

  it("con menos de 2 puntos no inventa tendencia", () => {
    const a = analizarSerie([{ periodo: "2026-01", valor: 5 }], 3, mesSiguiente);
    expect(a.pendiente).toBeNull();
    expect(a.r2).toBeNull();
    expect(a.proyeccion).toEqual([]);
    expect(a.historico).toHaveLength(1);
  });

  it("nunca proyecta negativo", () => {
    const bajando = [
      { periodo: "2026-01", valor: 100 },
      { periodo: "2026-02", valor: 10 },
    ];
    const a = analizarSerie(bajando, 3, mesSiguiente);
    for (const p of a.proyeccion) expect(p.valor).toBeGreaterThanOrEqual(0);
  });

  it("respeta el techo (porcentajes no pasan de 100)", () => {
    const subiendo = [
      { periodo: "2026-W01", valor: 80 },
      { periodo: "2026-W02", valor: 95 },
    ];
    const a = analizarSerie(subiendo, 3, semanaSiguiente, { tope: 100, decimales: 1 });
    expect(a.proyeccion.map((p) => p.periodo)).toEqual(["2026-W03", "2026-W04", "2026-W05"]);
    for (const p of a.proyeccion) expect(p.valor).toBeLessThanOrEqual(100);
  });

  it("redondea según los decimales pedidos", () => {
    const serie = [
      { periodo: "2026-01", valor: 10.04 },
      { periodo: "2026-02", valor: 20.06 },
    ];
    const conDecimal = analizarSerie(serie, 1, mesSiguiente, { decimales: 1 });
    expect(conDecimal.historico).toEqual([
      { periodo: "2026-01", valor: 10 },
      { periodo: "2026-02", valor: 20.1 },
    ]);
    const sinDecimal = analizarSerie(serie, 1, mesSiguiente);
    expect(sinDecimal.historico[1]!.valor).toBe(20);
  });
});

describe("serieVentasCerradas", () => {
  it("suma solo contratos ganados, por mes de emisión, y rellena huecos", () => {
    const contratos = [
      { status: "activo", issuedAt: "2026-01-15", doc: { modules: [{ price: 100 }] } },
      { status: "borrador", issuedAt: "2026-01-20", doc: { modules: [{ price: 999 }] } }, // embudo: fuera
      { status: "perdido", issuedAt: "2026-02-01", doc: { modules: [{ price: 500 }] } }, // perdido: fuera
      { status: "vencido", createdAt: "2026-03-02", doc: { modules: [{ price: 50 }] } }, // sin issuedAt: usa createdAt
    ];
    expect(serieVentasCerradas(contratos)).toEqual([
      { periodo: "2026-01", valor: 100 },
      { periodo: "2026-02", valor: 0 },
      { periodo: "2026-03", valor: 50 },
    ]);
  });

  it("ignora contratos sin fecha utilizable", () => {
    expect(serieVentasCerradas([{ status: "activo", doc: { modules: [{ price: 10 }] } }])).toEqual([]);
  });
});

describe("serieCobros", () => {
  it("agrupa abonos por mes de la fecha y descarta fechas rotas", () => {
    const pagos = [
      { fecha: "2026-01-10", monto: 100 },
      { fecha: "2026-01-25", monto: 50 },
      { fecha: "2026-03-01", monto: 30 },
      { fecha: "sin-fecha", monto: 999 },
    ];
    expect(serieCobros(pagos)).toEqual([
      { periodo: "2026-01", valor: 150 },
      { periodo: "2026-02", valor: 0 },
      { periodo: "2026-03", valor: 30 },
    ]);
  });
});

describe("serieHorasMensuales", () => {
  const dia = (d: string, h0: number, h1: number, userId = 1) => ({
    userId,
    workDate: d,
    checkIn: new Date(`${d}T${String(h0).padStart(2, "0")}:00:00Z`),
    checkOut: new Date(`${d}T${String(h1).padStart(2, "0")}:00:00Z`),
  });

  it("sin proyecto suma todas las horas del equipo por mes", () => {
    const serie = serieHorasMensuales(
      [dia("2026-01-05", 9, 13, 1), dia("2026-01-06", 9, 11, 2), dia("2026-02-03", 9, 10, 1)],
      null,
    );
    expect(serie).toEqual([
      { periodo: "2026-01", valor: 6 },
      { periodo: "2026-02", valor: 1 },
    ]);
  });

  it("con proyecto reparte por % de dedicación y excluye a los no asignados", () => {
    const serie = serieHorasMensuales(
      [dia("2026-01-05", 9, 17, 1), dia("2026-01-05", 9, 17, 2)],
      [{ userId: 1, allocationPct: 50 }], // el 2 no está asignado
    );
    expect(serie).toEqual([{ periodo: "2026-01", valor: 4 }]);
  });

  it("una sesión abierta cuenta hasta 'ahora'", () => {
    const ahora = new Date("2026-01-05T12:00:00Z");
    const serie = serieHorasMensuales(
      [{ userId: 1, workDate: "2026-01-05", checkIn: new Date("2026-01-05T09:00:00Z"), checkOut: null }],
      null,
      ahora,
    );
    expect(serie).toEqual([{ periodo: "2026-01", valor: 3 }]);
  });

  it("descarta workDate corrupto", () => {
    expect(serieHorasMensuales([dia("no-fecha", 9, 10)], null)).toEqual([]);
  });
});

describe("serieCumplimiento", () => {
  it("agrega a todo el equipo por semana y calcula el %", () => {
    const serie = serieCumplimiento([
      { weekKey: "2026-W30", total: 4, done: 2 },
      { weekKey: "2026-W30", total: 6, done: 4 }, // otra persona, misma semana
      { weekKey: "2026-W31", total: 5, done: 5 },
    ]);
    expect(serie).toEqual([
      { periodo: "2026-W30", valor: 60 },
      { periodo: "2026-W31", valor: 100 },
    ]);
  });

  it("omite semanas sin tareas comprometidas y NO rellena huecos", () => {
    const serie = serieCumplimiento([
      { weekKey: "2026-W28", total: 2, done: 1 },
      { weekKey: "2026-W29", total: 0, done: 0 }, // sin compromisos: fuera
      { weekKey: "2026-W31", total: 4, done: 2 }, // hueco en W30: se queda hueco
    ]);
    expect(serie.map((p) => p.periodo)).toEqual(["2026-W28", "2026-W31"]);
  });

  it("descarta claves que no son semanas", () => {
    expect(serieCumplimiento([{ weekKey: "2026-07", total: 3, done: 1 }])).toEqual([]);
  });
});

describe("serieProduccion", () => {
  it("cuenta tareas completadas por mes y rellena huecos", () => {
    const serie = serieProduccion([
      { completedAt: "2026-01-15T18:00:00Z" },
      { completedAt: "2026-01-20T12:00:00Z" },
      { completedAt: "2026-03-02T15:00:00Z" },
    ]);
    expect(serie).toEqual([
      { periodo: "2026-01", valor: 2 },
      { periodo: "2026-02", valor: 0 },
      { periodo: "2026-03", valor: 1 },
    ]);
  });

  it("ignora tareas sin completar y fechas corruptas", () => {
    expect(serieProduccion([{ completedAt: null }, { completedAt: "no-es-fecha" }])).toEqual([]);
  });

  it("acepta Date y string ISO por igual", () => {
    const serie = serieProduccion([
      { completedAt: new Date("2026-04-10T15:00:00Z") },
      { completedAt: "2026-04-11T15:00:00Z" },
    ]);
    expect(serie).toEqual([{ periodo: "2026-04", valor: 2 }]);
  });

  it("bucketea por el día de Santiago, no el de UTC", () => {
    // 01:00 UTC del 1° de junio ya es 31 de mayo en Santiago (UTC-4 en pleno
    // invierno, sin ambigüedad de horario de verano): tiene que caer en mayo.
    const serie = serieProduccion([{ completedAt: "2026-06-01T01:00:00Z" }]);
    expect(serie).toEqual([{ periodo: "2026-05", valor: 1 }]);
  });
});
