import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { aiLimiter } from "../../lib/rate-limit";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => []), limit: vi.fn(async () => []) })),
    })),
  },
}));

describe("AI rate-limit covers analytics insights and gemini AI routes", () => {
  beforeEach(() => vi.restoreAllMocks());

  async function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: number } }).user = { id: 7 };
      next();
    });
    // Mirror the real wiring in app.ts so a route rename trips this test.
    app.use(/^\/api\/(library\/templates\/ai-fill|content\/videos\/[^/]+\/generate-descriptions|content\/videos\/bulk-generate-descriptions|analytics\/insights|content\/hashtag-suggestions|gemini\/conversations\/[^/]+\/messages|gemini\/generate-image|gemini\/generate-cover|studio\/(generate-ideas|generate-descriptions|cover-generator))/, aiLimiter);
    app.get("/api/analytics/insights", (_req, res) => res.json({ ok: true }));
    app.post("/api/gemini/generate-image", (_req, res) => res.json({ ok: true }));
    app.post("/api/gemini/conversations/abc-123/messages", (_req, res) => res.json({ ok: true }));
    return app;
  }

  async function start(app: express.Express) {
    return new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const a = s.address();
        if (typeof a === "object" && a) resolve(a.port);
      });
    });
  }

  it("trips on /api/analytics/insights", async () => {
    const port = await start(await buildApp());
    let last = 200;
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/api/analytics/insights`);
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it("trips on /api/gemini/generate-image", async () => {
    const port = await start(await buildApp());
    let last = 200;
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/api/gemini/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it("trips on /api/gemini/conversations/:id/messages", async () => {
    const port = await start(await buildApp());
    let last = 200;
    for (let i = 0; i < 25; i++) {
      const r = await fetch(
        `http://127.0.0.1:${port}/api/gemini/conversations/abc-123/messages`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
