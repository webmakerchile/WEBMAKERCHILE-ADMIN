import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { hashDocContrato, hashBriefContrato } from "./contrato-hash";

/**
 * El hash decide cuándo el panel muestra "Desactualizado". Estos tests fijan
 * el contrato de comportamiento: insensible a ruido (ids, orden de claves,
 * espacios), sensible a contenido (precios, textos, módulos).
 */

const DOC = {
  client: "ACME",
  project: "Landing ACME",
  scope: "One-page de captación",
  date: "2026-01-10",
  advisor: "Lucas",
  modules: [
    { id: "m1", name: "Landing", desc: "One-page", price: 100000 },
    { id: "m2", name: "SEO base", desc: "", price: 50000 },
  ],
  downPct: 50,
  notes: "Entrega en 3 semanas",
  monthly: "Mantención",
  monthlyPrice: "45000",
  validityDays: 15,
};

const BRIEF = {
  objetivo: "Captar leads",
  contexto: "Campaña Q1",
  alcance: [{ modulo: "Landing", descripcion: "Hero + form", entregables: ["Página"], requisitos: ["Logo"] }],
  criteriosAceptacion: ["Form funciona"],
  fueraDeAlcance: ["Blog"],
  stackSugerido: ["React"],
  hitos: [{ nombre: "Kickoff", detalle: "Semana 1" }],
  generatedAt: 1700000000000,
};

describe("contrato-hash", () => {
  it("la copia del admin-panel es byte a byte idéntica (misma huella en ambos lados)", () => {
    const server = readFileSync(resolve(__dirname, "contrato-hash.ts"), "utf8");
    const panel = readFileSync(resolve(__dirname, "../../../admin-panel/src/lib/contrato-hash.ts"), "utf8");
    expect(panel).toBe(server);
  });

  it("ignora ids de módulos, orden de claves y espacios alrededor", () => {
    const base = hashDocContrato(DOC);
    const reordenado = JSON.parse(JSON.stringify({ ...DOC })) as typeof DOC;
    // claves en otro orden + ids distintos + espacios
    const otro = {
      validityDays: 15,
      monthlyPrice: "45000",
      monthly: "Mantención",
      notes: "  Entrega en 3 semanas  ",
      downPct: 50,
      modules: [
        { price: 100000, desc: "One-page", name: "  Landing ", id: "zzz" },
        { name: "SEO base", price: 50000, desc: "", id: "" },
      ],
      advisor: "Lucas",
      date: "2026-01-10",
      scope: "One-page de captación",
      project: "Landing ACME",
      client: "ACME",
    };
    expect(hashDocContrato(otro)).toBe(base);
    expect(hashDocContrato(reordenado)).toBe(base);
  });

  it("ignora módulos sin nombre (el render también los ignora)", () => {
    const conVacio = { ...DOC, modules: [...DOC.modules, { id: "x", name: "  ", desc: "algo", price: 999 }] };
    expect(hashDocContrato(conVacio)).toBe(hashDocContrato(DOC));
  });

  it("cambia si cambia un precio, un texto o la lista de módulos", () => {
    const base = hashDocContrato(DOC);
    expect(hashDocContrato({ ...DOC, modules: [{ ...DOC.modules[0], price: 120000 }, DOC.modules[1]] })).not.toBe(base);
    expect(hashDocContrato({ ...DOC, notes: "Entrega en 4 semanas" })).not.toBe(base);
    expect(hashDocContrato({ ...DOC, modules: [DOC.modules[0]] })).not.toBe(base);
    expect(hashDocContrato({ ...DOC, downPct: 40 })).not.toBe(base);
  });

  it("tolera datos rotos sin lanzar", () => {
    expect(typeof hashDocContrato(null)).toBe("string");
    expect(typeof hashDocContrato("basura")).toBe("string");
    expect(typeof hashDocContrato({ modules: "no-array", downPct: "NaN" })).toBe("string");
  });

  it("brief: ignora generatedAt pero detecta cambios de contenido", () => {
    const base = hashBriefContrato(BRIEF);
    expect(hashBriefContrato({ ...BRIEF, generatedAt: 999 })).toBe(base);
    expect(hashBriefContrato({ ...BRIEF, objetivo: "Otra cosa" })).not.toBe(base);
    expect(hashBriefContrato({ ...BRIEF, alcance: [] })).not.toBe(base);
  });

  it("las huellas llevan versión (v1:) por si el algoritmo cambia", () => {
    expect(hashDocContrato(DOC)).toMatch(/^v1:[0-9a-f]{16}$/);
    expect(hashBriefContrato(BRIEF)).toMatch(/^v1:[0-9a-f]{16}$/);
  });
});
