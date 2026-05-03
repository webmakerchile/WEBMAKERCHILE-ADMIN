import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: {}, videos: {} }));
vi.mock("./temp-serve", () => ({
  registerTempFile: vi.fn(), unregisterTempFile: vi.fn(),
}));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: () => ({}) } }));

async function buildApp() {
  const mod = await import("./index");
  const app = express();
  app.use("/api", mod.default);
  return app;
}

function start(app: express.Express): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve({ port: a.port, close: () => s.close() });
    });
  });
}

/** Forward localhost requests; intercept only graph.facebook.com calls. */
function installIgFetchSpy(realFetch: typeof globalThis.fetch, response: unknown) {
  const spy = vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u.includes("graph.facebook.com")) {
      if (response instanceof Error) throw response;
      return response as Response;
    }
    return realFetch(url as Parameters<typeof fetch>[0], init as RequestInit | undefined);
  });
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe("GET /api/instagram/status", () => {
  let realFetch: typeof globalThis.fetch;
  let originalEnv: { token?: string; userId?: string };
  beforeEach(() => {
    realFetch = globalThis.fetch;
    originalEnv = {
      token: process.env.INSTAGRAM_ACCESS_TOKEN,
      userId: process.env.INSTAGRAM_USER_ID,
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (originalEnv.token !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = originalEnv.token;
    if (originalEnv.userId !== undefined) process.env.INSTAGRAM_USER_ID = originalEnv.userId;
    else delete process.env.INSTAGRAM_USER_ID;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns connected:false without calling Graph API when env credentials are missing", async () => {
    const spy = installIgFetchSpy(realFetch, new Error("network not allowed"));

    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_USER_ID;
    vi.resetModules();
    const { port, close } = await start(await buildApp());
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/instagram/status`);
      const body = await r.json() as { connected: boolean; message?: string };
      expect(r.status).toBe(200);
      expect(body.connected).toBe(false);
      expect(body.message).toMatch(/Credenciales de Instagram no configuradas/);
      const igCalls = spy.mock.calls.filter((c) => String(c[0]).includes("graph.facebook.com"));
      expect(igCalls.length).toBe(0);
    } finally { close(); }
  });

  it("surfaces Graph API error.message when the IG check returns an error payload", async () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = "ig-tok";
    process.env.INSTAGRAM_USER_ID = "9999";
    vi.resetModules();

    const spy = installIgFetchSpy(realFetch, {
      ok: true, status: 200,
      json: async () => ({ error: { message: "Invalid OAuth access token." } }),
    });

    const { port, close } = await start(await buildApp());
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/instagram/status`);
      const body = await r.json() as { connected: boolean; message?: string };
      expect(r.status).toBe(200);
      expect(body.connected).toBe(false);
      expect(body.message).toBe("Invalid OAuth access token.");
      const igCalls = spy.mock.calls.filter((c) => String(c[0]).includes("graph.facebook.com"));
      expect(igCalls.length).toBe(1);
    } finally { close(); }
  });
});
