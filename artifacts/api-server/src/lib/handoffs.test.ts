import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("./notifications", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("./activity", () => ({ recordActivity: vi.fn() }));
vi.mock("./hub-board", () => ({ resolveBoard: vi.fn() }));
const { generarReqsMock } = vi.hoisted(() => ({ generarReqsMock: vi.fn() }));
vi.mock("./requerimientos-ia", () => ({ generarRequerimientos: generarReqsMock }));

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
  // Por defecto la IA "no está": los tests históricos prueban el arranque
  // mecánico desde el brief, que sigue siendo la red de seguridad.
  generarReqsMock.mockRejectedValue(new Error("IA apagada en tests"));
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
    const values = tasksInsert.values.mock.calls[0]![0] as Array<{ title: string; notes: string | null; origin: string; assigneeId: number | null }>;
    expect(values.map(v => v.title)).toEqual(["Home", "Checkout"]);

    // Sin IA, el origen dice la verdad ("desde el brief") y el trabajo queda
    // asignado al dev más antiguo: nadie tiene que repartir a mano.
    expect(values.every(v => v.origin === "arranque_brief")).toBe(true);
    expect(values.every(v => v.assigneeId === 2)).toBe(true);

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

  it("con IA disponible: requerimientos con checklist, prioridad y asignación por tipo de trabajo", async () => {
    generarReqsMock.mockResolvedValueOnce([
      { titulo: "Desarrollar catálogo de productos", descripcion: "Catálogo con filtros y fichas", checklist: ["Modelar productos", "Armar filtros"], prioridad: "alta", area: "desarrollo" },
      { titulo: "Configurar campaña de lanzamiento", descripcion: "", checklist: [], prioridad: "media", area: "marketing" },
      { titulo: "Coordinar contenidos con el cliente", descripcion: "Fotos y textos", checklist: [], prioridad: "baja", area: "otro" },
    ]);
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never) // claim
      .mockReturnValueOnce(mockClaim([]) as never); // hubTasks insert
    vi.mocked(resolveBoard).mockResolvedValue({
      boardUserId: 1, owner: null, data: { projects: [] }, version: 0, exists: true,
    } as never);
    vi.mocked(db.select).mockReturnValue(selectChain([
      { id: 2, teamRole: "dev", role: "user", approvalStatus: "approved" },
      { id: 3, teamRole: "ventas", role: "user", approvalStatus: "approved" },
      { id: 5, teamRole: "marketing", role: "user", approvalStatus: "approved" },
    ]) as never);

    await handoffContractClosed({ id: "c2", title: "Tienda Acme", client: "Acme", status: "activo" }, 1);

    const tasksInsert = vi.mocked(db.insert).mock.results[1]!.value as { values: ReturnType<typeof vi.fn> };
    const values = tasksInsert.values.mock.calls[0]![0] as Array<{
      title: string; notes: string | null; origin: string; assigneeId: number | null;
      priority: string; checklist: Array<{ id: string; text: string; done: boolean }>;
    }>;

    expect(values.map(v => v.title)).toEqual([
      "Desarrollar catálogo de productos",
      "Configurar campaña de lanzamiento",
      "Coordinar contenidos con el cliente",
    ]);
    expect(values.every(v => v.origin === "arranque_ia")).toBe(true);
    // Asignación por tipo de trabajo: desarrollo y coordinación → dev (2),
    // marketing → marketing (5).
    expect(values.map(v => v.assigneeId)).toEqual([2, 5, 2]);
    expect(values.map(v => v.priority)).toEqual(["alta", "media", "baja"]);
    // El checklist llega como items reales, listos para marcar.
    expect(values[0]!.checklist.map(c => c.text)).toEqual(["Modelar productos", "Armar filtros"]);
    expect(values[0]!.checklist.every(c => c.done === false && c.id.length > 0)).toBe(true);

    // Avisos: al dev por área, y a marketing en persona (el aviso de
    // desarrollo no le llega). Ventas no pinta nada aquí.
    const notified = vi.mocked(createNotification).mock.calls.map(c => (c[0] as { userId: number }).userId);
    expect(notified).toContain(2);
    expect(notified).toContain(5);
    expect(notified).not.toContain(3);
  });

  it("si la IA falla NO se pierde el arranque ni se libera el claim: caen las tareas del brief", async () => {
    // El default del beforeEach ya simula la IA caída; aquí el contrato no
    // tiene brief → arranque genérico, y el claim NO se libera (no hay delete).
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never)
      .mockReturnValueOnce(mockClaim([]) as never);
    vi.mocked(resolveBoard).mockResolvedValue({
      boardUserId: 1, owner: null, data: { projects: [] }, version: 0, exists: true,
    } as never);
    vi.mocked(db.select).mockReturnValue(selectChain([]) as never);

    await handoffContractClosed({ id: "c3", title: "Web Beta", status: "activo" }, 1);

    const tasksInsert = vi.mocked(db.insert).mock.results[1]!.value as { values: ReturnType<typeof vi.fn> };
    const values = tasksInsert.values.mock.calls[0]![0] as Array<{ title: string; origin: string; assigneeId: number | null }>;
    expect(values.length).toBe(3); // kickoff genérico
    expect(values.every(v => v.origin === "arranque_brief")).toBe(true);
    expect(values.every(v => v.assigneeId === null)).toBe(true); // sin equipo, sin asignar
    expect(db.delete).not.toHaveBeenCalled(); // el claim sigue: nada que reintentar
  });

  it("un brief legado con montos NO los cuela en tareas ni avisos (invariante de dinero)", async () => {
    // El brief normal nace limpio (sanitizeBrief), pero uno importado o viejo
    // pudo guardarse con cifras. La frontera es el arranque: nada pasa.
    vi.mocked(db.insert)
      .mockReturnValueOnce(mockClaim([{ id: 1 }]) as never)
      .mockReturnValueOnce(mockClaim([]) as never);
    vi.mocked(resolveBoard).mockResolvedValue({
      boardUserId: 1, owner: null, data: { projects: [] }, version: 0, exists: true,
    } as never);
    vi.mocked(db.select).mockReturnValue(selectChain([
      { id: 2, teamRole: "dev", role: "user", approvalStatus: "approved" },
    ]) as never);

    await handoffContractClosed(
      { id: "c4", title: "Web Gama por $2.500.000", status: "activo",
        brief: {
          alcance: [{
            modulo: "Checkout de $1.200.000",
            descripcion: "Pasarela por 990 UF",
            requisitos: ["Cobrar $500.000 de anticipo"],
          }],
        } },
      1,
    );

    const tasksInsert = vi.mocked(db.insert).mock.results[1]!.value as { values: ReturnType<typeof vi.fn> };
    const values = tasksInsert.values.mock.calls[0]![0] as Array<{ title: string; notes: string | null }>;
    const textoTareas = JSON.stringify(values);
    expect(textoTareas).not.toContain("1.200.000");
    expect(textoTareas).not.toContain("990");
    expect(textoTareas).not.toContain("500.000");

    const avisos = JSON.stringify(vi.mocked(createNotification).mock.calls);
    expect(avisos).not.toContain("2.500.000");
    expect(avisos).not.toContain("1.200.000");
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
