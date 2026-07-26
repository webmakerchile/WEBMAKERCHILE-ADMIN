import { describe, it, expect } from "vitest";
import { redactContractMoney, redactContracts, stripMoneyFromText } from "./contract-view";

const CONTRATO = {
  id: "c1",
  title: "E-commerce ACME",
  client: "ACME SpA",
  value: "$2.380.000",
  status: "activo",
  signedAt: "2026-03-01",
  expiresAt: "2026-09-01",
  notes: "Tienda con pagos y despacho",
  pdfUrl: "https://drive.google.com/file/d/comercial/view",
  pdfTitle: "Cotizacion-ACME.pdf",
  pdfUploadedAt: 1770000000000,
  briefUrl: "https://drive.google.com/file/d/tecnico/view",
  brief: { objetivo: "Vender online", alcance: [{ modulo: "Checkout", descripcion: "Pago en cuotas" }] },
  doc: {
    client: "ACME SpA",
    project: "E-commerce ACME",
    scope: "Catálogo, checkout y despacho",
    modules: [
      { id: "m1", name: "Catálogo", desc: "Productos con variantes", price: 800000 },
      { id: "m2", name: "Checkout", desc: "Webpay y Mercado Pago", price: 1200000 },
    ],
    downPct: 50,
    monthly: "Soporte mensual",
    monthlyPrice: "150000",
    validityDays: 15,
  },
};

describe("censura de montos en el contrato", () => {
  it("quita el valor y el PDF comercial", () => {
    const out = redactContractMoney(CONTRATO);
    expect(out.value).toBeUndefined();
    expect(out.pdfUrl).toBeUndefined();
    expect(out.pdfTitle).toBeUndefined();
    expect(out.pdfUploadedAt).toBeUndefined();
    expect(out.moneyRedacted).toBe(true);
  });

  it("conserva lo que sirve para construir", () => {
    const out = redactContractMoney(CONTRATO);
    expect(out.title).toBe("E-commerce ACME");
    expect(out.client).toBe("ACME SpA");
    expect(out.status).toBe("activo");
    expect(out.notes).toBe("Tienda con pagos y despacho");
    expect(out.brief).toEqual(CONTRATO.brief);
    // El PDF técnico sí se entrega: es la versión hecha para el equipo.
    expect(out.briefUrl).toBe("https://drive.google.com/file/d/tecnico/view");
  });

  it("deja los módulos sin precio pero con nombre y descripción", () => {
    const out = redactContractMoney(CONTRATO);
    const mods = (out.doc as { modules: Record<string, unknown>[] }).modules;
    expect(mods).toHaveLength(2);
    expect(mods[0]).toEqual({ id: "m1", name: "Catálogo", desc: "Productos con variantes" });
    expect(mods.every(m => !("price" in m))).toBe(true);
  });

  it("quita la forma de pago y la mensualidad del documento", () => {
    const doc = redactContractMoney(CONTRATO).doc as Record<string, unknown>;
    expect(doc.downPct).toBeUndefined();
    expect(doc.monthly).toBeUndefined();
    expect(doc.monthlyPrice).toBeUndefined();
    // El alcance se conserva: es lo que hay que ejecutar.
    expect(doc.scope).toBe("Catálogo, checkout y despacho");
  });

  it("no modifica el contrato original", () => {
    redactContractMoney(CONTRATO);
    expect(CONTRATO.value).toBe("$2.380.000");
    expect(CONTRATO.doc.modules[0].price).toBe(800000);
  });

  it("ningún monto sobrevive en el JSON serializado", () => {
    const json = JSON.stringify(redactContractMoney(CONTRATO));
    expect(json).not.toContain("2.380.000");
    expect(json).not.toContain("800000");
    expect(json).not.toContain("1200000");
    expect(json).not.toContain("150000");
  });

  it("quita el estado de cobranza: facturas y pagos son información comercial", () => {
    const conCobro = {
      ...CONTRATO,
      cobro: { estado: "facturado", factura: "F-2026-104", fechaPago: "", nota: "Pagan a 30 días" },
    };
    const out = redactContractMoney(conCobro);
    expect(out.cobro).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("F-2026-104");
  });

  it("censura la colección completa y tolera basura", () => {
    const out = redactContracts([CONTRATO, null, "no soy un contrato"]);
    expect(out).toHaveLength(3);
    expect((out[0] as { moneyRedacted: boolean }).moneyRedacted).toBe(true);
    expect(redactContracts(undefined)).toEqual([]);
  });
});

describe("limpieza de montos en texto libre", () => {
  it("borra cifras en pesos escritas de varias formas", () => {
    expect(stripMoneyFromText("El total es $1.200.000 más IVA")).not.toContain("1.200.000");
    expect(stripMoneyFromText("Presupuesto: 2.500.000 CLP")).not.toContain("2.500.000");
    expect(stripMoneyFromText("Vale UF 120 al mes")).not.toContain("120");
    expect(stripMoneyFromText("Costo $ 350000")).not.toContain("350000");
  });

  it("no toca los números que sí importan al equipo técnico", () => {
    // Versiones, plazos y medidas no son dinero.
    expect(stripMoneyFromText("Entrega en 15 días")).toBe("Entrega en 15 días");
    expect(stripMoneyFromText("Node 24 y PostgreSQL 16")).toBe("Node 24 y PostgreSQL 16");
    expect(stripMoneyFromText("Lighthouse 95+ en mobile")).toBe("Lighthouse 95+ en mobile");
  });
});
