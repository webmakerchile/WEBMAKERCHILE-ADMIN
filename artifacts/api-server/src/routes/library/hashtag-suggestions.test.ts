import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => []), limit: vi.fn(async () => []) })),
    })),
  },
}));

vi.mock("../../lib/brand-tone", () => ({
  buildBrandToneSuffix: vi.fn(async () => ""),
}));

vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: {
    models: {
      generateContent: vi.fn(async () => ({
        text: '["webdev","chile","tipsdevs","tech","react","node","typescript","frontend","fullstack","webmakers"]',
      })),
    },
  },
}));

describe("POST /api/content/hashtag-suggestions (real handler)", () => {
  beforeEach(() => vi.clearAllMocks());

  async function buildApp() {
    const router = (await import("./index")).default;
    const app = express();
    app.use(express.json());
    // Inject a fake authenticated user before mounting the real router.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: { id: number } }).user = { id: 42 };
      next();
    });
    app.use("/api", router);
    return app;
  }

  it("returns 400 when neither title nor description is provided", async () => {
    const app = await buildApp();
    const port = await new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const a = s.address();
        if (typeof a === "object" && a) resolve(a.port);
      });
    });
    const r = await fetch(`http://127.0.0.1:${port}/api/content/hashtag-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: "instagram" }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toMatch(/título|descripción/i);
  });

  it("returns sanitized hashtag suggestions on success and falls back to instagram for unknown networks", async () => {
    const app = await buildApp();
    const port = await new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const a = s.address();
        if (typeof a === "object" && a) resolve(a.port);
      });
    });
    const r = await fetch(`http://127.0.0.1:${port}/api/content/hashtag-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Como hacer un sitio web", network: "myspace" }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { network: string; suggestions: string[] };
    expect(body.network).toBe("instagram");
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBe(10);
    expect(body.suggestions.every((h) => typeof h === "string" && !h.includes(" "))).toBe(true);
  });

  it("returns 500 with a JSON error when the AI call throws", async () => {
    const gemini = await import("@workspace/integrations-gemini-ai");
    vi.mocked(gemini.ai.models.generateContent).mockRejectedValueOnce(new Error("AI down"));
    const app = await buildApp();
    const port = await new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const a = s.address();
        if (typeof a === "object" && a) resolve(a.port);
      });
    });
    const r = await fetch(`http://127.0.0.1:${port}/api/content/hashtag-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", network: "tiktok" }),
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toBe("AI down");
  });
});
