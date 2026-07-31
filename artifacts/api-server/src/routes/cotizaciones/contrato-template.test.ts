import { describe, it, expect } from "vitest";
import {
  finanzasContratoDoc,
  renderContratoClienteHTML,
  renderContratoTecnicoHTML,
  type BriefContrato,
  type DocContrato,
} from "./contrato-template";

const DOC: DocContrato = {
  client: "ACME",
  project: "Landing ACME",
  scope: "One-page de captación con formulario",
  date: "2026-01-10",
  advisor: "Lucas",
  modules: [
    { name: "Landing", desc: "One-page con hero y formulario", price: 100000 },
    { name: "SEO base", desc: "Meta tags + sitemap", price: 50000 },
    { name: "   ", desc: "módulo fantasma", price: 77777 },
  ],
  downPct: 50,
  notes: "Entrega estimada: 3 semanas.",
  monthly: "Mantención mensual",
  monthlyPrice: "45000",
  validityDays: 15,
};

const BRIEF: BriefContrato = {
  objetivo: "Captar leads con una landing rápida. Presupuesto aprobado: $150.000 según reunión.",
  contexto: "Campaña Q1 de ACME",
  alcance: [
    { modulo: "Landing", descripcion: "Hero, beneficios y formulario", entregables: ["Página publicada", "Formulario conectado"], requisitos: ["Logo en vector"] },
  ],
  criteriosAceptacion: ["El formulario envía correos", "Carga en menos de 2s"],
  fueraDeAlcance: ["Blog", "Multiidioma"],
  stackSugerido: ["React", "Tailwind"],
  hitos: [{ nombre: "Kickoff", detalle: "Semana 1" }, { nombre: "Entrega", detalle: "Semana 3" }],
};

describe("finanzasContratoDoc", () => {
  it("misma matemática que el panel: IVA 19% redondeado, anticipo por downPct", () => {
    const f = finanzasContratoDoc(DOC);
    expect(f.neto).toBe(150000); // el módulo sin nombre no cuenta
    expect(f.iva).toBe(28500);
    expect(f.total).toBe(178500);
    expect(f.abono).toBe(89250);
    expect(f.saldo).toBe(89250);
    expect(f.mensualidadNeto).toBe(45000);
    expect(f.mensualidadTotal).toBe(45000 + Math.round(45000 * 0.19));
    expect(f.vencimiento).toBe("2026-01-25");
  });

  it("downPct fuera de rango se acota y el saldo nunca es negativo", () => {
    const f = finanzasContratoDoc({ ...DOC, downPct: 140 });
    expect(f.downPct).toBe(100);
    expect(f.saldo).toBe(0);
    const f2 = finanzasContratoDoc({ ...DOC, downPct: -5 });
    expect(f2.abono).toBe(0);
  });

  it("sin validityDays no hay vencimiento", () => {
    expect(finanzasContratoDoc({ ...DOC, validityDays: 0 }).vencimiento).toBe("");
  });
});

describe("renderContratoClienteHTML", () => {
  it("incluye cliente, proyecto, módulos y totales formateados", () => {
    const html = renderContratoClienteHTML(DOC);
    expect(html).toContain("ACME");
    expect(html).toContain("Landing");
    expect(html).toContain("SEO base");
    expect(html).not.toContain("módulo fantasma");
    // clp() es-CL: $150.000 neto, $28.500 IVA, $178.500 total
    expect(html).toContain("150.000");
    expect(html).toContain("28.500");
    expect(html).toContain("178.500");
    expect(html).toContain("89.250");
    expect(html).toContain("Mantención mensual");
    expect(html).toContain("Oswald");
    expect(html).not.toContain("undefined");
  });

  it("escapa HTML de los datos", () => {
    const html = renderContratoClienteHTML({ ...DOC, client: 'ACME <script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rechaza documentos sin módulos con nombre", () => {
    expect(() => renderContratoClienteHTML({ ...DOC, modules: [{ name: " ", desc: "", price: 1 }] }))
      .toThrow(/módulos con nombre/);
  });
});

describe("renderContratoTecnicoHTML", () => {
  it("es interno, con la línea gráfica, y SIN un solo monto", () => {
    const html = renderContratoTecnicoHTML(BRIEF, DOC);
    expect(html).toContain("Versión técnica");
    expect(html).toContain("Captar leads");
    expect(html).toContain("Formulario conectado");
    expect(html).toContain("Kickoff");
    expect(html).toContain("React");
    // ni los precios de los módulos ni el monto colado en el objetivo
    expect(html).not.toContain("150.000");
    expect(html).not.toContain("100.000");
    expect(html).not.toMatch(/\$\s?\d/);
    expect(html).not.toContain("undefined");
  });

  it("rechaza un brief vacío", () => {
    expect(() =>
      renderContratoTecnicoHTML({ objetivo: "", contexto: "", alcance: [], criteriosAceptacion: [], fueraDeAlcance: [], stackSugerido: [], hitos: [] })
    ).toThrow(/brief técnico está vacío/);
  });
});
