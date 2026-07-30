// Estos importes acaban dentro de una cotización que se le manda a un cliente.
// Un separador de miles mal leído convierte $100.000 en $100, y eso no se
// detecta hasta que alguien firma. Los casos de abajo son los formatos reales
// que hay hoy en el catálogo sembrado.

import { describe, it, expect } from "vitest";
import {
  parsearPrecio,
  completarImportes,
  importeDePlan,
  formatearCLP,
  type TierConImporte,
} from "./precio-servicio.js";

describe("leer un precio escrito a mano", () => {
  it("lee el formato chileno con puntos de miles", () => {
    // El error que importa: "100.000" son cien mil, NO cien.
    expect(parsearPrecio("$100.000").monto).toBe(100000);
    expect(parsearPrecio("$1.990.000").monto).toBe(1990000);
    expect(parsearPrecio("290000").monto).toBe(290000);
  });

  it("toma la primera cifra cuando hay varias", () => {
    // "o $25.000/mes · $290.000 pago único": la primera encabeza la oferta.
    // Quedarse con la mayor haría parecer el catálogo más caro de lo que es.
    const p = parsearPrecio("o $25.000/mes · $290.000 pago único");
    expect(p.monto).toBe(25000);
    expect(p.mensual).toBe(true);
  });

  it("reconoce un mínimo", () => {
    const p = parsearPrecio("desde $390.000");
    expect(p.monto).toBe(390000);
    expect(p.desde).toBe(true);
  });

  // No es que valga cero: es que no hay precio. Devolver 0 lo metería como
  // una línea gratis en la cotización sin que nadie lo note.
  it("lo que no tiene precio no vale cero", () => {
    for (const texto of ["—", "", "a cotizar", "A convenir", "consultar", null, undefined]) {
      expect(parsearPrecio(texto).monto, `"${texto}"`).toBeNull();
    }
  });

  it("un cero explícito tampoco cuenta como precio", () => {
    expect(parsearPrecio("$0").monto).toBeNull();
  });
});

describe("completar los importes del catálogo", () => {
  it("deduce el importe de los servicios que ya existen", () => {
    const r = completarImportes<TierConImporte>([
      { plan: "Inicia", price: "$100.000" },
      { plan: "Escala", price: "$290.000" },
      { plan: "Domina", price: "—" },
    ]);
    expect(r.map((t) => t.amount)).toEqual([100000, 290000, null]);
  });

  // El texto puede decir "desde $100.000" y el precio real ser otro.
  it("un importe puesto a mano manda sobre el texto", () => {
    const r = completarImportes([{ plan: "Inicia", price: "$100.000", amount: 150000 }]);
    expect(r[0]!.amount).toBe(150000);
  });

  it("no pisa el texto original", () => {
    const r = completarImportes([{ plan: "Inicia", price: "o $25.000/mes" }]);
    expect(r[0]!.price).toBe("o $25.000/mes");
  });
});

describe("precargar una cotización", () => {
  const tiers = [
    { plan: "Inicia", price: "$100.000" },
    { plan: "Escala", price: "$290.000" },
    { plan: "Domina", price: "a cotizar" },
  ];

  it("encuentra el plan sin importar mayúsculas ni espacios", () => {
    expect(importeDePlan(tiers, "escala")).toBe(290000);
    expect(importeDePlan(tiers, "  Escala  ")).toBe(290000);
  });

  it("un plan sin precio cierto devuelve null, no cero", () => {
    expect(importeDePlan(tiers, "Domina")).toBeNull();
  });

  it("un plan que no existe devuelve null", () => {
    expect(importeDePlan(tiers, "Inventado")).toBeNull();
  });
});

describe("formato", () => {
  it("usa el formato chileno", () => {
    expect(formatearCLP(1990000)).toBe("$1.990.000");
  });
});
