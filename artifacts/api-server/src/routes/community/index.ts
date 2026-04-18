import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { communityContent } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { readFile } from "fs/promises";
import path from "path";

const router: IRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"]!,
  baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]!,
});

async function resolveAsset(...segments: string[]): Promise<string> {
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(process.cwd(), "artifacts", "api-server", ...segments),
  ];
  for (const p of candidates) {
    try {
      await readFile(p);
      return p;
    } catch {
      // try next
    }
  }
  return candidates[0]!;
}

// ============================================
// HISTORIAS (Stories)
// ============================================

const POSES_HISTORIA: Record<string, string[]> = {
  tip_tech: [
    "apuntando con el dedo índice hacia arriba con expresión de '¡importante!', cejas levantadas",
    "con una bombilla de idea flotando sobre su cabeza, sonrisa de descubrimiento",
    "tecleando en una laptop con cara concentrada, lentes brillando",
    "sosteniendo un engranaje con mirada analítica, postura de experto",
    "señalando un código flotante abstracto con el dedo, expresión explicativa",
  ],
  motivacional: [
    "con los dos brazos levantados en pose de victoria, sonrisa enorme",
    "en pose de superhéroe con manos en la cintura, mirada confiada",
    "corriendo hacia adelante con sonrisa determinada, cola ondeando",
    "saltando con un puño al aire, expresión de triunfo",
    "meditando sentado con piernas cruzadas, aura de calma y enfoque",
  ],
  comunidad: [
    "saludando con la pata levantada, sonrisa amigable tipo 'hola'",
    "sosteniendo una taza de café humeante, relajado y acogedor",
    "con audífonos grandes puestos frente a un micrófono, grabando contenido",
    "riéndose con las dos patas en el estómago, expresión genuina",
    "dando un abrazo al aire con brazos abiertos, cara de cariño",
  ],
};

