import { describe, it, expect } from "vitest";
import express from "express";
import { aiLimiter } from "./rate-limit";

describe("rate-limit middleware", () => {
  it("returns 429 with Retry-After after exceeding the limit on AI routes including content/hashtag-suggestions", async () => {
    const app = express();
    // Mirror the real wiring in app.ts so a route rename trips this test.
    app.use(/^\/api\/(library\/templates\/ai-fill|content\/videos\/[^/]+\/generate-descriptions|content\/videos\/bulk-generate-descriptions|analytics\/insights|content\/hashtag-suggestions)/, aiLimiter);
    app.post("/api/content/hashtag-suggestions", (_req, res) => { res.json({ ok: true }); });
    app.get("/x", aiLimiter, (_req, res) => { res.json({ ok: true }); });

    const port = await new Promise<number>((resolve) => {
      const server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) resolve(addr.port);
      });
    });
    const base = `http://127.0.0.1:${port}`;
    let lastStatus = 200;
    let retryAfter: string | null = null;
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${base}/api/content/hashtag-suggestions`, { method: "POST" });
      lastStatus = r.status;
      if (r.status === 429) {
        retryAfter = r.headers.get("Retry-After");
        break;
      }
    }
    expect(lastStatus).toBe(429);
    expect(retryAfter).toBeTruthy();
  });
});
