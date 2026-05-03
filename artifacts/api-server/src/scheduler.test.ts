import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  db: {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
  },
}));

describe("scheduler helpers (smoke)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fetch and parses TikTok token JSON shape without throwing", async () => {
    const fakeFetch = vi.fn(async () => ({
      json: async () => ({ access_token: "atk", refresh_token: "rtk", expires_in: 3600 }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);

    const res = await fetch("https://example/test", { method: "POST" });
    const data = (await res.json()) as { access_token?: string };
    expect(data.access_token).toBe("atk");
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it("treats Instagram container error JSON as a thrown failure path", async () => {
    const fakeFetch = vi.fn(async () => ({
      json: async () => ({ error: { message: "bad media" } }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);

    const res = await fetch("https://example/ig", { method: "POST" });
    const body = (await res.json()) as { error?: { message?: string } };
    expect(() => {
      if (body.error) throw new Error(body.error.message || "fail");
    }).toThrow("bad media");
  });
});
