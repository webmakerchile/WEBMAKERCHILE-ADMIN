import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: {}, videos: {} }));
vi.mock("../../lib/connections", () => ({ clearNetworkRevoked: vi.fn() }));

const validUser = {
  id: 1,
  xAccessToken: "tok-x-1",
  xTokenExpiresAt: new Date(Date.now() + 3600_000),
};

describe("publishXPost", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns success + postId from data.data.id on 201", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true, status: 201,
      json: async () => ({ data: { id: "1234567890" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishXPost } = await import("./index");
    const r = await publishXPost(validUser, "hola desde el test");
    expect(r.success).toBe(true);
    expect(r.postId).toBe("1234567890");
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { body?: string }]>;
    const body = JSON.parse(String(calls[0][1]?.body ?? "{}"));
    expect(body.text).toBe("hola desde el test");
  });

  it("clamps content to 280 chars before posting", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true, status: 201,
      json: async () => ({ data: { id: "x" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const long = "a".repeat(500);

    const { publishXPost } = await import("./index");
    await publishXPost(validUser, long);
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { body?: string }]>;
    const body = JSON.parse(String(calls[0][1]?.body ?? "{}"));
    expect(body.text.length).toBe(280);
  });

  it("returns the API error message on 4xx", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false, status: 403,
      json: async () => ({ errors: [{ message: "Duplicate content" }] }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishXPost } = await import("./index");
    const r = await publishXPost(validUser, "hola");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Duplicate content");
  });

  it("returns error on empty content (after trim)", async () => {
    const { publishXPost } = await import("./index");
    const r = await publishXPost(validUser, "   ");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Empty/);
  });

  it("returns error when user has no token", async () => {
    const { publishXPost } = await import("./index");
    const r = await publishXPost({ id: 1 }, "hola");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No X token/);
  });

  it("returns error when fetch throws", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ETIMEDOUT"); }) as unknown as typeof fetch;
    const { publishXPost } = await import("./index");
    const r = await publishXPost(validUser, "hola");
    expect(r.success).toBe(false);
    expect(r.error).toBe("ETIMEDOUT");
  });
});
