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
  linkedinAccessToken: "tok-1",
  linkedinTokenExpiresAt: new Date(Date.now() + 3600_000),
  linkedinPersonUrn: "urn:li:person:abc",
};

describe("publishLinkedInPost", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns success + postId from x-restli-id when /rest/posts is 201", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: (k: string) => (k.toLowerCase() === "x-restli-id" ? "urn:li:share:999" : null) },
      text: async () => "",
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishLinkedInPost } = await import("./index");
    const r = await publishLinkedInPost(validUser, "Hola mundo");
    expect(r.success).toBe(true);
    expect(r.postId).toBe("urn:li:share:999");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calls = fetchSpy.mock.calls as unknown as Array<[string, unknown]>;
    expect(String(calls[0][0])).toContain("/rest/posts");
  });

  it("falls back to /v2/ugcPosts on 500 from /rest/posts", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => "down",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: { get: (k: string) => (k.toLowerCase() === "x-restli-id" ? "urn:li:share:legacy" : null) },
        json: async () => ({ id: "urn:li:share:legacy" }),
        text: async () => "",
      });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishLinkedInPost } = await import("./index");
    const r = await publishLinkedInPost(validUser, "Hola");
    expect(r.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const calls2 = fetchSpy.mock.calls as unknown as Array<[string, unknown]>;
    expect(String(calls2[1][0])).toContain("/v2/ugcPosts");
  });

  it("returns error when user has no token", async () => {
    const { publishLinkedInPost } = await import("./index");
    const r = await publishLinkedInPost({ id: 1 }, "x");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No LinkedIn token/);
  });

  it("returns error when person URN is missing", async () => {
    const { publishLinkedInPost } = await import("./index");
    const r = await publishLinkedInPost(
      { ...validUser, linkedinPersonUrn: null },
      "x",
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/person URN/);
  });

  it("returns error when fetch throws (network down)", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const { publishLinkedInPost } = await import("./index");
    const r = await publishLinkedInPost(validUser, "x");
    expect(r.success).toBe(false);
    expect(r.error).toBe("ECONNRESET");
  });
});
