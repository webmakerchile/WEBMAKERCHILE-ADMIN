import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./brand-tone", () => ({
  buildBrandToneSuffix: async () => "",
}));

import {
  pickEffectiveTargets,
  parseAIResponse,
  applyLengthClamps,
  buildUpdateData,
  generateDescriptionsForVideo,
  type DescVideo,
} from "./generate-descriptions";

const baseVideo: DescVideo = {
  id: 1,
  title: "Hola Chile",
  description: "Video de prueba",
};

describe("generate-descriptions helpers", () => {
  describe("pickEffectiveTargets", () => {
    it("defaults to all when requested is empty (force=false skips already-set)", () => {
      const v: DescVideo = { ...baseVideo, tiktokDescription: "ya", linkedinDescription: "puesta" };
      const t = pickEffectiveTargets(v, undefined, false);
      expect(t).not.toContain("tiktok");
      expect(t).not.toContain("linkedin");
      expect(t).toContain("instagram");
    });
    it("force=true keeps everything requested", () => {
      const v: DescVideo = { ...baseVideo, tiktokDescription: "ya" };
      const t = pickEffectiveTargets(v, ["tiktok", "x"], true);
      expect(t).toEqual(["tiktok", "x"]);
    });
    it("filters out unknown platform names", () => {
      const t = pickEffectiveTargets(baseVideo, ["tiktok", "myspace"], true);
      expect(t).toEqual(["tiktok"]);
    });
  });

  describe("parseAIResponse", () => {
    it("parses raw JSON", () => {
      expect(parseAIResponse('{"x":"hi"}')).toEqual({ x: "hi" });
    });
    it("strips ```json fences", () => {
      expect(parseAIResponse('```json\n{"x":"hi"}\n```')).toEqual({ x: "hi" });
    });
    it("recovers JSON embedded in prose", () => {
      expect(parseAIResponse('claro!\n{"x":"hi"}\nlisto')).toEqual({ x: "hi" });
    });
    it("returns null on garbage", () => {
      expect(parseAIResponse("nada de json aquí")).toBeNull();
    });
  });

  describe("applyLengthClamps", () => {
    it("clamps x to 280 and facebook to 500", () => {
      const big = "a".repeat(900);
      const out = applyLengthClamps({ x: big, facebook: big });
      expect(out.x!.length).toBe(280);
      expect(out.facebook!.length).toBe(500);
    });
  });

  describe("buildUpdateData", () => {
    it("sets youtubeTitle from base title when not present", () => {
      const out = buildUpdateData(baseVideo, { youtube: "desc" }, ["youtube"]);
      expect(out.youtubeTitle).toBe("Hola Chile");
      expect(out.youtubeDescription).toBe("desc");
    });
    it("does not overwrite existing youtubeTitle", () => {
      const v: DescVideo = { ...baseVideo, youtubeTitle: "manual" };
      const out = buildUpdateData(v, { youtube: "desc" }, ["youtube"]);
      expect(out.youtubeTitle).toBeUndefined();
    });
    it("only writes platforms in effectiveTargets", () => {
      const out = buildUpdateData(baseVideo, { tiktok: "tt", x: "xx" }, ["tiktok"]);
      expect(out.tiktokDescription).toBe("tt");
      expect(out.xDescription).toBeUndefined();
    });
  });
});

describe("generateDescriptionsForVideo (with mocked OpenAI)", () => {
  const makeClient = (content: string) => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  });

  beforeEach(() => vi.clearAllMocks());

  it("returns 200 + descriptions + updateData on a clean JSON reply", async () => {
    const client = makeClient(JSON.stringify({ tiktok: "tt", x: "xx" }));
    const r = await generateDescriptionsForVideo(baseVideo, ["tiktok", "x"], true, null, client);
    expect(r.status).toBe(200);
    if (r.status !== 200 || "skipped" in r) throw new Error("unexpected");
    expect(r.descriptions.tiktok).toBe("tt");
    expect(r.updateData.tiktokDescription).toBe("tt");
    expect(r.updateData.xDescription).toBe("xx");
  });

  it("returns 502 when OpenAI returns garbage", async () => {
    const client = makeClient("no es json para nada");
    const r = await generateDescriptionsForVideo(baseVideo, ["tiktok"], true, null, client);
    expect(r.status).toBe(502);
    if (r.status !== 502) throw new Error("unexpected");
    expect(r.error).toMatch(/JSON válido/i);
  });

  it("returns 502 with safe message when OpenAI throws", async () => {
    const client = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error("rate limited by upstream")) } },
    };
    const r = await generateDescriptionsForVideo(baseVideo, ["tiktok"], true, null, client);
    expect(r.status).toBe(502);
    if (r.status !== 502) throw new Error("unexpected");
    expect(r.error).not.toContain("rate limited");
  });

  it("short-circuits with skipped=true when nothing to generate", async () => {
    const v: DescVideo = { ...baseVideo, tiktokDescription: "ya" };
    const client = makeClient("{}");
    const r = await generateDescriptionsForVideo(v, ["tiktok"], false, null, client);
    expect(r.status).toBe(200);
    expect("skipped" in r && r.skipped).toBe(true);
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it("clamps x output to 280 chars", async () => {
    const big = "y".repeat(500);
    const client = makeClient(JSON.stringify({ x: big }));
    const r = await generateDescriptionsForVideo(baseVideo, ["x"], true, null, client);
    if (r.status !== 200 || "skipped" in r) throw new Error("unexpected");
    expect((r.descriptions.x as string).length).toBe(280);
  });
});
