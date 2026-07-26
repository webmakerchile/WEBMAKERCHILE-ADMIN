import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));
vi.mock("./notifications", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));

import { db } from "@workspace/db";
import { createNotification } from "./notifications";
import { businessDays, checkDocumentExpiryAlerts, leaveBalance, periodKeysOfMonth } from "./hr-ops";

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("businessDays", () => {
  it("cuenta solo lunes a viernes, inclusive", () => {
    // Lunes 2026-07-20 a viernes 2026-07-24 = 5 hábiles
    expect(businessDays("2026-07-20", "2026-07-24")).toBe(5);
    // Semana completa con fin de semana = igual 5
    expect(businessDays("2026-07-20", "2026-07-26")).toBe(5);
    // Sábado a domingo = 0
    expect(businessDays("2026-07-25", "2026-07-26")).toBe(0);
    // Un solo día hábil
    expect(businessDays("2026-07-22", "2026-07-22")).toBe(1);
  });
});

describe("leaveBalance", () => {
  it("descuenta aprobadas y pendientes; nunca queda negativo", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([{ allowance: 15 }]))
      .mockReturnValueOnce(selectChain([
        { days: 10, status: "aprobada" },
        { days: 4, status: "pendiente" },
        { days: 9, status: "aprobada" },
      ]));
    const bal = await leaveBalance(7, new Date("2026-07-26T12:00:00Z"));
    expect(bal.usedDays).toBe(19);
    expect(bal.pendingDays).toBe(4);
    expect(bal.available).toBe(0); // no negativo
  });

  it("usa 15 días si no hay ficha", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    const bal = await leaveBalance(7, new Date("2026-07-26T12:00:00Z"));
    expect(bal.allowance).toBe(15);
    expect(bal.available).toBe(15);
  });
});

describe("periodKeysOfMonth", () => {
  it("incluye el mes, todos los días y las semanas que tocan el mes", () => {
    const keys = periodKeysOfMonth("2026-07");
    expect(keys).toContain("2026-07");
    expect(keys).toContain("2026-07-01");
    expect(keys).toContain("2026-07-31");
    expect(keys.some((k) => /^2026-W\d{2}$/.test(k))).toBe(true);
  });
});

describe("checkDocumentExpiryAlerts", () => {
  const doc = (over: Record<string, unknown>) => ({
    id: 1, name: "Contrato", userId: 7, expiresAt: "2026-08-10", alertSentFor: "",
    userName: "Ana", userEmail: "ana@t.com", ...over,
  });

  it("avisa UNA vez por vencimiento y marca el dedupe", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([doc({})]))
      // getHrRecipientIds
      .mockReturnValueOnce(selectChain([
        { id: 1, teamRole: "ceo", role: "user" },
        { id: 6, teamRole: "rrhh", role: "user" },
      ]));
    const upd = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    };
    vi.mocked(db.update).mockReturnValue(upd as never);

    const n = await checkDocumentExpiryAlerts(new Date("2026-07-26T15:00:00Z"));
    expect(n).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(2); // ceo + rrhh
  });

  it("no re-avisa si el marcador ya coincide con el vencimiento", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([doc({ alertSentFor: "2026-08-10" })]))
      .mockReturnValueOnce(selectChain([]));
    const n = await checkDocumentExpiryAlerts(new Date("2026-07-26T15:00:00Z"));
    expect(n).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("si otro tick ganó la carrera (update no afectó filas), no notifica", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([doc({})]))
      .mockReturnValueOnce(selectChain([{ id: 6, teamRole: "rrhh", role: "user" }]));
    const upd = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(db.update).mockReturnValue(upd as never);
    const n = await checkDocumentExpiryAlerts(new Date("2026-07-26T15:00:00Z"));
    expect(n).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
