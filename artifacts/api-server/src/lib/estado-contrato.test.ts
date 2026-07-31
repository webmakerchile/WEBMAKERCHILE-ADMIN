// De esta clasificación sale la serie histórica y la proyección. Un error aquí
// no rompe nada: dibuja una tendencia convincente sobre meses que no ocurrieron.

import { describe, it, expect } from "vitest";
import {
  desenlaceDe,
  esVentaCerrada,
  estaFirmado,
  tasaDeConversion,
  motivoValido,
  perdidasPorMotivo,
} from "./estado-contrato";

const c = (status: string, signedAt = "") => ({ status, signedAt });

describe("desenlace de un contrato", () => {
  it("un borrador sigue en el embudo", () => {
    expect(desenlaceDe(c("borrador"))).toBe("embudo");
  });

  it("activo y vencido son ventas hechas", () => {
    // Vencido no es perdido: se vendió, se entregó y se le acabó la vigencia.
    expect(desenlaceDe(c("activo"))).toBe("ganado");
    expect(desenlaceDe(c("vencido"))).toBe("ganado");
  });

  it("el estado nuevo dice explícitamente que se perdió", () => {
    expect(desenlaceDe(c("perdido"))).toBe("perdido");
    expect(desenlaceDe(c("perdido", "2026-03-01"))).toBe("perdido");
  });

  // Es el caso de TODOS los contratos que ya existen: se guardaron cuando
  // "cancelado" significaba las dos cosas a la vez.
  it("un cancelado firmado fue una venta; sin firmar, una cotización perdida", () => {
    expect(desenlaceDe(c("cancelado", "2026-03-15"))).toBe("ganado");
    expect(desenlaceDe(c("cancelado"))).toBe("perdido");
    expect(desenlaceDe(c("cancelado", "   "))).toBe("perdido");
    expect(desenlaceDe(c("cancelado", "cuando firmen"))).toBe("perdido");
  });

  it("no distingue por mayúsculas ni espacios", () => {
    expect(desenlaceDe({ status: " ACTIVO " })).toBe("ganado");
  });

  // Contarlo como venta inflaría la historia con el primer estado que alguien
  // escriba mal, y nadie revisa una serie que "va bien".
  it("un estado desconocido no se cuenta como venta", () => {
    expect(desenlaceDe(c("en_revision"))).toBe("embudo");
    expect(desenlaceDe({})).toBe("embudo");
    expect(desenlaceDe({ status: null })).toBe("embudo");
  });

  it("esVentaCerrada es el atajo de ganado", () => {
    expect(esVentaCerrada(c("activo"))).toBe(true);
    expect(esVentaCerrada(c("perdido"))).toBe(false);
    expect(esVentaCerrada(c("borrador"))).toBe(false);
  });
});

describe("saber si llegó a firmarse", () => {
  it("solo una fecha cuenta como firma", () => {
    expect(estaFirmado({ signedAt: "2026-03-15" })).toBe(true);
    expect(estaFirmado({ signedAt: "2026-03-15T10:00:00Z" })).toBe(true);
    expect(estaFirmado({ signedAt: "" })).toBe(false);
    expect(estaFirmado({ signedAt: "sí" })).toBe(false);
    expect(estaFirmado({})).toBe(false);
  });
});

describe("tasa de conversión", () => {
  it("cuenta ganados sobre cerrados", () => {
    const r = tasaDeConversion([c("activo"), c("activo"), c("perdido"), c("vencido")]);
    expect(r).toEqual({ ganados: 3, perdidos: 1, tasa: 75 });
  });

  // Meter el embudo en el denominador hundiría la tasa el día 1 del mes y la
  // subiría sola al cerrarse, sin que nadie hubiera vendido mejor.
  it("lo que sigue abierto no entra en el denominador", () => {
    const r = tasaDeConversion([c("activo"), c("borrador"), c("borrador"), c("borrador")]);
    expect(r.tasa).toBe(100);
  });

  it("sin nada cerrado la tasa es null, no cero", () => {
    // Un 0% con cero datos se lee como "no vendemos nada".
    expect(tasaDeConversion([c("borrador")]).tasa).toBeNull();
    expect(tasaDeConversion([]).tasa).toBeNull();
  });

  it("los cancelados viejos caen del lado que les toca", () => {
    const r = tasaDeConversion([c("cancelado", "2026-01-10"), c("cancelado")]);
    expect(r).toEqual({ ganados: 1, perdidos: 1, tasa: 50 });
  });
});

describe("motivos de pérdida", () => {
  it("acepta los conocidos y descarta lo demás", () => {
    expect(motivoValido("precio")).toBe("precio");
    expect(motivoValido("SIN RESPUESTA")).toBe("sin_respuesta");
    expect(motivoValido("porque sí")).toBeNull();
    expect(motivoValido(null)).toBeNull();
  });

  it("agrupa de mayor a menor", () => {
    const salida = perdidasPorMotivo([
      { status: "perdido", motivoPerdida: "precio" },
      { status: "perdido", motivoPerdida: "precio" },
      { status: "perdido", motivoPerdida: "competencia" },
      { status: "activo" },
    ]);
    expect(salida).toEqual([
      { motivo: "precio", total: 2 },
      { motivo: "competencia", total: 1 },
    ]);
  });

  // "sin_indicar" tiene que verse: si se ocultara, un panel donde nadie rellena
  // el motivo parecería que no se pierde por nada.
  it("los que no indican motivo se ven como tales", () => {
    expect(perdidasPorMotivo([{ status: "perdido" }])).toEqual([{ motivo: "sin_indicar", total: 1 }]);
  });

  it("solo mira los perdidos", () => {
    expect(perdidasPorMotivo([{ status: "activo", motivoPerdida: "precio" }])).toEqual([]);
  });
});
