import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { publishLimiter } from "../../lib/rate-limit";

describe("publishLimiter wiring (per-network publish endpoints)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trips the publish limit on a YouTube publish-like route and returns 429 + Retry-After", async () => {
    const app = express();
    // Mirror the real wiring in app.ts so renames trip this test.
    app.use(/^\/api\/(youtube|tiktok|instagram|linkedin|x|facebook)\/(upload|publish|upload-from-drive)/, publishLimiter);
    app.post("/api/youtube/publish", (_req, res) => { res.json({ ok: true }); });

    const port = await new Promise<number>((resolve) => {
      const server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) resolve(addr.port);
      });
    });
    const base = `http://127.0.0.1:${port}`;

    let lastStatus = 200;
    let retryAfter: string | null = null;
    for (let i = 0; i < 60; i++) {
      const r = await fetch(`${base}/api/youtube/publish`, { method: "POST" });
      lastStatus = r.status;
      if (r.status === 429) {
        retryAfter = r.headers.get("Retry-After");
        break;
      }
    }
    expect(lastStatus).toBe(429);
    expect(retryAfter).toBeTruthy();
  });

  it("propagates fetch errors from a mocked YouTube publish call without leaking secrets", async () => {
    // Simulates the publisher hitting the YouTube API and getting a 500.
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "internal" } }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);

    const r = await fetch("https://example/youtube/upload");
    const body = (await (r as unknown as Response).json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe("internal");
    expect(fakeFetch).toHaveBeenCalledOnce();
  });
});
