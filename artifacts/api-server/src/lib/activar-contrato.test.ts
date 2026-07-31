// La activación al firmar: la ÚNICA escritura al tablero que puede disparar
// la ruta pública. Lo que se defiende aquí es su acotamiento: solo pasa
// borrador → activo, no toca perdidos ni activos, y no pisa escrituras
// cruzadas (guardado condicionado a la versión, con reintentos).

import { describe, it, expect, vi, beforeEach } from "vitest";

let boardData: Record<string, unknown> = {};
let saved: Record<string, unknown> | null = null;
let choquesDeVersion = 0;
vi.mock("./hub-board", () => ({
  resolveBoard: async () => ({ boardUserId: 1, data: boardData, owner: null, version: 0 }),
  saveBoardSiVersion: async (_uid: number, data: Record<string, unknown>, _v: number) => {
    if (choquesDeVersion > 0) { choquesDeVersion--; return null; }
    saved = data;
    return { data, version: Date.now() };
  },
}));

const { recordActivityMock } = vi.hoisted(() => ({ recordActivityMock: vi.fn() }));
vi.mock("./activity", () => ({ recordActivity: recordActivityMock }));

// El arranque automático es fire-and-forget: aquí solo importa CUÁNDO se
// dispara y con qué contrato/actor; lo que hace por dentro vive en handoffs.
const { handoffMock } = vi.hoisted(() => ({ handoffMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./handoffs", () => ({ handoffContractClosed: handoffMock }));

import { activarContratoFirmado } from "./activar-contrato";

// Mediodía UTC: en Santiago (UTC-4 en julio) sigue siendo el mismo día.
const FIRMA = new Date("2026-07-31T15:00:00Z");

beforeEach(() => {
  boardData = {};
  saved = null;
  choquesDeVersion = 0;
  recordActivityMock.mockClear();
  handoffMock.mockClear();
});

const borrador = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "c1", title: "Web ACME", client: "ACME", status: "borrador", ...extra,
});

describe("activarContratoFirmado", () => {
  it("borrador → activo, con la fecha de firma en día de Santiago", async () => {
    boardData = { contracts: [borrador()] };
    const r = await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 });
    expect(r).toBe("activado");
    const c = (saved!.contracts as Record<string, unknown>[])[0];
    expect(c.status).toBe("activo");
    expect(c.signedAt).toBe("2026-07-31");
    expect(typeof c.updatedAt).toBe("number");
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 7,
      action: "status_change",
      entityId: "c1",
    }));
  });

  it("respeta la fecha de firma que ya traía (contratos importados)", async () => {
    boardData = { contracts: [borrador({ signedAt: "2026-01-15" })] };
    await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 });
    expect((saved!.contracts as Record<string, unknown>[])[0].signedAt).toBe("2026-01-15");
  });

  it("un contrato ya activo (o perdido) NO se toca: firmar dos veces no re-escribe", async () => {
    boardData = { contracts: [borrador({ status: "activo" })] };
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 })).toBe("ya_resuelto");
    boardData = { contracts: [borrador({ status: "perdido" })] };
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 })).toBe("ya_resuelto");
    expect(saved).toBeNull();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("contrato que no está en el tablero → no_encontrado, sin escribir", async () => {
    boardData = { contracts: [] };
    expect(await activarContratoFirmado({ contractId: "nada", fechaFirma: FIRMA, actorId: 7 })).toBe("no_encontrado");
    expect(saved).toBeNull();
  });

  it("si otro guardado se cruza, relee y reintenta hasta lograrlo", async () => {
    boardData = { contracts: [borrador()] };
    choquesDeVersion = 2;
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 })).toBe("activado");
    expect((saved!.contracts as Record<string, unknown>[])[0].status).toBe("activo");
  });

  it("con el tablero SIEMPRE ocupado se rinde a la tercera y lo dice (fallo)", async () => {
    boardData = { contracts: [borrador()] };
    choquesDeVersion = 99;
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 })).toBe("fallo");
    expect(saved).toBeNull();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("sin actorId (enlaces viejos) activa igual, pero sin bitácora", async () => {
    boardData = { contracts: [borrador()] };
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: null })).toBe("activado");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});

describe("arranque automático del proyecto", () => {
  it("al activar dispara el handoff con el contrato YA activo y el actor real", async () => {
    boardData = { contracts: [borrador()] };
    await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 });
    expect(handoffMock).toHaveBeenCalledTimes(1);
    const [contrato, actor] = handoffMock.mock.calls[0]! as [Record<string, unknown>, number];
    expect(contrato.id).toBe("c1");
    expect(contrato.status).toBe("activo"); // el handoff ve el contrato activado, no el borrador
    expect(actor).toBe(7);
  });

  it("sin actor conocido, el arranque firma como el dueño del tablero (hub_tasks exige creador)", async () => {
    boardData = { contracts: [borrador()] };
    await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: null });
    expect(handoffMock).toHaveBeenCalledTimes(1);
    expect(handoffMock.mock.calls[0]![1]).toBe(1); // boardUserId del mock de resolveBoard
  });

  it("ya_resuelto, no_encontrado y fallo NO arrancan nada", async () => {
    boardData = { contracts: [borrador({ status: "activo" })] };
    await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 });
    boardData = { contracts: [] };
    await activarContratoFirmado({ contractId: "nada", fechaFirma: FIRMA, actorId: 7 });
    boardData = { contracts: [borrador()] };
    choquesDeVersion = 99;
    await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 });
    expect(handoffMock).not.toHaveBeenCalled();
  });

  it("si el handoff revienta, la activación no se entera (fire-and-forget)", async () => {
    handoffMock.mockRejectedValueOnce(new Error("IA caída"));
    boardData = { contracts: [borrador()] };
    expect(await activarContratoFirmado({ contractId: "c1", fechaFirma: FIRMA, actorId: 7 })).toBe("activado");
  });
});
