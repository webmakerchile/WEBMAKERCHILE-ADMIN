import { db } from "@workspace/db";
import { brandTones } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type BrandToneInput = {
  voice?: string;
  persona?: string;
  values?: string;
  avoidWords?: string;
  examples?: string;
};

export async function getBrandTone(userId: number) {
  if (!userId) return null;
  const [row] = await db
    .select()
    .from(brandTones)
    .where(eq(brandTones.userId, userId))
    .limit(1);
  return row || null;
}

export async function upsertBrandTone(userId: number, input: BrandToneInput) {
  const clean = (s: unknown, max: number) =>
    typeof s === "string" ? s.trim().slice(0, max) : "";
  const data = {
    voice: clean(input.voice, 280),
    persona: clean(input.persona, 280),
    values: clean(input.values, 500),
    avoidWords: clean(input.avoidWords, 500),
    examples: clean(input.examples, 1500),
  };
  const existing = await getBrandTone(userId);
  if (existing) {
    const [row] = await db
      .update(brandTones)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brandTones.userId, userId))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(brandTones)
    .values({ userId, ...data })
    .returning();
  return row;
}

/**
 * Build a Spanish suffix block to append to AI prompts so the brand voice
 * is consistently injected across templates, hashtags, descriptions e
 * insights. Returns "" if the user has not configured a brand tone yet.
 */
export async function buildBrandToneSuffix(userId: number | null | undefined): Promise<string> {
  if (!userId) return "";
  let t: Awaited<ReturnType<typeof getBrandTone>> = null;
  try {
    t = await getBrandTone(userId);
  } catch (err) {
    // Never let a brand-tone lookup failure break AI generation paths.
    console.warn("[brand-tone] lookup failed:", err instanceof Error ? err.message : String(err));
    return "";
  }
  if (!t) return "";
  const lines: string[] = [];
  if (t.voice) lines.push(`- Voz / tono general: ${t.voice}`);
  if (t.persona) lines.push(`- Persona / quién habla: ${t.persona}`);
  if (t.values) lines.push(`- Valores y temas que defendemos: ${t.values}`);
  if (t.avoidWords) lines.push(`- Palabras o expresiones a evitar: ${t.avoidWords}`);
  if (t.examples) lines.push(`- Ejemplos de copy aprobado para imitar el estilo:\n${t.examples}`);
  if (lines.length === 0) return "";
  return `\n\nGUÍA DE MARCA (debes respetarla en TODO el contenido generado):\n${lines.join("\n")}`;
}
