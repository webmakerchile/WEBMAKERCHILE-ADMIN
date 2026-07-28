import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("./notifications", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("./activity", () => ({ recordActivity: vi.fn() }));
vi.mock("./hub-board", () => ({ resolveBoard: vi.fn() }));

import { db } from "@workspace/db";
import { createNotification } from "./notifications";
import { recordActivity } from "./activity";
import { resolveBoard } from "./hub-board";
import {
  claimHandoff, handoffContractClosed, handoffProjectDelivered, handoffVideoApproved, suggestPublishDate,
} from "./handoffs";

/** insert(...).values(...).onConflictDoNothing().returning() → rows */
function mockClaim(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimHandoff (idempotencia)", () => {
  it("devuelve true la primera vez y false si ya existía", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([{ id: 1 }]) as never);
    expect(await claimHandoff("venta_cerrada", "c1")).toBe(true);
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([]) as never);
    expect(await claimHandoff("venta_cerrada", "c1")).toBe(false);
  });
});

describe("handoffContractClosed", () => {
  it("si el handoff ya fue reclamado, no hace nada (etapa rebotó)", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([]) as never);
    await handoffContractClosed({ id: "c1", title: "Sitio Acme", status: "activo" }, 1);
    expect(resolveBoard).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("crea proyecto en el tablero + tareas desde el brief y notifica a dev", async () => {
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never) // claim
      .mockReturnValueOnce(mockClaim([]) as never); // hubTasks insert
    vi.mocked(resolveBoard).mockResolvedValue({
      boardUserId: 1, owner: null, data: { projects: [] }, version: 0, exists: true,
    } as never);
    // team para notifyArea: un dev y un vendedor
    vi.mocked(db.select).mockReturnValue(selectChain([
      { id: 2, teamRole: "dev", role: "user", approvalStatus: "approved" },
      { id: 3, teamRole: "ventas", role: "user", approvalStatus: "approved" },
    ]) as never);

    await handoffContractClosed(
      { id: "c1", title: "Sitio Acme", client: "Acme", status: "activo",
        notes: "Landing + tienda, entrega en marzo",
        expiresAt: "2026-03-31",
        brief: {
          objetivo: "Vender online sin depender de WhatsApp",
          alcance: [
            { modulo: "Home", descripcion: "Hero + CTA", entregables: ["Diseño", "Responsive"], requisitos: ["Logo del cliente"] },
            { modulo: "Checkout" },
          ],
        } },
      1,
    );

    // Append atómico del proyecto al blob (jsonb concat, sin leer-modificar-escribir).
    expect(db.execute).toHaveBeenCalledTimes(1);
    const sqlArg = JSON.stringify(vi.mocked(db.execute).mock.calls[0]![0]);
    expect(sqlArg).toContain("c1");
    expect(sqlArg).toContain("disc");

    // Tareas desde el brief (2 módulos)
    const tasksInsert = vi.mocked(db.insert).mock.results[1]!.value as { values: ReturnType<typeof vi.fn> };
    const values = tasksInsert.values.mock.calls[0]![0] as Array<{ title: string; notes: string | null }>;
    expect(values.map(v => v.title)).toEqual(["Home", "Checkout"]);

    // El brief tiene que LLEGAR a la tarea. Antes se leía `item.detalle`, que
    // no existe en el brief real, y notes salía null siempre: el dev recibía
    // un título suelto sin un solo requisito.
    expect(values[0]!.notes).toContain("Hero + CTA");
    expect(values[0]!.notes).toContain("Diseño");
    expect(values[0]!.notes).toContain("Logo del cliente");
    // Un módulo sin descripción sigue pudiendo no tener notas.
    expect(values[1]!.notes).toBeNull();

    // Y el proyecto conserva lo acordado en vez de la frase fija de antes.
    expect(sqlArg).toContain("Landing + tienda");
    expect(sqlArg).toContain("Vender online sin depender de WhatsApp");
    expect(sqlArg).toContain("2026-03-31");

    expect(recordActivity).toHaveBeenCalled();
    // Notificó al dev (id 2), no al vendedor (área ventas) ni al actor.
    const notified = vi.mocked(createNotification).mock.calls.map(c => (c[0] as { userId: number }).userId);
    expect(notified).toContain(2);
    expect(notified).not.toContain(3);
  });

  it("no duplica el proyecto si el contrato ya tiene uno", async () => {
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never)
      .mockReturnValueOnce(mockClaim([]) as never);
    vi.mocked(resolveBoard).mockResolvedValue({
      boardUserId: 1, owner: null,
      data: { projects: [{ id: "p1", contractId: "c1", name: "Ya existe" }] },
      version: 0, exists: true,
    } as never);
    vi.mocked(db.select).mockReturnValue(selectChain([]) as never);

    await handoffContractClosed({ id: "c1", title: "Sitio Acme", status: "activo" }, 1);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("si el handoff falla a medias, libera el claim para poder reintentar", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([{ id: 1 }]) as never);
    vi.mocked(resolveBoard).mockRejectedValueOnce(new Error("db caída"));
    const whereFn = vi.fn().mockResolvedValue([]);
    vi.mocked(db.delete).mockReturnValue({ where: whereFn } as never);

    await expect(handoffContractClosed({ id: "c9", title: "X", status: "activo" }, 1)).rejects.toThrow("db caída");
    expect(db.delete).toHaveBeenCalledTimes(1); // claim liberado
  });
});

