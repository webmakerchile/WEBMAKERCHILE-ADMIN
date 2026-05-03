import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: {}, videos: {} }));
vi.mock("../../lib/connections", () => ({ clearNetworkRevoked: vi.fn() }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: () => ({}) } }));

async function buildApp(user: Record<string, unknown>) {
  const mod = await import("./index");
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: Record<string, unknown> }).user = user;
    next();
  });
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

/**
 * Install a fetch spy that ONLY intercepts TikTok API calls. Any other
 * request (e.g. the test client connecting to its own express server on
 * 127.0.0.1) is forwarded to the real fetch so the test request itself
 * is not interfered with.
 */
function installTikTokFetchSpy(realFetch: typeof globalThis.fetch, response: unknown) {
  const spy = vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u.includes("open.tiktokapis.com")) {
      if (response instanceof Error) throw response;
      return response as Response;
    }
    return realFetch(url as Parameters<typeof fetch>[0], init as RequestInit | undefined);
  });
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe("GET /api/tiktok/status", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns connected:false when the user has no TikTok credentials (no API call)", async () => {
    const spy = installTikTokFetchSpy(realFetch, new Error("network not allowed"));
    const { port, close } = await start(await buildApp({ id: 1 }));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/tiktok/status`);
      const body = await r.json() as { connected: boolean; message?: string };
      expect(r.status).toBe(200);
      expect(body.connected).toBe(false);
      expect(body.message).toMatch(/TikTok no conectado/);
      const tiktokCalls = spy.mock.calls.filter((c) => String(c[0]).includes("open.tiktokapis.com"));
      expect(tiktokCalls.length).toBe(0);
    } finally { close(); }
  });

  it("returns connected:true with profile when the TikTok user-info endpoint responds OK", async () => {
    installTikTokFetchSpy(realFetch, {
      ok: true, status: 200,
      json: async () => ({
        data: { user: { open_id: "abc", display_name: "Demo", avatar_url: "https://x/y.png" } },
      }),
    });

    const { port, close } = await start(await buildApp({
      id: 1,
      tiktokAccessToken: "tt-token",
      tiktokOpenId: "abc",
      tiktokTokenExpiresAt: new Date(Date.now() + 3600_000),
    }));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/tiktok/status`);
      const body = await r.json() as { connected: boolean; user: { openId: string; displayName: string } };
      expect(r.status).toBe(200);
      expect(body.connected).toBe(true);
      expect(body.user.openId).toBe("abc");
      expect(body.user.displayName).toBe("Demo");
    } finally { close(); }
  });
});
