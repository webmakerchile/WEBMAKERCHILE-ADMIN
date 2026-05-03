import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

const fakeVideo = {
  id: 42,
  title: "Demo",
  description: "base",
  tiktokDescription: null,
  instagramDescription: null,
  youtubeTitle: null,
  youtubeDescription: null,
  linkedinDescription: null,
  xDescription: null,
  facebookDescription: null,
};
const updates: Array<Record<string, unknown>> = [];
let videoExists = true;

vi.mock("@workspace/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => (videoExists ? [fakeVideo] : []),
        orderBy: () => ({ limit: async () => [] }),
      }),
      orderBy: () => ({ limit: async () => [] }),
    }),
  });
  const update = () => ({
    set: (data: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          updates.push(data);
          return [{ ...fakeVideo, ...data }];
        },
      }),
    }),
  });
  return { db: { select, update } };
});

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
    (req as Request & { user?: { id: number } }).user = { id: 1 };
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

describe("/api/content/videos/:id/generate-descriptions (handler-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    videoExists = true;
    process.env.OPENAI_API_KEY = "k";
  });

  it("404 when video does not exist", async () => {
    videoExists = false;
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/content/videos/42/generate-descriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(404);
  });

  it("200 persists generated descriptions and clamps x to 280 chars", async () => {
    const longTweet = "x".repeat(400);
    openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tiktok: "Hook tiktok",
              instagram: "IG copy",
              youtube: "YT copy",
              linkedin: "LI copy",
              x: longTweet,
            }),
          },
        },
      ],
    });
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/content/videos/42/generate-descriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: ["tiktok", "instagram", "youtube", "linkedin", "x"], force: true }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { descriptions: Record<string, string> };
    expect(body.descriptions.x.length).toBe(280);
    expect(updates.length).toBe(1);
    const u = updates[0];
    expect(u.tiktokDescription).toBe("Hook tiktok");
    expect(u.instagramDescription).toBe("IG copy");
    expect(u.youtubeTitle).toBe("Demo");
    expect(u.youtubeDescription).toBe("YT copy");
    expect(u.linkedinDescription).toBe("LI copy");
    expect((u.xDescription as string).length).toBe(280);
  });

  it("502 when AI returns non-JSON garbage", async () => {
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "no json here at all" } }],
    });
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/content/videos/42/generate-descriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: ["tiktok"], force: true }),
    });
    expect(r.status).toBe(502);
  });

  it("502 without leaking provider error detail when OpenAI throws", async () => {
    openaiCreate.mockRejectedValueOnce(new Error("OPENAI_INTERNAL: token=secret123"));
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/content/videos/42/generate-descriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: ["tiktok"], force: true }),
    });
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error?: string };
    expect(JSON.stringify(body)).not.toContain("secret123");
  });

  it("200 with skipped:true when all targets already have content and force=false", async () => {
    fakeVideo.tiktokDescription = "ya hay" as unknown as null;
    const port = await start(await buildApp());
    const r = await fetch(`http://127.0.0.1:${port}/api/content/videos/42/generate-descriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: ["tiktok"], force: false }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { skipped?: boolean };
    expect(body.skipped).toBe(true);
    expect(openaiCreate).not.toHaveBeenCalled();
    fakeVideo.tiktokDescription = null;
  });
});
