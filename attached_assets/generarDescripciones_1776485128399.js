// backend/generarDescripciones.js
// Endpoint para generar descripciones + hashtags diarios para WebMakerLatam
// Stack: Node.js + Anthropic Claude API + Replit DB

import Anthropic from "@anthropic-ai/sdk";
import Database from "@replit/database";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const db = new Database();

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `Eres el Community Manager oficial de WebMakerLatam, una comunidad de desarrolladores y creadores de contenido tech en Latinoamérica. Tu mascota es un zorro naranja con lentes llamado "Webi".

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

// ============================================
// HANDLER DEL ENDPOINT
// ============================================
export async function generarDescripcionesHandler(req, res) {
  try {
    const { tema, tipo_contenido, redes } = req.body;

    // Validaciones
    if (!tema || !tipo_contenido || !redes || !Array.isArray(redes)) {
      return res.status(400).json({
        success: false,
        error:
          "Faltan campos requeridos: tema (string), tipo_contenido (string), redes (array)",
      });
    }

    const redesValidas = ["tiktok", "instagram", "youtube_shorts", "twitter"];
    const redesFiltradas = redes.filter((r) => redesValidas.includes(r));

    if (redesFiltradas.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Debes incluir al menos una red válida: ${redesValidas.join(", ")}`,
      });
    }

    const userMessage = `TEMA del día: ${tema}
TIPO de contenido: ${tipo_contenido}
REDES solicitadas: ${redesFiltradas.join(", ")}

Genera las descripciones siguiendo TODAS las reglas. Responde solo con el JSON.`;

    // Llamada a Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textoRespuesta = response.content[0].text.trim();

    // Limpiar posibles bloques de código markdown
    const textoLimpio = textoRespuesta
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let resultado;
    try {
      resultado = JSON.parse(textoLimpio);
    } catch (parseError) {
      console.error("Error parseando JSON:", textoLimpio);
      return res.status(500).json({
        success: false,
        error: "La IA no devolvió JSON válido. Intenta de nuevo.",
        raw: textoLimpio,
      });
    }

    // Guardar en Replit DB
    const id = `descripcion_${Date.now()}`;
    const registro = {
      id,
      tema,
      tipo_contenido,
      redes: redesFiltradas,
      fecha: new Date().toISOString(),
      contenido: resultado,
    };

    await db.set(id, registro);

    return res.json({
      success: true,
      data: {
        id,
        fecha: registro.fecha,
        tema,
        tipo_contenido,
        contenido: resultado,
      },
    });
  } catch (error) {
    console.error("Error generando descripciones:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Error interno del servidor",
    });
  }
}

// ============================================
// LISTAR DESCRIPCIONES GUARDADAS
// ============================================
export async function listarDescripcionesHandler(req, res) {
  try {
    const keys = await db.list("descripcion_");
    const descripciones = await Promise.all(keys.map((key) => db.get(key)));
    descripciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return res.json({ success: true, data: descripciones });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// ELIMINAR REGISTRO
// ============================================
export async function eliminarDescripcionHandler(req, res) {
  try {
    const { id } = req.params;
    await db.delete(id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
