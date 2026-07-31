import { describe, it, expect } from "vitest";
import {
  siguienteTipo,
  esReunionVentas,
  reunionesDeOportunidad,
  embudoVentas,
  casosFuturo,
  casosPerdidos,
} from "./reuniones-ventas";

describe("siguienteTipo", () => {
  it("discovery → propuesta → seguimiento → seguimiento", () => {
    expect(siguienteTipo("discovery")).toBe("propuesta");
    expect(siguienteTipo("propuesta")).toBe("seguimiento");
    expect(siguienteTipo("seguimiento")).toBe("seguimiento");
  });
  it("sin tipo conocido, propone seguimiento", () => {
    expect(siguienteTipo(undefined)).toBe("seguimiento");
  });
});

describe("esReunionVentas", () => {
  it("exige vínculo a oportunidad y tipo válido", () => {
    expect(esReunionVentas({ contractId: "c1", tipo: "discovery" })).toBe(true);
    expect(esReunionVentas({ contractId: "c1" })).toBe(false);
    expect(esReunionVentas({ tipo: "discovery" })).toBe(false);
    expect(esReunionVentas({ contractId: "c1", tipo: "asado" })).toBe(false);
  });
});

describe("reunionesDeOportunidad", () => {
  it("filtra por oportunidad y ordena por fecha", () => {
    const meetings = [
      { id: "m2", contractId: "c1", date: "2026-08-10" },
      { id: "m1", contractId: "c1", date: "2026-08-01" },
      { id: "x", contractId: "c9", date: "2026-08-05" },
      { id: "libre", date: "2026-08-02" },
    ];
    expect(reunionesDeOportunidad(meetings, "c1").map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("embudoVentas", () => {
  it("cuenta cada caso en su columna", () => {
    const contracts = [
      { status: "borrador" }, // enReuniones (sin etapa = prospecto)
      { status: "borrador", pipelineStage: "contactado" }, // enReuniones
      { status: "borrador", pipelineStage: "negociacion" }, // propuestaEnviada
      { status: "borrador", pipelineStage: "propuesta", futuroFecha: "2026-09-01" }, // aFuturo gana a la etapa
      { status: "activo" }, // ganado
      { status: "perdido" }, // perdido
      { status: "cancelado", signedAt: "2026-01-10" }, // ganado (firmó y luego cortó)
    ];
    expect(embudoVentas(contracts)).toEqual({ enReuniones: 2, propuestaEnviada: 1, aFuturo: 1, ganados: 2, perdidos: 1 });
  });
});

describe("casosFuturo", () => {
  it("solo borradores con fecha, ordenados por fecha", () => {
    const list = casosFuturo([
      { id: "b", status: "borrador", futuroFecha: "2026-10-01", futuroMotivo: "fondos", client: "B" },
      { id: "a", status: "borrador", futuroFecha: "2026-09-01", futuroMotivo: "inexistente", client: "A" },
      { id: "c", status: "activo", futuroFecha: "2026-08-01" },
      { id: "d", status: "borrador" },
    ]);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list[0].futuroMotivo).toBe(""); // motivo desconocido no se inventa
    expect(list[1].futuroMotivo).toBe("fondos");
  });
});

describe("casosPerdidos", () => {
  it("historial del más reciente al más antiguo, con motivo saneado", () => {
    const list = casosPerdidos([
      { id: "p1", status: "perdido", motivoPerdida: "precio", updatedAt: 100 },
      { id: "p2", status: "perdido", updatedAt: 300 },
      { id: "g", status: "activo", updatedAt: 200 },
    ]);
    expect(list.map((c) => c.id)).toEqual(["p2", "p1"]);
    expect(list[0].motivo).toBe("sin_indicar");
    expect(list[1].motivo).toBe("precio");
  });
});