function buildHistoriaPrompt(tipoHistoria: string, concepto: string, poseOverride?: string): string {
  const posesDisponibles = POSES_HISTORIA[tipoHistoria] || POSES_HISTORIA.comunidad!;
  const pose = poseOverride || posesDisponibles[Math.floor(Math.random() * posesDisponibles.length)];

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam.

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, texto en pantallas, texto en objetos, ni NINGÚN tipo de escritura en la imagen. CERO caracteres alfanuméricos. Si hay una pantalla o monitor, debe mostrar formas abstractas de colores o gráficos abstractos, JAMÁS texto legible. Esta regla no tiene excepciones.

PERSONAJE - ESTILO FLAT CARTOON (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico con lentes rectangulares negros gruesos y camiseta/polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible
- El zorro debe ocupar al menos 35% del área visual CENTRAL. Es el PROTAGONISTA absoluto
- Debe verse IDÉNTICO al de la referencia en proporciones, estilo de dibujo y nivel de detalle
- El zorro DEBE mantener el estilo FLAT CARTOON: líneas de contorno GRUESAS negras, colores PLANOS y sólidos (naranja puro, verde sólido), SIN degradados en el personaje, SIN texturas, SIN sombras realistas
- POSE Y EXPRESIÓN OBLIGATORIA para esta historia: ${pose}

CONTEXTO DE LA HISTORIA:
TIPO: "${tipoHistoria}"
CONCEPTO CLAVE: "${concepto}"
Adapta los objetos/iconos de la escena al concepto clave, pero NUNCA escribas el concepto como texto en la imagen.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- El 20% SUPERIOR (0px a 384px) debe ser fondo limpio SIN elementos - reservado para logo/handle
- El 25% INFERIOR (1440px a 1920px) debe ser fondo limpio SIN elementos - reservado para CTA/sticker
- Toda la acción visual se concentra entre el píxel 384 y 1440 (zona central)
- NADA puede existir en las zonas reservadas: ni el zorro, ni objetos, ni sombras, ni líneas

COMPOSICIÓN:
- El zorro ocupa el centro vertical de la imagen (entre píxeles 500 y 1400 aprox.)
- 1-3 objetos/iconos flotantes acompañan al zorro, relacionados al tipo de contenido
- Composición LIMPIA y respirable, estilo "sticker premium"
- Los objetos pueden tener un leve efecto de flotación con glow sutil

FONDO PREMIUM:
- Color base: gradiente radial desde el centro con #1E293B (slate 800) hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% de opacidad)
- Glow ambiental naranja (#E86A30 al 20% de opacidad) con blur amplio detrás del zorro como halo
- Pequeñas partículas de luz flotantes (3-5 puntitos blancos difusos) para dar sensación premium
- Las zonas superior (20%) e inferior (25%) mantienen el tono oscuro limpio sin elementos

PALETA:
- Fondo: slate oscuros (#0F172A, #1E293B) con glow naranja difuso
- Zorro: naranja vibrante PLANO, verde sólido en camiseta, líneas gruesas negras
- Objetos: colores planos vibrantes (naranja, verde, blanco, azul eléctrico, rojo), contornos gruesos negros

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte. El zorro debe verse EXACTAMENTE como en la referencia sobre un fondo oscuro premium con zonas superior e inferior limpias para overlay de texto posterior.`;
}

const GenerarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  pose_override: z.string().optional(),
});

router.post("/community/historias/generar", async (req, res) => {
  try {
    const body = GenerarHistoriaBody.parse(req.body);
    const prompt = buildHistoriaPrompt(body.tipo_historia, body.concepto, body.pose_override);

    const referencePath = await resolveAsset("public", "fox-reference.png");
    let referenceBase64: string | null = null;
    try {
      referenceBase64 = (await readFile(referencePath)).toString("base64");
    } catch {
      referenceBase64 = null;
    }

    const contents = referenceBase64
      ? [{
          role: "user" as const,
          parts: [
            { inlineData: { data: referenceBase64, mimeType: "image/png" } },
            { text: prompt },
          ],
        }]
      : [{ role: "user" as const, parts: [{ text: prompt }] }];

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      res.status(502).json({ success: false, error: "Gemini no devolvió imagen" });
      return;
    }

    const imagenDataUrl = `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;

    const [row] = await db
      .insert(communityContent)
      .values({
        kind: "historia",
        subtype: body.tipo_historia,
        topic: body.concepto,
        data: { tipo_historia: body.tipo_historia, concepto: body.concepto, pose: body.pose_override || "aleatoria" },
        imageUrl: imagenDataUrl,
      })
      .returning();

    res.json({
      success: true,
      data: {
        id: row!.id,
        imagen: imagenDataUrl,
        tipo_historia: body.tipo_historia,
        concepto: body.concepto,
        fecha: row!.createdAt,
      },
    });
  } catch (err: any) {
    console.error("[Historias] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/historias", async (_req, res) => {
  const rows = await db
    .select()
    .from(communityContent)
    .where(eq(communityContent.kind, "historia"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/historias/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ success: false, error: "id inválido" });
    return;
  }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

// ============================================
// DESCRIPCIONES (Claude)
// ============================================

const SYSTEM_PROMPT_DESC = `Eres el Community Manager oficial de WebMakerLatam, una comunidad de desarrolladores y creadores de contenido tech en Latinoamérica. Tu mascota es un zorro naranja con lentes llamado "Webi".

TU TAREA:
Generar descripciones diarias para publicaciones en redes sociales que mantengan VIVA la comunidad, generen engagement y refuercen la identidad de marca.

REGLAS DE ESCRITURA (NO NEGOCIABLES):
1. MÁXIMO 5 LÍNEAS por descripción (crítico)
2. Tono cercano, entusiasta, latino, sin ser cringe ni forzado
3. SIEMPRE incluir una pregunta o CTA al final para generar comentarios
4. Usar emojis con moderación (máximo 3-4 por descripción)
5. NO usar frases genéricas tipo "dale like y suscríbete" - ser creativo
6. Evitar anglicismos innecesarios cuando hay palabra en español
7. Hablar de "tú" (no "usted" ni "vos")

ESTRUCTURA POR RED SOCIAL:

📱 TIKTOK (descripción corta + hashtags):
- Hook directo en la primera línea
- 1-2 líneas de contexto
- CTA corto y urgente
- 5-7 hashtags mezclando nicho + trending + marca

📸 INSTAGRAM (descripción más narrativa):
- Hook emocional o provocador
- 3-4 líneas con valor o storytelling
- Pregunta para comentarios
- 8-12 hashtags al final (mezcla de grandes + medianos + nicho)

▶️ YOUTUBE SHORTS (optimizado para SEO):
- Primera línea con palabra clave principal
- Descripción clara del contenido
- CTA a suscripción creativo
- 4-6 hashtags relevantes (#shorts obligatorio)

🐦 X/TWITTER (MÁX 280 caracteres TOTAL, incluyendo hashtags):
- Hook punzante en 1-2 líneas
- Insight o dato que genere conversación
- 2-3 hashtags máximo
- Sin saludos innecesarios

HASHTAGS OBLIGATORIOS DE MARCA (incluir al menos 2 en cada publicación excepto Twitter donde es opcional):
#WebMakerLatam #WebMaker #ComunidadWebMaker

HASHTAGS SUGERIDOS POR CATEGORÍA:
- Dev/Tech: #Programacion #Desarrollador #TechLatam #CodingLife #DevLife #Fullstack
- Frontend: #JavaScript #ReactJS #CSS #HTML #TailwindCSS #Frontend
- Backend: #NodeJS #Python #API #Backend #Database
- Carrera: #DevTips #AprenderAProgramar #TechCareer #CodeNewbie
- Motivacional: #DevMotivation #CodingCommunity #LatamTech

FORMATO DE SALIDA (JSON ESTRICTO):
Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después, sin bloques de código markdown. Solo incluye las redes que fueron solicitadas.

Estructura:
{
  "tiktok": { "descripcion": "...", "hashtags": "#... #..." },
  "instagram": { "descripcion": "...", "hashtags": "#... #..." },
  "youtube_shorts": { "descripcion": "...", "hashtags": "#... #..." },
  "twitter": { "post_completo": "..." }
}`;

const GenerarDescripcionesBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  redes: z.array(z.enum(["tiktok", "instagram", "youtube_shorts", "twitter"])).min(1),
});

router.post("/community/descripciones/generar", async (req, res) => {
  try {
    const body = GenerarDescripcionesBody.parse(req.body);

    const userMessage = `TEMA del día: ${body.tema}
TIPO de contenido: ${body.tipo_contenido}
REDES solicitadas: ${body.redes.join(", ")}

Genera las descripciones siguiendo TODAS las reglas. Responde solo con el JSON.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT_DESC,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    const textoRespuesta = block && block.type === "text" ? block.text.trim() : "";

    const textoLimpio = textoRespuesta
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let resultado: any;
    try {
      resultado = JSON.parse(textoLimpio);
    } catch {
      res.status(502).json({ success: false, error: "La IA no devolvió JSON válido. Intenta de nuevo.", raw: textoLimpio });
      return;
    }

    const [row] = await db
      .insert(communityContent)
      .values({
        kind: "descripcion",
        subtype: body.tipo_contenido,
        topic: body.tema,
        data: { tema: body.tema, tipo_contenido: body.tipo_contenido, redes: body.redes, contenido: resultado },
      })
      .returning();

    res.json({
      success: true,
      data: {
        id: row!.id,
        fecha: row!.createdAt,
        tema: body.tema,
        tipo_contenido: body.tipo_contenido,
        contenido: resultado,
      },
    });
  } catch (err: any) {
    console.error("[Descripciones] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/descripciones", async (_req, res) => {
  const rows = await db
    .select()
    .from(communityContent)
    .where(eq(communityContent.kind, "descripcion"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/descripciones/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ success: false, error: "id inválido" });
    return;
  }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

export default router;
