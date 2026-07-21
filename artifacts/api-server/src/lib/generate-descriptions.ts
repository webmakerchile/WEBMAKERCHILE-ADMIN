import { buildBrandToneSuffix } from "./brand-tone";
import { BRAND_NAME, PLATFORM_GUIDES, PLATFORM_LIMITS } from "./platform-guides";

export type DescTargets = "tiktok" | "instagram" | "youtube" | "linkedin" | "x" | "facebook";

export type DescVideo = {
  id: number;
  title: string;
  description?: string | null;
  tiktokDescription?: string | null;
  instagramDescription?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  linkedinDescription?: string | null;
  xDescription?: string | null;
  facebookDescription?: string | null;
};

export type GeneratedDescriptions = Partial<Record<DescTargets, string>>;

export type DescResult =
  | { status: 200; descriptions: GeneratedDescriptions; effectiveTargets: DescTargets[]; updateData: Record<string, unknown> }
  | { status: 200; skipped: true; descriptions: Record<string, never> }
  | { status: 502; error: string };

type OpenAILike = {
  chat: { completions: { create: (req: unknown) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }> } };
};

// Guías compartidas con el generador de comunidad (ver lib/platform-guides.ts).
const GUIDES: Record<DescTargets, string> = PLATFORM_GUIDES;

const ALL_TARGETS: DescTargets[] = ["tiktok", "instagram", "youtube", "linkedin", "x", "facebook"];

export function pickEffectiveTargets(video: DescVideo, requested: string[] | undefined, force: boolean): DescTargets[] {
  const targets: DescTargets[] = (Array.isArray(requested) && requested.length
    ? (requested.filter((p) => typeof p === "string") as DescTargets[])
    : ALL_TARGETS).filter((t) => t in GUIDES);
  if (force) return targets;
  return targets.filter((t) => {
    if (t === "tiktok") return !video.tiktokDescription;
    if (t === "instagram") return !video.instagramDescription;
    if (t === "youtube") return !video.youtubeTitle && !video.youtubeDescription;
    if (t === "linkedin") return !video.linkedinDescription;
    if (t === "x") return !video.xDescription;
    if (t === "facebook") return !video.facebookDescription;
    return true;
  });
}

export function buildPrompt(video: DescVideo, wanted: DescTargets[], toneSuffix: string): string {
  const baseInfo = `Título: "${video.title}"\nDescripción base: "${video.description || ""}"`;
  return `Eres un copywriter experto para ${BRAND_NAME} (emprendimiento, agencia digital, LATAM). Genera descripciones para un video, una por red social.

${baseInfo}

Devuelve EXCLUSIVAMENTE JSON válido (sin markdown, sin backticks) con las claves solicitadas y nada más:

${wanted.map((t) => `- ${t}: ${GUIDES[t]}`).join("\n")}

Formato de salida:
{ ${wanted.map((t) => `"${t}": "..."`).join(", ")} }${toneSuffix}`;
}

export function parseAIResponse(raw: string): GeneratedDescriptions | null {
  let cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as GeneratedDescriptions;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as GeneratedDescriptions; } catch { return null; }
  }
}

export function applyLengthClamps(p: GeneratedDescriptions): GeneratedDescriptions {
  if (typeof p.x === "string") p.x = p.x.slice(0, PLATFORM_LIMITS.x);
  if (typeof p.facebook === "string") p.facebook = p.facebook.slice(0, PLATFORM_LIMITS.facebook);
  return p;
}

export function buildUpdateData(
  video: DescVideo,
  parsed: GeneratedDescriptions,
  effectiveTargets: DescTargets[],
): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof parsed.tiktok === "string" && effectiveTargets.includes("tiktok")) updateData.tiktokDescription = parsed.tiktok;
  if (typeof parsed.instagram === "string" && effectiveTargets.includes("instagram")) updateData.instagramDescription = parsed.instagram;
  if (effectiveTargets.includes("youtube")) {
    if (!video.youtubeTitle) updateData.youtubeTitle = video.title;
    if (typeof parsed.youtube === "string") updateData.youtubeDescription = parsed.youtube;
  }
  if (typeof parsed.linkedin === "string" && effectiveTargets.includes("linkedin")) updateData.linkedinDescription = parsed.linkedin;
  if (typeof parsed.x === "string" && effectiveTargets.includes("x")) updateData.xDescription = parsed.x;
  if (typeof parsed.facebook === "string" && effectiveTargets.includes("facebook")) updateData.facebookDescription = parsed.facebook;
  return updateData;
}

export async function generateDescriptionsForVideo(
  video: DescVideo,
  requestedPlatforms: string[] | undefined,
  force: boolean,
  userId: number | null,
  openaiClient: OpenAILike,
  model = "gpt-4o-mini",
): Promise<DescResult> {
  const effectiveTargets = pickEffectiveTargets(video, requestedPlatforms, force);
  if (effectiveTargets.length === 0) {
    return { status: 200, skipped: true, descriptions: {} };
  }
  const toneSuffix = await buildBrandToneSuffix(userId);
  const prompt = buildPrompt(video, effectiveTargets, toneSuffix);

  try {
    const resp = await openaiClient.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });
    const text = resp.choices[0]?.message?.content || "";
    const parsed = parseAIResponse(text);
    if (!parsed) {
      return { status: 502, error: "La IA no devolvió JSON válido. Intenta de nuevo." };
    }
    applyLengthClamps(parsed);
    const updateData = buildUpdateData(video, parsed, effectiveTargets);
    return { status: 200, descriptions: parsed, effectiveTargets, updateData };
  } catch (err) {
    console.error("[generate-descriptions] error:", err instanceof Error ? err.message : err);
    return { status: 502, error: "No se pudo generar el contenido con IA. Intenta de nuevo en unos segundos." };
  }
}
