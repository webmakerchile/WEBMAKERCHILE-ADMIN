import { describe, it, expect, vi, beforeEach } from "vitest";

const USERS = { __t: "users", id: "users.id" };
const HUB = { __t: "hub_state", userId: "hub_state.user_id" };

vi.mock("@workspace/db/schema", () => ({ users: USERS, hubState: HUB }));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), asc: (a: unknown) => a }));

const rows: { users: Record<string, unknown>[]; hub: Record<string, unknown>[] } = { users: [], hub: [] };

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    const data = () => (table === HUB ? rows.hub : rows.users);
    const chain: Record<string, unknown> = {};
    chain.where = () => chain;
    chain.limit = async () => data();
    chain.orderBy = async () => data();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(data());
    return chain;
  };
  return { db: { select: () => ({ from }) } };
});

const CEO = { id: 1, name: "CEO", email: "ceo@x.cl", role: "superadmin", teamRole: "reviewer" };
const DEV = { id: 4, name: "Dev", email: "dev@x.cl", role: "admin", teamRole: "dev" };
const CONTENT = { projects: [{ id: "p1" }], tasks: [{ id: "t1" }] };

describe("resolución del tablero compartido", () => {
  beforeEach(() => { rows.users = []; rows.hub = []; vi.clearAllMocks(); });

  it("usa la fila de la dirección cuando tiene datos", async () => {
    const { resolveBoard } = await import("./hub-board");
    rows.users = [CEO, DEV];
    rows.hub = [{ userId: 1, data: CONTENT, updatedAt: new Date("2026-07-01") }];
    const board = await resolveBoard();
    expect(board?.boardUserId).toBe(1);
    expect(board?.exists).toBe(true);
    expect(board?.owner?.email).toBe("ceo@x.cl");
  });

  it("adopta el tablero heredado si la dirección todavía no tiene el suyo", async () => {
    const { resolveBoard } = await import("./hub-board");
    // El Hub nació siendo por usuario: los datos reales están en otra fila.
    rows.users = [CEO, DEV];
    rows.hub = [{ userId: 4, data: CONTENT, updatedAt: new Date("2026-06-01") }];
    const board = await resolveBoard();
    expect(board?.boardUserId).toBe(4);
    expect(board?.data).toEqual(CONTENT);
    // El dueño sigue siendo la dirección aunque la fila sea de otro.
    expect(board?.owner?.id).toBe(1);
  });

  it("entre varios tableros heredados toma el más reciente", async () => {
    const { resolveBoard } = await import("./hub-board");
    rows.users = [CEO, DEV];
    rows.hub = [
      { userId: 4, data: { projects: [{ id: "viejo" }] }, updatedAt: new Date("2026-01-01") },
      { userId: 7, data: { projects: [{ id: "nuevo" }] }, updatedAt: new Date("2026-06-01") },
    ];
    const board = await resolveBoard();
    expect(board?.boardUserId).toBe(7);
  });

  it("una fila vacía de la dirección no tapa el tablero con datos", async () => {
    const { resolveBoard } = await import("./hub-board");
    rows.users = [CEO, DEV];
    rows.hub = [
      { userId: 1, data: { projects: [], tasks: [] }, updatedAt: new Date("2026-07-01") },
      { userId: 4, data: CONTENT, updatedAt: new Date("2026-01-01") },
    ];
    const board = await resolveBoard();
    expect(board?.boardUserId).toBe(4);
    expect(board?.data).toEqual(CONTENT);
  });

  it("sin tableros previos apunta a la fila de la dirección, todavía vacía", async () => {
    const { resolveBoard } = await import("./hub-board");
    rows.users = [CEO, DEV];
    const board = await resolveBoard();
    expect(board?.boardUserId).toBe(1);
    expect(board?.exists).toBe(false);
    expect(board?.version).toBe(0);
  });

  it("sin dirección definida no hay tablero al que escribir", async () => {
    const { resolveBoard } = await import("./hub-board");
    rows.users = [DEV];
    expect(await resolveBoard()).toBeNull();
  });
});
