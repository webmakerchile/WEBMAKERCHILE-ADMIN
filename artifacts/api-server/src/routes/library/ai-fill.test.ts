import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

const dbState: { brandTone: { tone: string | null } | null } = { brandTone: { tone: null } };
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (dbState.brandTone ? [dbState.brandTone] : [])),
        })),
        orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
      })),
    })),
  },
}));

vi.mock("@workspace/integrations-gemini-ai", () => ({ ai: {} }));

const openaiCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

async function buildApp() {
  const mod = await import("./index");
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: 7 };
    next();
  });
  app.use("/api", mod.default);
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

describe("/api/library/templates/ai-fill (handler-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  });

  it("400 when no networks selected", async () => {
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/library/templates/ai-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "promo", networks: [] }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toMatch(/red activa/i);
  });

  it("400 when no name nor base provided", async () => {
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/library/templates/ai-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ networks: ["tiktok"] }),
    });
    expect(r.status).toBe(400);
  });

  it("200 returns sanitized fields filtered to expected keys", async () => {
    openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tiktokDescription: "Hook potente! #demo",
              instagramDescription: "Inspírate hoy ✨",
              xDescription: "  trim me  ",
              extraGarbage: "should be dropped",
            }),
          },
        },
      ],
    });
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/library/templates/ai-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "promo otoño",
        base: "Lanzamos colección nueva",
        networks: ["tiktok", "instagram", "x"],
      }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { fields: Record<string, string>; model: string };
    expect(body.fields.tiktokDescription).toBe("Hook potente! #demo");
    expect(body.fields.instagramDescription).toBe("Inspírate hoy ✨");
    expect(body.fields.xDescription).toBe("trim me");
    expect(body.fields.extraGarbage).toBeUndefined();
    expect(typeof body.model).toBe("string");
  });

  it("200 recovers fields when AI wraps JSON in extra text", async () => {
    openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              'Sure! Here you go:\n```json\n{"tiktokDescription":"Hola"}\n```\nCheers',
          },
        },
      ],
    });
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/library/templates/ai-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", networks: ["tiktok"] }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { fields: Record<string, string> };
    expect(body.fields.tiktokDescription).toBe("Hola");
  });

  it("502 (without leaking error detail) when OpenAI throws", async () => {
    openaiCreate.mockRejectedValueOnce(new Error("internal openai key leaked!!!"));
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/library/templates/ai-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", networks: ["tiktok"] }),
    });
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toMatch(/no se pudo generar/i);
    expect(JSON.stringify(body)).not.toContain("openai key leaked");
  });
});
