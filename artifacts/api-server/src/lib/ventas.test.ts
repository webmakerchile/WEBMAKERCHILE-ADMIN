import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("@workspace/db/schema", () => ({ salesAlerts: {}, salesSettings: {}, users: {}, employeeProfiles: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), inArray: vi.fn() }));
vi.mock("./hub-board", () => ({ resolveBoard: vi.fn() }));
vi.mock("./notifications", () => ({ createNotification: vi.fn() }));

import { contractNet, toOpportunity, weightedProjection, pipelineContracts, STAGE_DEFAULT_PROB } from "./ventas";

describe("contractNet", () => {
  it("suma los módulos (neto) cuando existen", () => {
    expect(contractNet({ doc: { modules: [{ price: 100000 }, { price: 50000 }] }, value: "$999.999" })).toBe(150000);
  });
  it("sin módulos, lleva el value (bruto) a neto", () => {
    expect(contractNet({ value: "$119.000" })).toBe(100000);
  });
  it("sin datos devuelve 0", () => {
    expect(contractNet({})).toBe(0);
    expect(contractNet({ value: "por definir" })).toBe(0);
  });
});

describe("toOpportunity (migración perezosa)", () => {
  it("contrato legacy sin pipeline recibe defaults al leer", () => {
    const o = toOpportunity({ id: "c1", title: "X", client: "ACME", status: "borrador" }, true);
    expect(o.stage).toBe("prospecto");
    expect(o.probability).toBe(STAGE_DEFAULT_PROB.prospecto);
    expect(o.nextFollowUp).toBe("");
  });
  it("respeta etapa y probabilidad explícitas", () => {
    const o = toOpportunity({ id: "c1", pipelineStage: "negociacion", probability: 80 }, true);
    expect(o.stage).toBe("negociacion");
    expect(o.probability).toBe(80);
  });
  it("NO incluye monto cuando el rol no ve dinero", () => {
    const o = toOpportunity({ id: "c1", doc: { modules: [{ price: 100 }] } }, false);
    expect(o.amountNet).toBeUndefined();
  });
});

describe("weightedProjection", () => {
  it("pondera neto × probabilidad solo del mes pedido", () => {
    const opps = [
      { amountNet: 1000000, probability: 50, expectedClose: "2026-07-15" },
      { amountNet: 2000000, probability: 75, expectedClose: "2026-08-01" },
    ];
    expect(weightedProjection(opps, "2026-07")).toBe(500000);
    expect(weightedProjection(opps, "2026-08")).toBe(1500000);
  });
  it("sin cierre esperado, la oportunidad cuenta en el mes consultado", () => {
    expect(weightedProjection([{ amountNet: 100, probability: 10, expectedClose: "" }], "2026-07")).toBe(10);
  });
});

describe("pipelineContracts", () => {
  it("solo los borradores son pipeline", () => {
    const list = [{ id: "a", status: "borrador" }, { id: "b", status: "activo" }, { id: "c", status: "cancelado" }];
    expect(pipelineContracts(list).map(c => c.id)).toEqual(["a"]);
  });
});
