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
vi.mock("./activity", async () => ({
  recordActivity: vi.fn(),
  sanitizeLabel: (s: string) => s,
}));
vi.mock("./hub-board", () => ({ resolveBoard: vi.fn().mockResolvedValue(null) }));

import { db } from "@workspace/db";
import { createNotification } from "./notifications";
import { recordActivity } from "./activity";
import { checkSlaBreaches, DEFAULT_SLAS } from "./sla";

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

function breachInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const NOW = new Date("2026-07-26T15:00:00Z");
const HOURS = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

/**
 * Orden de selects dentro de checkSlaBreaches:
 * 1. count(sla_policies)  2. sla_policies  3. hub_tasks  4. tickets
 * 5. videos  6. users (dirección)
 */
function primeSelects(opts: { tasks?: unknown[]; tickets?: unknown[]; videos?: unknown[]; direccion?: unknown[] }) {
  vi.mocked(db.select)
    .mockReturnValueOnce(selectChain([{ n: DEFAULT_SLAS.length }]) as never) // ya sembrado
    .mockReturnValueOnce(selectChain(DEFAULT_SLAS.map((d, i) => ({ id: i + 1, ...d }))) as never)
    .mockReturnValueOnce(selectChain(opts.tasks ?? []) as never)
    .mockReturnValueOnce(selectChain(opts.tickets ?? []) as never)
    .mockReturnValueOnce(selectChain(opts.videos ?? []) as never)
    .mockReturnValueOnce(selectChain(opts.direccion ?? [{ id: 1, teamRole: "ceo", role: "admin" }]) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkSlaBreaches", () => {
  it("no hace nada si nada está pasado de SLA", async () => {
    primeSelects({
      tasks: [{ id: 10, title: "Reciente", stage: "doing", stageSince: HOURS(2), assigneeId: 5 }],
    });
    const created = await checkSlaBreaches(NOW);
    expect(created).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("detecta tarea pasada de SLA, notifica al responsable y a la dirección, y registra en bitácora", async () => {
    primeSelects({
      tasks: [{ id: 10, title: "Atrasada", stage: "doing", stageSince: HOURS(72), assigneeId: 5 }],
    });
    vi.mocked(db.insert).mockReturnValueOnce(breachInsert([{ id: 1 }]) as never);

    const created = await checkSlaBreaches(NOW);
    expect(created).toBe(1);
    // responsable + CEO (id 1)
    expect(createNotification).toHaveBeenCalledTimes(2);
    const userIds = vi.mocked(createNotification).mock.calls.map(c => c[0].userId).sort();
    expect(userIds).toEqual([1, 5]);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "task",
      action: "status_change",
      detail: expect.objectContaining({ sla: "vencido", stage: "doing" }),
    }));
  });

  it("dispara UNA sola vez por episodio: si el insert conflictúa, no vuelve a notificar", async () => {
    primeSelects({
      tasks: [{ id: 10, title: "Atrasada", stage: "doing", stageSince: HOURS(72), assigneeId: 5 }],
    });
    vi.mocked(db.insert).mockReturnValueOnce(breachInsert([]) as never); // ON CONFLICT DO NOTHING

    const created = await checkSlaBreaches(NOW);
    expect(created).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("ticket sin responsable: notifica solo a la dirección", async () => {
    primeSelects({
      tickets: [{ id: 4, title: "Sin dueño", status: "abierto", updatedAt: HOURS(30), createdAt: HOURS(40), assignedTo: null }],
    });
    vi.mocked(db.insert).mockReturnValueOnce(breachInsert([{ id: 2 }]) as never);

    const created = await checkSlaBreaches(NOW);
    expect(created).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createNotification).mock.calls[0][0].userId).toBe(1);
  });

  it("el episodio del ticket se ancla a statusSince (no a ediciones/comentarios)", async () => {
    const since = HOURS(30);
    primeSelects({
      tickets: [{ id: 4, title: "T", status: "abierto", statusSince: since, createdAt: HOURS(90), assignedTo: 5 }],
    });
    const ins = breachInsert([{ id: 3 }]);
    vi.mocked(db.insert).mockReturnValueOnce(ins as never);

    await checkSlaBreaches(NOW);
    expect(ins.values).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "ticket",
      stageEnteredAt: new Date(since),
    }));
  });

  it("respeta maxHours = 0 como 'sin SLA'", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectChain([{ n: 1 }]) as never)
      .mockReturnValueOnce(selectChain([{ id: 1, entityType: "task", stage: "doing", maxHours: 0 }]) as never)
      .mockReturnValueOnce(selectChain([{ id: 10, title: "X", stage: "doing", stageSince: HOURS(999), assigneeId: 5 }]) as never)
      .mockReturnValueOnce(selectChain([]) as never)
      .mockReturnValueOnce(selectChain([]) as never)
      .mockReturnValueOnce(selectChain([{ id: 1, teamRole: "ceo", role: "admin" }]) as never);

    const created = await checkSlaBreaches(NOW);
    expect(created).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
