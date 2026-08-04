import { describe, expect, it } from "vitest";
import { perteneceABandeja } from "./tickets";
import type { TicketArea } from "@workspace/roles";

/** Ticket mínimo para el predicado. */
function tk(over: Partial<Parameters<typeof perteneceABandeja>[0]> & { area: TicketArea }) {
  return { status: "abierto" as const, assignedTo: null, createdBy: 99, ...over };
}

describe("perteneceABandeja", () => {
  const yo = 1;

  it("con área fija muestra los tickets de ESA área aunque quien mira sea de otra (el bug del CEO)", () => {
    // Dirección (myAreas=["direccion"]) mirando la bandeja de desarrollo.
    const t = tk({ area: "desarrollo" });
    expect(perteneceABandeja(t, { area: "desarrollo", myAreas: ["direccion"], myId: yo })).toBe(true);
  });

  it("con área fija oculta los tickets de otras áreas ajenos", () => {
    const t = tk({ area: "contenido" });
    expect(perteneceABandeja(t, { area: "desarrollo", myAreas: ["direccion"], myId: yo })).toBe(false);
  });

  it("los tickets propios (creados o asignados) entran aunque sean de otra área", () => {
    const creado = tk({ area: "rrhh", createdBy: yo });
    const asignado = tk({ area: "rrhh", assignedTo: yo });
    expect(perteneceABandeja(creado, { area: "desarrollo", myAreas: [], myId: yo })).toBe(true);
    expect(perteneceABandeja(asignado, { area: "desarrollo", myAreas: [], myId: yo })).toBe(true);
  });

  it("los cerrados nunca se muestran, ni siendo propios y del área", () => {
    const t = tk({ area: "desarrollo", status: "cerrado", createdBy: yo });
    expect(perteneceABandeja(t, { area: "desarrollo", myAreas: ["desarrollo"], myId: yo })).toBe(false);
  });

  it("sin área (legado) filtra por las áreas de quien mira", () => {
    const t = tk({ area: "redes" });
    expect(perteneceABandeja(t, { myAreas: ["redes"], myId: yo })).toBe(true);
    expect(perteneceABandeja(t, { myAreas: ["direccion"], myId: yo })).toBe(false);
  });

  it("sin sesión no hay tickets 'propios': assignedTo nulo no coincide con nadie", () => {
    const t = tk({ area: "ventas", assignedTo: null });
    expect(perteneceABandeja(t, { area: "desarrollo", myAreas: [] })).toBe(false);
  });
});
