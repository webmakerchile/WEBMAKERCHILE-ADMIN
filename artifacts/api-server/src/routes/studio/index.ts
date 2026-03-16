import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { videoIdeas } from "@workspace/db/schema";
import { eq, desc, sql, isNotNull, isNull, and } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const VIDEO_CATEGORIES = [
  {
    key: "corto-viral",
    label: "Corto Viral",
    description: "Videos de 25-35 seg que enganchan al instante con una sola idea impactante",
    icon: "Zap",
  },
  {
    key: "problema-solucion",
    label: "Problema / Solución",
    description: "Identifica un dolor del emprendedor y muestra la solución directa",
    icon: "Target",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Videos que posicionan y generan leads con datos concretos",
    icon: "Megaphone",
  },
  {
    key: "historia",
    label: "Historia",
    description: "Historias emotivas de transformación digital que conectan",
    icon: "BookOpen",
  },
  {
    key: "educativo",
    label: "Educativo",
    description: "Enseñar algo útil y accionable que puedan aplicar hoy",
    icon: "Lightbulb",
  },
  {
    key: "behind-scenes",
    label: "Behind the Scenes",
    description: "Mostrar el proceso real de trabajo para generar confianza",
    icon: "Wrench",
  },
  {
    key: "opinion",
    label: "Opinión",
    description: "Opinar sobre tendencias actuales de tech y negocios",
    icon: "TrendingUp",
  },
  {
    key: "pack-del-dia",
    label: "Pack del Día",
    description: "1 corto + 1 marketing + 1 historia + 1 problema/solución + 1 tip",
    icon: "Package",
    isPack: true,
  },
];

router.get("/studio/categories", async (_req, res) => {
  res.json(VIDEO_CATEGORIES);
});

router.get("/studio/ideas", async (req, res) => {
  const { category, inStudio, recorded } = req.query;
  const conditions = [];

  if (category && category !== "all") {
    conditions.push(eq(videoIdeas.category, category as string));
  }
  if (inStudio === "true") {
    conditions.push(eq(videoIdeas.inStudio, 1));
  }
  if (recorded === "true") {
    conditions.push(isNotNull(videoIdeas.recordedAt));
  }
  if (recorded === "false") {
    conditions.push(isNull(videoIdeas.recordedAt));
  }

  const rows = await db
    .select()
    .from(videoIdeas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(videoIdeas.createdAt));

  res.json(rows);
});

router.post("/studio/ideas/generate", async (req, res) => {
  const { category = "corto-viral", count = 3 } = req.body;

  const catInfo = VIDEO_CATEGORIES.find((c) => c.key === category);
  const isPack = catInfo?.isPack;

  let prompt: string;

  if (isPack) {
    prompt = `Eres un experto en creación de contenido para redes sociales para una agencia de desarrollo web llamada WebMakerChile.

Genera un "Pack del Día" que incluya exactamente 5 ideas de video, una de cada categoría:
1. Corto Viral (25-35 seg)
2. Marketing (posicionamiento y leads)
3. Historia (transformación digital emotiva)
4. Problema/Solución (dolor del emprendedor)
5. Tip Rápido (algo accionable)

Para cada idea incluye:
- titulo: título atractivo y conciso
- guion: guion completo listo para leer en un teleprompter (máximo 200 palabras por guion)
- descripcion: breve descripción del enfoque
- category: la categoría correspondiente (corto-viral, marketing, historia, problema-solucion, educativo)
- plataforma: "TikTok", "Instagram Reels" o "YouTube Shorts"
- duracionSugerida: duración estimada (ej: "30 seg", "45 seg", "60 seg")
- tendencia: tendencia o tema actual relevante (opcional)
- hashtags: array de 3-5 hashtags relevantes

Responde SOLO con un array JSON válido de 5 objetos. Sin markdown, sin explicaciones.`;
  } else {
    prompt = `Eres un experto en creación de contenido para redes sociales para una agencia de desarrollo web llamada WebMakerChile.

Categoría: ${catInfo?.label || category}
Descripción: ${catInfo?.description || ""}

Genera exactamente ${count} ideas de video para esta categoría.

Para cada idea incluye:
- titulo: título atractivo y conciso
- guion: guion completo listo para leer en un teleprompter (máximo 200 palabras)
- descripcion: breve descripción del enfoque
- category: "${category}"
- plataforma: "TikTok", "Instagram Reels" o "YouTube Shorts" (varía entre ellas)
- duracionSugerida: duración estimada (ej: "30 seg", "45 seg", "60 seg")
- tendencia: tendencia o tema actual relevante (opcional)
- hashtags: array de 3-5 hashtags relevantes

Responde SOLO con un array JSON válido de ${count} objetos. Sin markdown, sin explicaciones.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 4096 },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "No se pudo parsear la respuesta de la IA" });
      return;
    }

    const ideas = JSON.parse(jsonMatch[0]);

    const inserted = [];
    for (const idea of ideas) {
      const [row] = await db
        .insert(videoIdeas)
        .values({
          titulo: idea.titulo || "Sin título",
          guion: idea.guion || "",
          descripcion: idea.descripcion || "",
          category: idea.category || category,
          plataforma: idea.plataforma || "TikTok",
          duracionSugerida: idea.duracionSugerida || null,
          tendencia: idea.tendencia || null,
          hashtags: idea.hashtags || [],
          inStudio: 0,
        })
        .returning();
      inserted.push(row);
    }

    res.json({ ideas: inserted, count: inserted.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error al generar ideas" });
  }
});

router.patch("/studio/ideas/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { inStudio, recordedAt } = req.body;

  const updates: Record<string, any> = {};
  if (inStudio !== undefined) updates.inStudio = inStudio;
  if (recordedAt !== undefined) updates.recordedAt = recordedAt ? new Date(recordedAt) : null;

  const [updated] = await db
    .update(videoIdeas)
    .set(updates)
    .where(eq(videoIdeas.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }

  res.json(updated);
});

router.delete("/studio/ideas/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await db
    .delete(videoIdeas)
    .where(eq(videoIdeas.id, id))
    .returning();

  if (!deleted.length) {
    res.status(404).json({ error: "Idea no encontrada" });
    return;
  }

  res.status(204).send();
});

router.delete("/studio/ideas", async (req, res) => {
  const { keepRecorded } = req.query;

  if (keepRecorded === "true") {
    await db
      .delete(videoIdeas)
      .where(isNull(videoIdeas.recordedAt));
  } else {
    await db.delete(videoIdeas);
  }

  res.json({ message: "Ideas limpiadas" });
});

router.get("/studio/stats", async (_req, res) => {
  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoIdeas);

  const recordedResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoIdeas)
    .where(isNotNull(videoIdeas.recordedAt));

  const inStudioResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoIdeas)
    .where(eq(videoIdeas.inStudio, 1));

  const byCategoryResult = await db
    .select({
      category: videoIdeas.category,
      count: sql<number>`count(*)::int`,
    })
    .from(videoIdeas)
    .groupBy(videoIdeas.category);

  const byCategory: Record<string, number> = {};
  for (const row of byCategoryResult) {
    byCategory[row.category] = row.count;
  }

  res.json({
    total: totalResult[0]?.count || 0,
    recorded: recordedResult[0]?.count || 0,
    inStudio: inStudioResult[0]?.count || 0,
    byCategory,
  });
});

export default router;
