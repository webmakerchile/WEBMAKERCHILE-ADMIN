import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./discord", () => ({
  sendDirectMessage: vi.fn().mockResolvedValue(true),
}));

import { db } from "@workspace/db";
import { sendDirectMessage } from "./discord";
import { createNotification, notifyCeos, sendDiscordDm } from "./notifications";

/** Thenable select chain que resuelve a `rows`. */
function makeSelectChain(rows: unknown[]) {
  const then = (resolve: (v: unknown) => void) => resolve(rows);
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then,
  } as Record<string, unknown>;
}

function mockInsertReturning(row: unknown) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([row]),
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendDirectMessage).mockResolvedValue(true);
});

describe("sendDiscordDm", () => {
  it("envía DM cuando hay Discord vinculado y la preferencia está activa", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ discordUserId: "d1", notifyDiscord: true }]) as never);
    const ok = await sendDiscordDm(7, "Título", "Cuerpo", "/tickets?id=3");
    expect(ok).toBe(true);
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    const [dId, content] = vi.mocked(sendDirectMessage).mock.calls[0]!;
    expect(dId).toBe("d1");
    expect(content).toContain("Título");
    expect(content).toContain("Cuerpo");
  });

  it("NO envía DM si la preferencia está desactivada", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ discordUserId: "d1", notifyDiscord: false }]) as never);
    const ok = await sendDiscordDm(7, "Título");
    expect(ok).toBe(false);
    expect(sendDirectMessage).not.toHaveBeenCalled();
  });

  it("NO envía DM si no hay cuenta de Discord vinculada", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ discordUserId: null, notifyDiscord: true }]) as never);
    const ok = await sendDiscordDm(7, "Título");
    expect(ok).toBe(false);
    expect(sendDirectMessage).not.toHaveBeenCalled();
  });
});

describe("createNotification", () => {
  it("la notificación del panel se crea aunque el DM de Discord falle", async () => {
    mockInsertReturning({ id: 1, userId: 7, title: "Hola", body: null, link: null });
    // Falla la consulta de usuario para el DM Y el push (select), pero el insert ya ocurrió.
    vi.mocked(db.select).mockImplementation(() => { throw new Error("db down for select"); });
    const row = await createNotification({ userId: 7, type: "system", title: "Hola", push: false });
    expect(row.id).toBe(1);
  });

  it("hace fan-out al DM de Discord cuando corresponde", async () => {
    mockInsertReturning({ id: 2, userId: 7, title: "Aviso", body: "Detalle", link: "/metas" });
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ discordUserId: "d9", notifyDiscord: true }]) as never);
    await createNotification({ userId: 7, type: "system", title: "Aviso", body: "Detalle", link: "/metas", push: false });
    // El DM es fire-and-forget: dale un tick al event loop.
    await new Promise((r) => setImmediate(r));
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});

describe("notifyCeos", () => {
  it("notifica a cada CEO aprobado y omite ventas/tester/pendientes", async () => {
    const team = [
      { id: 1, role: "superadmin", teamRole: "ceo", approvalStatus: "approved" },
      { id: 4, role: "admin", teamRole: "ventas", approvalStatus: "approved" },
      { id: 5, role: "admin", teamRole: "ceo", approvalStatus: "pending" },
      { id: 2, role: "admin", teamRole: "tester", approvalStatus: "approved" },
    ];
    vi.mocked(db.select).mockReturnValue(makeSelectChain(team) as never);
    mockInsertReturning({ id: 11, userId: 1, title: "Nuevo contrato: X", body: null, link: "/contratos" });
    const sent = await notifyCeos({ title: "Nuevo contrato: X", link: "/contratos", excludeUserId: 4 });
    expect(sent).toBe(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("excludeUserId evita que la dirección se auto-avise", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ id: 1, role: "superadmin", teamRole: "ceo", approvalStatus: "approved" }]) as never,
    );
    const sent = await notifyCeos({ title: "t", excludeUserId: 1 });
    expect(sent).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
