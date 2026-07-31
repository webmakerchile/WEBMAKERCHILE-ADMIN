import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock funcional mínimo de la DB: alcanza para claimAlert (insert con
   onConflictDoNothing → dedupe por kind|ref|marker) y para listar usuarios. */
const alertKeys = new Set<string>();
const userRows: Record<string, unknown>[] = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.where = () => chain;
        chain.limit = async () => [];
        chain.then = (resolve: (v: unknown) => unknown) => resolve(userRows);
        return chain;
      },
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const k = `${v.kind}|${v.contractRef}|${v.marker}`;
            if (alertKeys.has(k)) return [];
            alertKeys.add(k);
            return [{ id: alertKeys.size }];
          },
        }),
        onConflictDoUpdate: () => ({ returning: async () => [v] }),
      }),
    }),
  },
}));
vi.mock("@workspace/db/schema", () => ({ salesAlerts: {}, salesSettings: {}, users: {}, employeeProfiles: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), inArray: vi.fn() }));
vi.mock("./hub-board", () => ({ resolveBoard: vi.fn() }));
vi.mock("./notifications", () => ({ createNotification: vi.fn() }));

import { resolveBoard } from "./hub-board";
import { createNotification } from "./notifications";
import {
  contractNet,
  toOpportunity,
  weightedProjection,
  pipelineContracts,
  STAGE_DEFAULT_PROB,
  checkCasosFuturo,
  checkReunionesSinDesenlace,
  checkSalesFollowUps,
} from "./ventas";

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

/* ------------------ Avisos: casos a futuro y reuniones ------------------- */

const board = (data: Record<string, unknown>) =>
  vi.mocked(resolveBoard).mockResolvedValue({ boardUserId: 1, data, owner: null, version: 0 } as never);

// 31 de julio de 2026 al mediodía en Chile (invierno: UTC-4).
const AHORA = new Date("2026-07-31T16:00:00Z");

beforeEach(() => {
  alertKeys.clear();
  userRows.length = 0;
  vi.mocked(createNotification).mockClear();
  vi.mocked(createNotification).mockResolvedValue(undefined as never);
});

describe("checkCasosFuturo", () => {
  it("avisa al dueño cuando la fecha estimada está a 7 días o menos", async () => {
    board({ contracts: [{ id: "c1", title: "Web", client: "ACME", status: "borrador", futuroFecha: "2026-08-05", futuroMotivo: "fondos", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(1);
    const calls = vi.mocked(createNotification).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].userId).toBe(7);
    expect(calls[0][0].title).toContain("ACME");
    expect(calls[0][0].body).toContain("2026-08-05");
  });

  it("todavía lejos: no avisa", async () => {
    board({ contracts: [{ id: "c1", status: "borrador", futuroFecha: "2026-12-01", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(0);
  });

  it("la fecha vencida sigue avisando (peor sería callarla)", async () => {
    board({ contracts: [{ id: "c1", status: "borrador", futuroFecha: "2026-07-01", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(1);
  });

  it("no repite el aviso para la misma fecha; una fecha nueva lo rearma", async () => {
    board({ contracts: [{ id: "c1", status: "borrador", futuroFecha: "2026-08-05", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(1);
    expect(await checkCasosFuturo(AHORA)).toBe(0);
    board({ contracts: [{ id: "c1", status: "borrador", futuroFecha: "2026-08-06", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(1);
  });

  it("sin dueño asignado, avisa al equipo de ventas (no al resto)", async () => {
    userRows.push(
      { id: 7, teamRole: "ventas", role: "user", approvalStatus: "approved" },
      { id: 9, teamRole: "contador", role: "user", approvalStatus: "approved" },
    );
    board({ contracts: [{ id: "c1", status: "borrador", futuroFecha: "2026-07-01" }] });
    expect(await checkCasosFuturo(AHORA)).toBe(1);
    expect(vi.mocked(createNotification).mock.calls.map(c => c[0].userId)).toEqual([7]);
  });

  it("solo cuenta el pipeline: un activo con fecha no molesta", async () => {
    board({ contracts: [{ id: "c1", status: "activo", futuroFecha: "2026-07-01", salesOwnerId: 7 }] });
    expect(await checkCasosFuturo(AHORA)).toBe(0);
  });
});

describe("checkReunionesSinDesenlace", () => {
  const base = { contracts: [{ id: "c1", title: "Web", client: "ACME", status: "borrador", salesOwnerId: 7 }] };

  it("reunión pasada sin desenlace: avisa al dueño una sola vez", async () => {
    board({ ...base, meetings: [{ id: "m1", client: "ACME", date: "2026-07-20", tipo: "propuesta", contractId: "c1" }] });
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(1);
    expect(vi.mocked(createNotification).mock.calls[0][0].userId).toBe(7);
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(0); // dedupe
  });

  it("con desenlace registrado no molesta", async () => {
    board({ ...base, meetings: [{ id: "m1", date: "2026-07-20", tipo: "propuesta", contractId: "c1", desenlace: "perdido" }] });
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(0);
  });

  it("reunión futura o manual (sin vínculo) no cuenta", async () => {
    board({
      ...base,
      meetings: [
        { id: "m1", date: "2026-08-20", tipo: "propuesta", contractId: "c1" },
        { id: "m2", date: "2026-07-01" },
      ],
    });
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(0);
  });

  it("si la oportunidad ya salió del embudo, no hay nada que registrar", async () => {
    board({ contracts: [{ id: "c1", status: "perdido" }], meetings: [{ id: "m1", date: "2026-07-20", tipo: "propuesta", contractId: "c1" }] });
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(0);
  });

  it("sin dueño, el aviso cae al equipo de ventas", async () => {
    userRows.push({ id: 7, teamRole: "ventas", role: "user", approvalStatus: "approved" });
    board({ contracts: [{ id: "c1", status: "borrador" }], meetings: [{ id: "m1", date: "2026-07-20", tipo: "discovery", contractId: "c1" }] });
    expect(await checkReunionesSinDesenlace(AHORA)).toBe(1);
    expect(vi.mocked(createNotification).mock.calls[0][0].userId).toBe(7);
  });
});

describe("checkSalesFollowUps (convivencia con reuniones de venta)", () => {
  const contrato = (extra: Record<string, unknown> = {}) =>
    ({ id: "c1", title: "Web", client: "ACME", status: "borrador", salesOwnerId: 7, nextFollowUp: "2026-07-28", ...extra });

  it("si el seguimiento apunta a una reunión sin desenlace, se calla: de eso avisa el otro recordatorio", async () => {
    board({
      contracts: [contrato()],
      meetings: [{ id: "m1", client: "ACME", date: "2026-07-28", tipo: "discovery", contractId: "c1" }],
    });
    expect(await checkSalesFollowUps(AHORA)).toBe(0);
  });

  it("con la reunión ya resuelta, el seguimiento vencido vuelve a avisar con normalidad", async () => {
    board({
      contracts: [contrato()],
      meetings: [{ id: "m1", date: "2026-07-28", tipo: "discovery", contractId: "c1", desenlace: "siguiente_reunion" }],
    });
    expect(await checkSalesFollowUps(AHORA)).toBe(1);
    expect(vi.mocked(createNotification).mock.calls[0][0].userId).toBe(7);
  });

  it("una reunión en otra fecha no calla el seguimiento manual vencido", async () => {
    board({
      contracts: [contrato()],
      meetings: [{ id: "m1", date: "2026-08-15", tipo: "discovery", contractId: "c1" }],
    });
    expect(await checkSalesFollowUps(AHORA)).toBe(1);
  });
});
