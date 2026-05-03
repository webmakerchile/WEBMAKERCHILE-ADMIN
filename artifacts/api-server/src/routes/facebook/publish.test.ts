import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: {}, videos: {} }));
vi.mock("../../lib/connections", () => ({ clearNetworkRevoked: vi.fn() }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: () => ({ files: { get: vi.fn() } }) } }));

const userWithPage = {
  id: 1,
  facebookPageId: "page-123",
  facebookPageAccessToken: "user-page-token",
};

describe("publishToFacebook (text-post path: no videoFileDriveId)", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns 'Facebook no conectado' when neither env nor user has tokens", async () => {
    // Hard-stub fetch so a misconfigured boot env can never reach the real
    // Graph API from a test runner. Also assert it was NOT called.
    const fetchSpy = vi.fn(async () => {
      throw new Error("network access not allowed in this test");
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const orig = { id: process.env.FACEBOOK_PAGE_ID, tok: process.env.FACEBOOK_PAGE_ACCESS_TOKEN };
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    vi.resetModules();
    try {
      const { publishToFacebook } = await import("./index");
      const r = await publishToFacebook({ id: 1 }, { description: "x" });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Facebook no conectado/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (orig.id !== undefined) process.env.FACEBOOK_PAGE_ID = orig.id;
      if (orig.tok !== undefined) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = orig.tok;
      vi.resetModules();
    }
  });

  it("returns 'Sin texto' when no caption can be derived", async () => {
    const { publishToFacebook } = await import("./index");
    const r = await publishToFacebook(userWithPage, { description: "  ", title: "" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Sin texto/);
  });

  it("publishes a text post and returns the page-feed post id on 200", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ id: "page-123_555" }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishToFacebook } = await import("./index");
    const r = await publishToFacebook(userWithPage, {
      description: "Hola Facebook",
      videoFileDriveId: null,
    });
    expect(r.success).toBe(true);
    expect(r.postId).toBe("page-123_555");
    // Env-captured SERVER_FB_PAGE_ID may override the user-fallback page id,
    // so just assert the call hit the page feed graph endpoint.
    const calls = fetchSpy.mock.calls as unknown as Array<[string, { body?: string }]>;
    const url = String(calls[0][0]);
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/[^/]+\/feed$/);
    const body = String(calls[0][1]?.body ?? "");
    expect(body).toContain("message=Hola+Facebook");
  });

  it("returns the FB error message on 4xx", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false, status: 400,
      json: async () => ({ error: { message: "Invalid OAuth" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { publishToFacebook } = await import("./index");
    const r = await publishToFacebook(userWithPage, {
      description: "x",
      videoFileDriveId: null,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe("Invalid OAuth");
  });
});
