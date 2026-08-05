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

// Bug real de producción: el intento v2 falló con 400 en INIT (no 403/404), y
// el código solo reintentaba por v1.1 ante 403/404, así que la publicación con
// video en X quedaba fallando siempre aunque v1.1 sí funciona en el plan actual.
describe("publishXTweetWithVideo", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  const videoBuffer = Buffer.from("fake-video-bytes");

  it("falls back to v1.1 when v2 INIT fails with an unexpected 400 (not just 403/404)", async () => {
    const fetchSpy = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.startsWith("https://api.x.com/2/media/upload")) {
        return { ok: false, status: 400, text: async () => "Bad Request" };
      }
      if (u.startsWith("https://upload.twitter.com/1.1/media/upload.json")) {
        if (u.includes("command=FINALIZE")) {
          return { ok: true, status: 200, json: async () => ({ data: { id: "v1-media-1" } }) };
        }
        if (u.includes("command=INIT")) {
          return { ok: true, status: 200, json: async () => ({ media_id_string: "v1-media-1" }) };
        }
        // APPEND: bare URL (no query string), FormData body.
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.startsWith("https://api.twitter.com/2/tweets")) {
        return { ok: true, status: 201, json: async () => ({ data: { id: "tweet-1" } }) };
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishXTweetWithVideo } = await import("./index");
    const r = await publishXTweetWithVideo(validUser, "un video", videoBuffer);
    expect(r.success).toBe(true);
    expect(r.postId).toBe("tweet-1");
    const calledV1 = (fetchSpy.mock.calls as unknown as Array<[string]>).some((c) =>
      String(c[0]).startsWith("https://upload.twitter.com"),
    );
    expect(calledV1).toBe(true);
  });

  it("returns one combined, clear error when both v2 and v1.1 fail", async () => {
    const fetchSpy = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.startsWith("https://api.x.com/2/media/upload")) {
        return { ok: false, status: 400, text: async () => "v2 broken" };
      }
      if (u.startsWith("https://upload.twitter.com/1.1/media/upload.json")) {
        return { ok: false, status: 401, text: async () => "v1 unauthorized" };
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishXTweetWithVideo } = await import("./index");
    const r = await publishXTweetWithVideo(validUser, "un video", videoBuffer);
    expect(r.success).toBe(false);
    expect(r.error).toContain("400");
    expect(r.error).toContain("401");
  });

  it("does not fall back when v2 succeeds outright", async () => {
    const fetchSpy = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.startsWith("https://api.x.com/2/media/upload")) {
        if (u.includes("command=FINALIZE")) {
          return { ok: true, status: 200, json: async () => ({ data: { id: "v2-media-1" } }) };
        }
        if (u.includes("command=INIT")) {
          return { ok: true, status: 200, json: async () => ({ data: { id: "v2-media-1" } }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.startsWith("https://api.twitter.com/2/tweets")) {
        return { ok: true, status: 201, json: async () => ({ data: { id: "tweet-2" } }) };
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishXTweetWithVideo } = await import("./index");
    const r = await publishXTweetWithVideo(validUser, "un video", videoBuffer);
    expect(r.success).toBe(true);
    const calledV1 = (fetchSpy.mock.calls as unknown as Array<[string]>).some((c) =>
      String(c[0]).startsWith("https://upload.twitter.com"),
    );
    expect(calledV1).toBe(false);
  });
});