describe("handoffVideoApproved", () => {
  it("pone fecha sugerida solo si el video no tenía scheduledAt", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([{ id: 1 }]) as never);
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([{ id: 9, title: "Video X", scheduledAt: null }]) as never)
      .mockReturnValue(selectChain([]) as never); // team
    const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    await handoffVideoApproved(9, 1);
    expect(setFn).toHaveBeenCalledTimes(1);
    expect((setFn.mock.calls[0]![0] as { scheduledAt: Date }).scheduledAt).toBeInstanceOf(Date);
  });

  it("respeta la fecha existente (no la pisa)", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([{ id: 1 }]) as never);
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([{ id: 9, title: "Video X", scheduledAt: new Date("2026-08-01T15:00:00Z") }]) as never)
      .mockReturnValue(selectChain([]) as never);
    vi.mocked(db.update).mockReturnValue({ set: vi.fn() } as never);

    await handoffVideoApproved(9, 1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("segunda aprobación (rebote) no hace nada", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([]) as never);
    await handoffVideoApproved(9, 1);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("handoffProjectDelivered", () => {
  it("crea ticket de cobranza en finanzas asignado al contador", async () => {
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never) // claim
      .mockReturnValueOnce(mockClaim([{ id: 55, title: "Cobranza: Sitio Acme" }]) as never); // ticket
    vi.mocked(db.select).mockReturnValue(selectChain([
      { id: 4, teamRole: "contador", role: "user", approvalStatus: "approved" },
    ]) as never);

    await handoffProjectDelivered({ id: "p1", name: "Sitio Acme", client: "Acme" }, 1);

    const ticketInsert = vi.mocked(db.insert).mock.results[1]!.value as { values: ReturnType<typeof vi.fn> };
    const ticket = ticketInsert.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(ticket.area).toBe("finanzas");
    expect(ticket.assignedTo).toBe(4);
    expect(String(ticket.title)).toContain("Cobranza");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 4 }));
  });

  it("rebote de estado no duplica el ticket", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(mockClaim([]) as never);
    await handoffProjectDelivered({ id: "p1", name: "Sitio Acme" }, 1);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("suggestPublishDate", () => {
  it("sugiere el día siguiente a mediodía de Santiago", () => {
    const d = suggestPublishDate(new Date("2026-07-26T18:00:00Z"));
    const santiago = d.toLocaleString("en-US", { timeZone: "America/Santiago", hour12: false });
    expect(santiago).toContain("7/27/2026");
    expect(santiago).toContain("12:00");
  });
});
