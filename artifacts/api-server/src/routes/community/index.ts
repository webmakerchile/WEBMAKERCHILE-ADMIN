import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
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
    try { await readFile(p); return p; } catch {}
  }
  return candidates[0]!;
}

let foxRefBase64Cache: string | null = null;
async function getFoxRefBase64(): Promise<string | null> {
  if (foxRefBase64Cache) return foxRefBase64Cache;
  try {
    const p = await resolveAsset("public", "fox-reference.png");
    foxRefBase64Cache = (await readFile(p)).toString("base64");
    return foxRefBase64Cache;
  } catch {
    return null;
  }
}

// ============================================
// HELPERS DE TEXTO Y RENDER
// ============================================

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

// Quita emojis y símbolos pictográficos para render seguro en SVG
function stripEmojis(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u200D\uFE0F\u20E3]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapTextByChars(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const tentative = current ? current + " " + w : w;
    if (tentative.length <= maxCharsPerLine) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      // Si la palabra solita excede, cortarla duro
      if (w.length > maxCharsPerLine) {
        let chunk = w;
        while (chunk.length > maxCharsPerLine) {
          lines.push(chunk.slice(0, maxCharsPerLine));
          chunk = chunk.slice(maxCharsPerLine);
        }
        current = chunk;
      } else {
        current = w;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface FitResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  blockWidth: number;
  blockHeight: number;
}

// Auto-fit: prueba tamaños de fuente decrecientes hasta que quepa en el área
function fitTextBlock(
  text: string,
  opts: {
    maxWidth: number;
    maxHeight: number;
    maxFontSize: number;
    minFontSize: number;
    charWidthRatio?: number; // ancho promedio de char relativo al fontSize
    lineHeightRatio?: number;
  },
): FitResult {
  const charW = opts.charWidthRatio ?? 0.56; // bold sans-serif aprox
  const lhRatio = opts.lineHeightRatio ?? 1.18;

  const sizes: number[] = [];
  for (let fs = opts.maxFontSize; fs >= opts.minFontSize; fs -= 2) sizes.push(fs);

  for (const fs of sizes) {
    const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
    const lines = wrapTextByChars(text, maxChars);
    const lineHeight = fs * lhRatio;
    const blockHeight = lines.length * lineHeight;
    const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
    const blockWidth = longest * fs * charW;
    if (blockHeight <= opts.maxHeight && blockWidth <= opts.maxWidth) {
      return { lines, fontSize: fs, lineHeight, blockWidth, blockHeight };
    }
  }

  // Fallback: usar mínimo y truncar líneas si hace falta
  const fs = opts.minFontSize;
  const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
  const allLines = wrapTextByChars(text, maxChars);
  const lineHeight = fs * (opts.lineHeightRatio ?? 1.18);
  const maxLines = Math.max(1, Math.floor(opts.maxHeight / lineHeight));
  let lines = allLines.slice(0, maxLines);
  if (allLines.length > maxLines && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] = last.length > 3 ? last.slice(0, last.length - 3) + "..." : "...";
  }
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
  return { lines, fontSize: fs, lineHeight, blockWidth: longest * fs * charW, blockHeight: lines.length * lineHeight };
}

// Genera SVG de un bloque de texto con fondo semi-transparente y centrado horizontal
function renderTextBlockSvg(
  fit: FitResult,
  opts: {
    canvasWidth: number;
    centerY: number; // centro vertical del bloque
    fontWeight: 600 | 700 | 800 | 900;
    color: string;
    bgColor?: string; // por defecto semi-transparente negro
    bgOpacity?: number; // 0-1
    bgPadding?: number;
    bgRadius?: number;
    filterId: string;
  },
): string {
  if (fit.lines.length === 0) return "";
  const bgPadding = opts.bgPadding ?? 24;
  const bgRadius = opts.bgRadius ?? 18;
  const bgColor = opts.bgColor ?? "#000000";
  const bgOpacity = opts.bgOpacity ?? 0.55;

  const bgWidth = Math.min(opts.canvasWidth - 40, fit.blockWidth + bgPadding * 2);
  const bgHeight = fit.blockHeight + bgPadding * 2;
  const bgX = (opts.canvasWidth - bgWidth) / 2;
  const bgY = opts.centerY - bgHeight / 2;

  // baseline de cada línea
  const firstBaselineY = bgY + bgPadding + fit.fontSize * 0.85;

  const letterSpacing = (opts as any).letterSpacing ?? 0;
  return `
    ${bgOpacity > 0 ? `<rect x="${bgX.toFixed(1)}" y="${bgY.toFixed(1)}" width="${bgWidth.toFixed(1)}" height="${bgHeight.toFixed(1)}" rx="${bgRadius}" fill="${bgColor}" fill-opacity="${bgOpacity}" />` : ""}
    ${fit.lines.map((line, i) => `
      <text x="${opts.canvasWidth / 2}" y="${(firstBaselineY + i * fit.lineHeight).toFixed(1)}"
        text-anchor="middle" font-family="'Inter','Helvetica Neue',Arial,sans-serif"
        font-weight="${opts.fontWeight}" font-size="${fit.fontSize}" letter-spacing="${letterSpacing}"
        fill="${opts.color}" filter="url(#${opts.filterId})">${escapeXml(line)}</text>
    `).join("")}
  `;
}

// Defs SVG: gradientes premium para zonas reservadas + drop-shadow fuerte
const SVG_DEFS = `
  <defs>
    <linearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0.92"/>
      <stop offset="60%" stop-color="#0F172A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0"/>
      <stop offset="40%" stop-color="#0F172A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0.95"/>
    </linearGradient>
    <filter id="textds" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dx="0" dy="3" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.9"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
`;
// Backwards-compat alias
const SVG_FILTER_DEFS = SVG_DEFS;
void SVG_FILTER_DEFS;

// Especificación rigurosa del zorro de marca - obligatoria en TODOS los prompts de imagen
const FOX_BRAND_SPEC = `PERSONAJE - REPLICA EXACTA DE LA IMAGEN DE REFERENCIA ADJUNTA (no es "un zorro", es EL MISMO zorro de la marca registrada WebMakerLatam, llamado Webi):

Características OBLIGATORIAS Y NO NEGOCIABLES (cualquier desviación es un ERROR de branding):
- Estilo: FLAT CARTOON 2D PURO. PROHIBIDO: 3D, render realista, estilo Disney/Pixar, anime
- Líneas de contorno: NEGRAS, GRUESAS y uniformes (mismo grosor en toda la silueta)
- Pelaje: UN SOLO COLOR NARANJA PLANO (#E86A30 aprox), sin texturas, sin sombras de cuerpo, sin degradados, sin variaciones tonales, sin pelos visibles
- Vientre y hocico: blanco cremoso plano (#F5E6D3), sin sombreado
- Punta de la cola: blanca plana
- Ojos: PEQUEÑOS y simples (NO grandes estilo anime/Disney/chibi). Pupila negra circular, sin brillos ni reflejos blancos
- Lentes: rectangulares, gruesos, marco negro sólido, cristales transparentes SIN reflejos ni highlights
- Polera/sudadera: verde oscuro plano (#4A6B3D aprox), SIN arrugas, SIN texturas de tela, SIN sombras
- Forma de la cabeza: estilizada y ligeramente alargada con orejas triangulares, NO redonda estilo chibi
- Proporciones idénticas a la referencia: cabeza grande, cuerpo proporcionado, brazos y piernas cortos pero visibles

PROHIBIDO ABSOLUTAMENTE en el zorro: sombras de cuerpo, brillos especulares, reflejos en los lentes, texturas de pelaje, gradientes de color, iluminación volumétrica, ambient occlusion, cualquier efecto 3D.

Este zorro es la MASCOTA OFICIAL de una marca registrada. Debe ser 100% IDÉNTICO entre todas las imágenes — los seguidores deben reconocerlo al instante. Si dudas en algún detalle, COPIA LA REFERENCIA tal cual.`;

// ============================================
// SORPRÉNDEME (audiencia: emprendedores/pymes)
// ============================================

const SORPRENDEME_SYSTEM = `Eres un estratega de contenido para WebMakerLatam, una AGENCIA digital que ayuda a EMPRENDEDORES, PYMES y EMPRESAS de Latinoamérica a crecer con tecnología (desarrollo web, e-commerce, software a medida, chatbots con IA, apps móviles, marketing digital/SEO).

AUDIENCIA PRIMARIA: dueños de negocio y emprendedores que NO necesariamente saben de tecnología. Hay que hablarles simple, en términos de BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, atender 24/7, profesionalizarse), nunca en jerga técnica.

DISTRIBUCIÓN DE CATEGORÍAS cuando NO hay contexto del usuario (respétala estrictamente):
1. CASOS DE ÉXITO (20%): "Cómo ayudamos a [tipo negocio] a [resultado concreto]". Ej: "Cómo una panadería triplicó pedidos con un chatbot de WhatsApp"
2. TIPS DE NEGOCIO (20%): consejos prácticos para crecer usando tecnología. Ej: "5 errores que están haciendo huir a tus clientes de tu web"
3. ¿SABÍAS QUE...? (20%): datos/curiosidades tech para no-devs. Ej: "¿Sabías que el 70% abandona una web si tarda más de 3s en cargar?"
4. PROBLEMA + SOLUCIÓN (20%): problema común de emprendedor + cómo lo resolvemos. Ej: "¿Pierdes ventas por responder WhatsApp a las 2am? Un chatbot con IA atiende 24/7"
5. MOTIVACIÓN EMPRENDEDORA (15%): mindset, frases. Ej: "La diferencia entre un negocio que crece y uno que se estanca está en la ejecución"
6. TUTORIALES DEV (5% - SOLO secundaria): técnico para devs. Ej: "Cómo usar git bisect para encontrar bugs"

REGLAS:
- Si el usuario da contexto, RESPÉTALO siempre. Ej: contexto "chatbots" → tema de chatbots para emprendedores (no para devs). Contexto "react" → puede ser técnico para devs.
- Si NO hay contexto, elige una categoría siguiendo la distribución (mayoritariamente para emprendedores).
- Tema concreto y accionable, no genérico. Máximo 90 caracteres.
- Devuelve SOLO el tema en una línea, sin comillas, sin prefijos, sin explicación.`;

const SorprendemeBody = z.object({
  contexto: z.string().max(300).optional(),
  tipo_seccion: z.enum(["historia", "descripcion"]),
});

router.post("/community/sorprendeme", async (req, res) => {
  try {
    const body = SorprendemeBody.parse(req.body);
    const ctx = (body.contexto || "").trim();
    const sectionHint = body.tipo_seccion === "historia"
      ? "una HISTORIA corta (story 9:16 con un solo concepto digerible en 5 segundos)"
      : "una PUBLICACIÓN de feed (post único o carrusel con desarrollo más largo)";

    const userPrompt = ctx
      ? `Genera UN tema concreto para ${sectionHint} de WebMakerLatam. CONTEXTO del usuario: "${ctx}". El tema DEBE estar alineado con ese contexto y dirigido a la audiencia que el contexto sugiera (si suena emprendedor → emprendedores; si suena técnico → devs).`
      : `Genera UN tema concreto para ${sectionHint} de WebMakerLatam, eligiendo categoría según la distribución (mayoritariamente para emprendedores/pymes, no para devs).`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: SORPRENDEME_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    let tema = block && block.type === "text" ? block.text.trim() : "";
    tema = tema.replace(/^["'`]+|["'`]+$/g, "").replace(/^[-*•]\s*/, "").trim();
    if (tema.length > 120) tema = tema.slice(0, 117) + "...";
    res.json({ success: true, data: { tema } });
  } catch (err: any) {
    console.error("[Sorpréndeme] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

// ============================================
// HISTORIAS - prompts orientados a emprendedores
// ============================================

const POSES_BASE: Record<string, string[]> = {
  educativo: [
    "con cara de profesor explicando, una pata levantada como dando una lección, expresión amable y didáctica",
    "señalando hacia un objeto del tema con expresión de '¡presta atención!', cejas levantadas",
    "sosteniendo el objeto principal del tema y mostrándolo a cámara con orgullo, sonrisa de experto",
  ],
  exito: [
    "celebrando con los dos brazos en alto, sonrisa enorme de triunfo, ojos brillantes",
    "señalando un gráfico ascendente con cara de 'lo logramos', pose confiada",
    "chocando los cinco al aire, mirada de victoria, cola moviéndose de alegría",
  ],
  problema: [
    "con cara preocupada y pata en la cabeza señalando un objeto/situación problemática, ceño fruncido",
    "mirando con sorpresa y un poco de pánico hacia el problema, ojos abiertos",
    "señalando con desaprobación a un objeto roto/mal funcionando, expresión de '¡esto no!'",
  ],
  solucion: [
    "con bombilla flotando sobre la cabeza y cara de '¡eureka!', sonrisa de descubrimiento",
    "presentando con ambas patas abiertas la solución, cara de confianza y seguridad",
    "guiñando un ojo y señalando la solución con el pulgar, expresión cómplice",
  ],
  motivacion: [
    "en pose de superhéroe con manos en la cintura y mirada decidida, capa imaginaria al viento",
    "corriendo hacia adelante con sonrisa determinada, cola ondeando, ojos al horizonte",
    "con un puño al aire en pose motivacional, cara de '¡vamos!'",
  ],
  comunidad: [
    "saludando con la pata levantada y sonrisa amigable tipo 'hola', acogedor",
    "abriendo los brazos en gesto de bienvenida, cara cálida y cercana",
    "guiñando un ojo con pulgar arriba, cara cómplice de comunidad",
  ],
};

function elegirCategoriaPose(concepto: string, tipoHistoria: string): { categoria: string; pose: string } {
  const c = concepto.toLowerCase();
  let cat = "educativo";
  if (/(\bdeja|pierd|error|problem|tard|lent|abandon|huir|huye|huyen|sin |no\s+(tiene|ten[ií]as|sab|funcion))/i.test(c)) cat = "problema";
  else if (/(c[oó]mo|gu[ií]a|aprende|tutorial|3 |5 |7 |señales|tips?|trucos?)/i.test(c)) cat = "educativo";
  else if (/(triplic|duplic|crec|aument|ventas|ingres|gan[oó]|logr[oó]|resultado|caso de [eé]xito|m[aá]s clientes)/i.test(c)) cat = "exito";
  else if (/(soluci[oó]n|automatiz|chatbot|24\/7|resuelve|optim|mejor)/i.test(c)) cat = "solucion";
  else if (/(motiv|mind|mentalidad|atr[eé]vete|empieza|emprend|sue[ñn]o)/i.test(c)) cat = "motivacion";
  else if (tipoHistoria === "comunidad") cat = "comunidad";
  else if (tipoHistoria === "motivacional") cat = "motivacion";

  const poses = POSES_BASE[cat] || POSES_BASE.educativo!;
  return { categoria: cat, pose: poses[Math.floor(Math.random() * poses.length)]! };
}

function buildHistoriaPrompt(tipoHistoria: string, concepto: string, poseOverride?: string): string {
  const { categoria, pose: poseElegida } = elegirCategoriaPose(concepto, tipoHistoria);
  const pose = poseOverride || poseElegida;

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam (agencia digital para emprendedores y pymes en LATAM).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, ni texto en pantallas/objetos. CERO caracteres alfanuméricos. Pantallas/monitores muestran formas abstractas de colores, NUNCA texto. Esta regla no tiene excepciones.

${FOX_BRAND_SPEC}

REGLAS ADICIONALES PARA ESTA HISTORIA:
- Cuerpo completo SIEMPRE visible (cabeza, torso, brazos, piernas, cola). Nunca cortado por los bordes ni recortado.
- El zorro es el PROTAGONISTA ABSOLUTO. Ocupa el centro de la zona de imagen.
- POSE Y EXPRESIÓN específica (categoría narrativa: "${categoria}"): ${pose}
- POSICIÓN VERTICAL EXACTA: la cabeza del zorro debe empezar después del píxel 480, y sus PIES deben terminar ANTES del píxel 1240. Es decir, todo el zorro vive entre y=480 y y=1240 (860 px de altura). Esto deja franjas TOTALMENTE libres arriba (0-420) y abajo (1280-1920) para el texto overlay.
- RESPIRACIÓN: el zorro debe tener al menos 100 px de aire vacío por TODOS sus lados (arriba, abajo, izquierda, derecha). Nada lo toca.

CONTENIDO Y CONTEXTO:
TIPO de historia: "${tipoHistoria}"
CONCEPTO/TEMA del día: "${concepto}"

OBJETOS DE LA ESCENA (REGLAS ESTRICTAS - "MENOS ES MÁS"):
- Extrae 1-2 PALABRAS CLAVE VISUALES del tema y úsalas como acompañantes pequeños. Ejemplos:
  * "chatbot" / "responder" / "WhatsApp" → burbuja de chat verde
  * "web" / "sitio" / "landing" → laptop/monitor con web abstracta (sin texto)
  * "ventas" / "vender más" / "ingresos" → carrito O gráfico ascendente (uno solo)
  * "rápido" / "carga" / "velocidad" → cohete O velocímetro
  * "automatización" / "IA" / "ahorro de tiempo" → engranajes O reloj
  * "clientes" / "atención" → 2-3 siluetas pequeñas O corazones
  * "SEO" / "Google" / "encontrar" → lupa O podio
  * "móvil" / "app" → smartphone con interfaz abstracta
- MÁXIMO ABSOLUTO: 2 objetos de apoyo (no 3, no más). En historias el zorro es el rey.
- POSICIÓN DE LOS OBJETOS: a los LADOS del zorro (izquierda y/o derecha), a su altura, NUNCA detrás de él, NUNCA encima ni debajo invadiendo otra zona.
- Los objetos PUEDEN ser señalados/sostenidos por el zorro, pero su silueta debe verse completa y separada del zorro.
- PROHIBIDO: amontonar iconos, llenar el fondo de elementos, hacer un collage. Si dudas, elimina objetos.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- 22% SUPERIOR (0px a 420px) = fondo limpio SIN elementos sólidos (reservado para título)
- 33% INFERIOR (1280px a 1920px) = fondo limpio SIN elementos sólidos (reservado para sub-copy + CTA + hashtags)
- Toda la acción visual (zorro + 1-2 objetos pequeños) va estrictamente entre los píxeles 420 y 1280 (zona central de 860 px)
- NADA puede invadir las zonas reservadas: ni el zorro, ni sus pies, ni objetos, ni sombras, ni el glow del fondo

VALIDACIÓN FINAL ANTES DE ENTREGAR LA IMAGEN — verifica MENTALMENTE:
1. ¿El zorro está 100% IDÉNTICO a la referencia (ojos pequeños, nariz negra, pelaje plano #E86A30, sin estilo Disney/Pixar)?
2. ¿Hay un máximo de 2 objetos de apoyo y están a los lados, NUNCA detrás del zorro?
3. ¿La franja superior 0-420 está LIMPIA sin objetos, y la inferior 1280-1920 también?
4. ¿El zorro tiene 100+ px de aire alrededor?
Si respondes NO a cualquiera, REGENERA mentalmente antes de devolver la imagen.

FONDO PREMIUM (consistencia de marca):
- Gradiente radial desde el centro: #1E293B (slate 800) hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% opacidad)
- Glow ambiental naranja (#E86A30 al 20% opacidad) con blur amplio detrás del zorro como halo
- 3-5 partículas de luz blancas difusas

PALETA: fondo slate oscuro + glow naranja. Zorro naranja PLANO + verde sólido + líneas negras. Objetos con colores planos vibrantes (naranja, verde, azul eléctrico, blanco) y contornos negros gruesos.

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte.`;
}

const SYSTEM_PROMPT_HISTORIA_TEXTO = `Eres el Community Manager de WebMakerLatam, una AGENCIA DIGITAL que ayuda a EMPRENDEDORES, PYMES y EMPRESAS de Latinoamérica a crecer con tecnología (desarrollo web, e-commerce, software a medida, chatbots con IA, apps móviles, SEO/marketing digital). Tu mascota es Webi (zorro naranja con lentes).

AUDIENCIA: dueños de negocio que NO son técnicos. Háblales en BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, profesionalizar marca, atender 24/7), nunca jerga técnica.

EJEMPLOS DE BUENOS COPIES:
✅ "Tu web vende aunque tú duermas"
✅ "Deja de perder clientes por responder tarde"
✅ "De idea a negocio digital en 30 días"
✅ "3 señales de que tu negocio necesita un chatbot"

EJEMPLOS MALOS (PROHIBIDOS salvo audiencia dev explícita):
❌ "git bisect: encuentra bugs en segundos"
❌ "Mejores hooks de React"
❌ "Tutorial de async/await"

Genera el TEXTO que va a acompañar una HISTORIA (story 9:16).

REGLAS ESTRICTAS DE LONGITUD (OBLIGATORIAS - NO NEGOCIABLES):
- copy_principal: MÁXIMO 40 CARACTERES (incluyendo espacios). Debe caber en 2 líneas de ~20 caracteres. Hook punzante orientado a beneficio.
- sub_copy: MÁXIMO 80 CARACTERES en 2 líneas. Contexto breve.
- cta: MÁXIMO 25 CARACTERES, accionable, EMPIEZA con verbo (Agenda, Escríbenos, Descubre, Guarda, etc.)
- hashtags: MÁXIMO 5 hashtags, deben caber en 2 líneas. Al menos 1 de marca (#WebMakerLatam, #WebMaker o #ComunidadWebMaker) y 2-3 de industria (#Emprendedores, #PymesLatam, #NegociosOnline, #Ecommerce, #Chatbot, #IA, #PaginasWeb, etc.)

Si cualquier texto excede estos límites, REESCRÍBELO MÁS CORTO antes de responder. PREFIERE IMPACTO sobre información.

EJEMPLOS DE COPY_PRINCIPAL QUE FUNCIONAN (≤40 chars):
✅ "Tu web vende mientras duermes" (29)
✅ "¿Tu web se ve mal en celular?" (29)
✅ "Sé encontrado. O sé olvidado." (30)
✅ "Clientes 24/7 con un chatbot" (28)
✅ "Deja de perder clientes hoy" (27)

EJEMPLOS QUE NO FUNCIONAN (muy largos - PROHIBIDOS):
❌ "Tus clientes te buscan en Google y encuentran a tu competencia" (62)
❌ "Por qué tu negocio pierde clientes cada día sin una web profesional" (66)

Tono: cercano, latino, accesible, sin cringe. Habla de "tú". CERO emojis (interfieren con el render).

FORMATO DE SALIDA: SOLO un objeto JSON válido, sin markdown, sin texto adicional. Estructura:
{ "copy_principal": "...", "sub_copy": "...", "cta": "...", "hashtags": "#... #..." }`;

async function callClaudeHistoria(
  tipoHistoria: string, concepto: string, extraInstruction?: string,
): Promise<{ copy_principal: string; sub_copy: string; cta: string; hashtags: string }> {
  const userMessage = `TIPO de historia: ${tipoHistoria}
TEMA/CONCEPTO: ${concepto}

Genera el JSON con copy_principal, sub_copy, cta y hashtags. Solo el JSON.${extraInstruction ? "\n\n" + extraInstruction : ""}`;
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT_HISTORIA_TEXTO,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content[0];
  const raw = block && block.type === "text" ? block.text.trim() : "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    copy_principal: stripEmojis(String(parsed.copy_principal || "")),
    sub_copy: stripEmojis(String(parsed.sub_copy || "")),
    cta: stripEmojis(String(parsed.cta || "")),
    hashtags: stripEmojis(String(parsed.hashtags || "")),
  };
}

// Limites estrictos del nuevo layout
const HIST_LIMITS = { copy_principal: 40, sub_copy: 80, cta: 25 };

function excedeLimites(t: { copy_principal: string; sub_copy: string; cta: string }): string[] {
  const issues: string[] = [];
  if (t.copy_principal.length > HIST_LIMITS.copy_principal)
    issues.push(`copy_principal tiene ${t.copy_principal.length} chars, máximo ${HIST_LIMITS.copy_principal}`);
  if (t.sub_copy.length > HIST_LIMITS.sub_copy)
    issues.push(`sub_copy tiene ${t.sub_copy.length} chars, máximo ${HIST_LIMITS.sub_copy}`);
  if (t.cta.length > HIST_LIMITS.cta)
    issues.push(`cta tiene ${t.cta.length} chars, máximo ${HIST_LIMITS.cta}`);
  return issues;
}

async function generarTextoHistoria(tipoHistoria: string, concepto: string): Promise<{
  copy_principal: string; sub_copy: string; cta: string; hashtags: string;
}> {
  let texto = await callClaudeHistoria(tipoHistoria, concepto);
  const issues = excedeLimites(texto);
  if (issues.length > 0) {
    console.log("[Historias] copy excede límites, pidiendo versión más corta:", issues);
    try {
      texto = await callClaudeHistoria(
        tipoHistoria, concepto,
        `IMPORTANTE: tu intento anterior excedió los límites: ${issues.join("; ")}. REESCRIBE TODO el JSON con versiones MÁS CORTAS y PUNZANTES que sí respeten los máximos. Prefiere impacto sobre información.`,
      );
    } catch (e) {
      console.warn("[Historias] retry de copy falló, uso truncamiento duro:", e);
    }
  }
  return {
    copy_principal: texto.copy_principal.slice(0, HIST_LIMITS.copy_principal),
    sub_copy: texto.sub_copy.slice(0, HIST_LIMITS.sub_copy),
    cta: texto.cta.slice(0, HIST_LIMITS.cta),
    hashtags: texto.hashtags,
  };
}

// Render texto sobre historia 9:16 con LAYOUT POR ZONAS FIJAS (1080x1920):
//   Z1 Título    : 0     - 420   (centro 210)
//   Z2 Imagen    : 420   - 1280  (zorro vive aquí, sin overlay)
//   Z3 Sub-copy  : 1280  - 1500  (centro 1390)
//   Z4 Botón CTA : 1500  - 1720  (centro 1610)
//   Z5 Hashtags  : 1720  - 1860  (centro 1790, padding 60 al borde inferior)
async function renderTextoEnHistoria(
  imagenBase64: string,
  texto: { copy_principal: string; sub_copy: string; cta: string; hashtags: string },
): Promise<string> {
  const imgBuffer = Buffer.from(imagenBase64, "base64");
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const sidePadding = 80;
  const innerWidth = w - sidePadding * 2;

  const principal = stripEmojis(texto.copy_principal);
  const sub = stripEmojis(texto.sub_copy);
  const cta = stripEmojis(texto.cta);
  const hashtags = stripEmojis(texto.hashtags);

  // Centros de cada zona
  const Z1_TOP = 0,       Z1_BOTTOM = 420;
  const Z3_TOP = 1280,    Z3_BOTTOM = 1500;
  const Z4_TOP = 1500,    Z4_BOTTOM = 1720;
  const Z5_TOP = 1720,    Z5_BOTTOM = 1860; // 60 px de padding al borde inferior (h=1920)

  const z1Center = (Z1_TOP + Z1_BOTTOM) / 2;       // 210
  const z3Center = (Z3_TOP + Z3_BOTTOM) / 2;       // 1390
  const z4Center = (Z4_TOP + Z4_BOTTOM) / 2;       // 1610
  const z5Center = (Z5_TOP + Z5_BOTTOM) / 2;       // 1790

  // Título: 72-88px, máximo 2 líneas. Si no cabe en 2 líneas a 64px, baja a 56 antes de 3.
  const principalFit = principal ? fitTextBlock(principal, {
    maxWidth: innerWidth,
    maxHeight: Z1_BOTTOM - Z1_TOP - 160, // padding top 80, bottom 80
    maxFontSize: 88,
    minFontSize: 56,
    charWidthRatio: 0.55,
  }) : null;

  // Sub-copy: 44-52px Inter 600
  const subFit = sub ? fitTextBlock(sub, {
    maxWidth: w - 200, // padding lateral 100
    maxHeight: Z3_BOTTOM - Z3_TOP - 40,
    maxFontSize: 52,
    minFontSize: 36,
    charWidthRatio: 0.5,
  }) : null;

  // CTA: 44px Inter 700
  const ctaFit = cta ? fitTextBlock(cta, {
    maxWidth: innerWidth - 128,
    maxHeight: 80,
    maxFontSize: 44,
    minFontSize: 32,
    charWidthRatio: 0.55,
  }) : null;

  // Hashtags: 32px Inter 500
  const hashFit = hashtags ? fitTextBlock(hashtags, {
    maxWidth: innerWidth,
    maxHeight: Z5_BOTTOM - Z5_TOP - 20,
    maxFontSize: 32,
    minFontSize: 24,
    charWidthRatio: 0.5,
  }) : null;

  // CTA pill button con sombra
  const ctaSvg = ctaFit ? (() => {
    const padX = 64, padY = 26;
    const btnWidth = Math.min(innerWidth, ctaFit.blockWidth + padX * 2);
    const btnHeight = Math.max(88, ctaFit.blockHeight + padY * 2);
    const btnX = (w - btnWidth) / 2;
    const btnY = z4Center - btnHeight / 2;
    const baselineY = btnY + (btnHeight - ctaFit.blockHeight) / 2 + ctaFit.fontSize * 0.82;
    return `
      <rect x="${btnX.toFixed(1)}" y="${(btnY + 8).toFixed(1)}" width="${btnWidth.toFixed(1)}" height="${btnHeight.toFixed(1)}"
        rx="${btnHeight / 2}" fill="#E86A30" fill-opacity="0.30" filter="url(#ctashadow)"/>
      <rect x="${btnX.toFixed(1)}" y="${btnY.toFixed(1)}" width="${btnWidth.toFixed(1)}" height="${btnHeight.toFixed(1)}"
        rx="${btnHeight / 2}" fill="#E86A30"/>
      ${ctaFit.lines.map((line, i) => `
        <text x="${w / 2}" y="${(baselineY + i * ctaFit.lineHeight).toFixed(1)}" text-anchor="middle"
          font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="700"
          font-size="${ctaFit.fontSize}" fill="#ffffff">${escapeXml(line)}</text>
      `).join("")}
    `;
  })() : "";

  // Separador naranja sutil arriba de la zona de sub-copy
  const separatorSvg = subFit
    ? `<line x1="${(w/2 - 100).toFixed(1)}" y1="${Z3_TOP - 10}" x2="${(w/2 + 100).toFixed(1)}" y2="${Z3_TOP - 10}" stroke="#E86A30" stroke-opacity="0.35" stroke-width="3"/>`
    : "";

  // Gradientes en las zonas reservadas para mejorar legibilidad sin parecer cajas
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_DEFS}
    <filter id="ctashadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14"/>
    </filter>
    <rect x="0" y="0" width="${w}" height="${Z1_BOTTOM}" fill="url(#topfade)"/>
    <rect x="0" y="${Z3_TOP}" width="${w}" height="${h - Z3_TOP}" fill="url(#botfade)"/>
    ${principalFit ? renderTextBlockSvg(principalFit, {
      canvasWidth: w, centerY: z1Center, fontWeight: 900, color: "#ffffff",
      bgOpacity: 0, filterId: "textds", letterSpacing: -2,
    } as any) : ""}
    ${separatorSvg}
    ${subFit ? renderTextBlockSvg(subFit, {
      canvasWidth: w, centerY: z3Center, fontWeight: 600, color: "#f1f5f9",
      bgOpacity: 0, filterId: "textds", letterSpacing: -0.5,
    } as any) : ""}
    ${ctaSvg}
    ${hashFit ? renderTextBlockSvg(hashFit, {
      canvasWidth: w, centerY: z5Center, fontWeight: 500, color: "#fb923c",
      bgOpacity: 0, filterId: "textds", letterSpacing: 0,
    } as any) : ""}
  </svg>`;

  const composed = await sharp(imgBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer();
  return composed.toString("base64");
}

const GenerarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  pose_override: z.string().optional(),
  texto_en_imagen: z.boolean().optional().default(false),
});

router.post("/community/historias/generar", async (req, res) => {
  try {
    const body = GenerarHistoriaBody.parse(req.body);
    const prompt = buildHistoriaPrompt(body.tipo_historia, body.concepto, body.pose_override);
    const referenceBase64 = await getFoxRefBase64();

    const contents = referenceBase64
      ? [{ role: "user" as const, parts: [
          { inlineData: { data: referenceBase64, mimeType: "image/png" } },
          { text: prompt },
        ] }]
      : [{ role: "user" as const, parts: [{ text: prompt }] }];

    const [imageResp, texto] = await Promise.all([
      ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      generarTextoHistoria(body.tipo_historia, body.concepto),
    ]);

    const imagePart = imageResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      res.status(502).json({ success: false, error: "Gemini no devolvió imagen" });
      return;
    }

    let imgBase64 = imagePart.inlineData.data as string;
    const mime = imagePart.inlineData.mimeType || "image/png";

    if (body.texto_en_imagen) {
      try {
        imgBase64 = await renderTextoEnHistoria(imgBase64, texto);
      } catch (e) {
        console.error("[Historias] render texto fallo:", e);
      }
    }

    const imagenDataUrl = `data:${body.texto_en_imagen ? "image/png" : mime};base64,${imgBase64}`;

    const [row] = await db.insert(communityContent).values({
      kind: "historia",
      subtype: body.tipo_historia,
      topic: body.concepto,
      data: { tipo_historia: body.tipo_historia, concepto: body.concepto, pose: body.pose_override || "auto", texto, texto_en_imagen: body.texto_en_imagen },
      imageUrl: imagenDataUrl,
    }).returning();

    res.json({
      success: true,
      data: {
        id: row!.id, imagen: imagenDataUrl, tipo_historia: body.tipo_historia,
        concepto: body.concepto, texto, texto_en_imagen: body.texto_en_imagen, fecha: row!.createdAt,
      },
    });
  } catch (err: any) {
    console.error("[Historias] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/historias", async (_req, res) => {
  const rows = await db.select().from(communityContent)
    .where(eq(communityContent.kind, "historia"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/historias/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ success: false, error: "id inválido" }); return; }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

// ============================================
// DESCRIPCIONES (audiencia: emprendedores)
// ============================================

const SYSTEM_PROMPT_DESC = `Eres el Community Manager oficial de WebMakerLatam, una AGENCIA DIGITAL que ayuda a EMPRENDEDORES, PYMES y EMPRESAS de Latinoamérica a crecer con tecnología (desarrollo web, e-commerce, software a medida, chatbots con IA, apps móviles, SEO/marketing digital). Tu mascota es Webi (zorro naranja con lentes).

AUDIENCIA: dueños de negocio que NO son técnicos. Habla de BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, profesionalizar marca, atender 24/7), nunca jerga técnica. Conecta el contenido con servicios de WebMakerLatam de forma natural, sin ser spam.

EJEMPLOS BUENOS:
✅ "Tu web vende aunque tú duermas"
✅ "Deja de perder clientes por responder tarde"

PROHIBIDOS (salvo audiencia dev explícita):
❌ Tutoriales de código, librerías, frameworks técnicos

REGLAS DE ESCRITURA (NO NEGOCIABLES):
1. MÁXIMO 5 LÍNEAS por descripción
2. Tono cercano, latino, accesible, sin cringe
3. SIEMPRE pregunta o CTA al final para generar comentarios
4. Emojis con moderación (0-3)
5. Habla de "tú"
6. Conecta con servicios de la agencia cuando sea natural

ESTRUCTURA POR RED:
📱 TIKTOK: hook + 1-2 líneas + CTA + 5-7 hashtags (mezcla nicho+trending+marca)
📸 INSTAGRAM: hook emocional + 3-4 líneas con valor/storytelling + pregunta + 8-12 hashtags
▶️ YOUTUBE SHORTS: keyword en línea 1 + descripción clara + CTA + 4-6 hashtags (#shorts obligatorio)
🐦 X/TWITTER: MÁX 280 caracteres totales incluyendo hashtags. Hook punzante + insight + 2-3 hashtags

HASHTAGS DE MARCA: #WebMakerLatam #WebMaker #ComunidadWebMaker (al menos 2 excepto Twitter donde es opcional).
HASHTAGS DE INDUSTRIA del cliente sugeridos: #Emprendedores #PymesLatam #NegociosOnline #Marketing #Ecommerce #PaginasWeb #Chatbot #IA #Automatizacion #SEO #MarketingDigital #VendeMas #WhatsAppBusiness

SLIDES DEL CARRUSEL (cuando se solicite):
- Carrusel narrativo con esta estructura por rol:
  * Slide 1 "portada": HOOK. Plantea pregunta/dolor. Título corto y potente. Visual: el zorro con cara de pregunta + elemento del problema.
  * Slides "desarrollo": dependiendo del flujo, pueden ser PROBLEMA (zorro mostrando algo que no funciona), SOLUCIÓN (zorro presentando la respuesta), BENEFICIO (zorro celebrando resultado). Cada slide UN solo punto/idea.
  * Slide última "cta": invitación a contactar/agendar/comentar. Visual: zorro con pose invitante + icono de WhatsApp o calendario.
- Cada slide tiene "titulo" (máx 50 chars), "subtitulo" (máx 90 chars) y "prompt_visual" (descripción breve en español del foco visual y la pose del zorro para esta slide específica, sin texto, indicando objetos relevantes al tema).

PUBLICACIÓN ÚNICA: 1 sola slide rol "unica" con titulo + subtitulo + prompt_visual.

FORMATO DE SALIDA (JSON ESTRICTO, sin markdown, sin texto adicional):
{
  "redes": {
    "tiktok": { "descripcion": "...", "hashtags": "#... #..." },
    "instagram": { "descripcion": "...", "hashtags": "#... #..." },
    "youtube_shorts": { "descripcion": "...", "hashtags": "#... #..." },
    "twitter": { "post_completo": "..." }
  },
  "slides": [
    { "numero": 1, "rol": "portada", "titulo": "...", "subtitulo": "...", "prompt_visual": "..." }
  ]
}

Solo incluye en "redes" las que fueron solicitadas. Siempre incluye "slides" con la cantidad pedida.`;

const GenerarDescripcionesBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  redes: z.array(z.enum(["tiktok", "instagram", "youtube_shorts", "twitter"])).min(1),
  tipo_publicacion: z.enum(["unica", "carrusel"]).default("unica"),
  cantidad_slides: z.number().int().min(1).max(5).default(1),
  texto_en_imagen: z.boolean().optional().default(false),
});

type SlideRol = "portada" | "desarrollo" | "cta" | "unica";
interface SlidePlan {
  numero: number;
  rol: SlideRol;
  titulo: string;
  subtitulo: string;
  prompt_visual?: string;
}

function buildSlidePrompt(
  tema: string,
  tipoContenido: string,
  slide: SlidePlan,
  formato: "1:1" | "4:5",
  totalSlides: number,
): string {
  const dims = formato === "1:1" ? "1080x1080 píxeles formato cuadrado 1:1" : "1080x1350 píxeles formato vertical 4:5";

  const rolDescripcion = {
    portada: "PORTADA del carrusel. El zorro Webi tiene CARA DE PREGUNTA / CURIOSIDAD / hook (cabeza ligeramente inclinada, una pata en el mentón, o señalando con expresión de '¿sabías que...?'). Aparece junto a un ELEMENTO VISUAL del problema o tema. Es el HOOK que invita a deslizar. El zorro ocupa al menos 40% del área central.",
    desarrollo: `SLIDE DE DESARROLLO ${slide.numero} de ${totalSlides}. Según el subtítulo de esta slide, decide si es: PROBLEMA (zorro con cara preocupada señalando algo que no funciona), SOLUCIÓN (zorro presentando con confianza la respuesta, pose de '¡eureka!' con bombilla o pulgar arriba), o BENEFICIO (zorro celebrando un resultado, gráfico ascendente, expresión de triunfo). El zorro debe INTERACTUAR con el objeto principal del tema (señalándolo, sosteniéndolo, empujándolo). Ocupa 30-40% del área central.`,
    cta: "SLIDE FINAL DE CTA. El zorro Webi en pose INVITANTE: brazos abiertos, sonrisa cálida, una pata extendida hacia el espectador, o señalando un icono de WhatsApp / burbuja de chat / calendario. Expresión de cercanía y entusiasmo, invitando a escribir/agendar/contactar. El zorro ocupa al menos 40% del área central.",
    unica: "PUBLICACIÓN ÚNICA. El zorro Webi es protagonista absoluto en una escena que ilustra el tema. Su pose y expresión deben coincidir con el tono del subtítulo (pregunta, problema, solución, celebración). El zorro INTERACTÚA con el objeto principal del tema (señala, sostiene, muestra). Ocupa al menos 35% del área central.",
  }[slide.rol];

  const enfoqueVisual = slide.prompt_visual
    ? `FOCO VISUAL ESPECÍFICO de esta slide (del estratega de contenido): "${slide.prompt_visual}". Sigue esta dirección.`
    : `Ilustra: "${slide.titulo}" — extrae las palabras clave visuales de este título y úsalas como objetos.`;

  return `Genera una ilustración en ${dims} para una publicación de WebMakerLatam (agencia digital para emprendedores y pymes en LATAM).

REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo ni texto en la imagen. CERO caracteres alfanuméricos. Pantallas muestran formas abstractas, NUNCA texto legible.

${FOX_BRAND_SPEC}

CONSISTENCIA CRÍTICA DEL CARRUSEL: este zorro debe verse 100% IDÉNTICO al de las otras slides del mismo carrusel. Mismo color, mismas proporciones, mismo trazo, mismo estilo flat cartoon. Solo cambia su POSE y EXPRESIÓN según el rol narrativo de esta slide.

ROL NARRATIVO DE ESTA SLIDE:
${rolDescripcion}

CONTEXTO DE LA PUBLICACIÓN:
TEMA general: "${tema}" (${tipoContenido})
TÍTULO de esta slide: "${slide.titulo}"
SUBTÍTULO de esta slide: "${slide.subtitulo}"
${enfoqueVisual}

OBJETOS DE LA ESCENA (REGLAS ESTRICTAS - "MENOS ES MÁS"):
- MÁXIMO 2-3 objetos principales en TODA la escena (no 5, no 7). Cuando hay demasiados elementos, el zorro pierde consistencia visual porque el modelo "balancea" estilos.
- Extrae las PALABRAS CLAVE VISUALES del tema y del foco de esta slide. Mapeo (elige UNO o DOS, no todos):
  * chatbot/WhatsApp → burbuja de chat verde O smartphone (uno solo)
  * web/sitio → laptop con web abstracta (sin texto)
  * ventas → carrito O gráfico ascendente (uno)
  * velocidad → cohete O velocímetro
  * automatización/IA → engranajes O cerebro digital
  * clientes → 2-3 siluetas pequeñas
  * SEO → lupa O podio
  * móvil/app → smartphone
  * agendar → calendario
- Los objetos INTERACTÚAN con el zorro (señala/sostiene/empuja), NUNCA flotan amontonados
- Colores planos vibrantes y SIMPLES; NUNCA muchos elementos coloridos juntos compitiendo con el zorro
- ESCENA NARRATIVA SIMPLE: zorro + 1-2 objetos clave bien colocados

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- 22% SUPERIOR (formato 1:1: 0-220px / formato 4:5: 0-280px) = fondo limpio SIN elementos (reservado para título)
- 25% INFERIOR (formato 1:1: 880-1080px / formato 4:5: 1050-1350px) = fondo limpio SIN elementos (reservado para subtítulo)
- Toda la acción visual (zorro y objetos) va estrictamente en el centro
- NADA invade las zonas reservadas: ni el zorro, ni sus pies, ni objetos, ni sombras

FONDO PREMIUM (consistencia entre todas las slides del carrusel):
- Gradiente radial desde el centro: #1E293B (slate 800) hacia #0F172A (slate 900) en bordes
- Grid geométrico muy sutil (líneas blancas al 3-5% opacidad)
- Glow ambiental naranja (#E86A30 al 20% opacidad) detrás del foco como halo
- 3-5 partículas de luz blancas difusas

PALETA: fondo slate oscuro + glow naranja. Zorro naranja PLANO + verde sólido + líneas negras. Objetos con colores planos vibrantes (naranja, verde, azul eléctrico, blanco) y contornos negros gruesos.

CONSISTENCIA DEL CARRUSEL: esta slide debe verse del MISMO universo visual que las demás (mismo fondo, paleta, estilo flat cartoon). El zorro siempre IDÉNTICO a la referencia.

VALIDACIÓN FINAL ANTES DE ENTREGAR LA IMAGEN — verifica MENTALMENTE:
1. ¿Los OJOS del zorro son PEQUEÑOS y simples (NO grandes, redondos y brillosos estilo Disney/Pixar/chibi)?
2. ¿La NARIZ del zorro es NEGRA (NO rosada)?
3. ¿La CARA es ESTILIZADA y ligeramente alargada (NO redonda y "cute" estilo chibi)?
4. ¿El PELAJE es UN SOLO color naranja plano #E86A30 SIN brillos, reflejos, sombras ni gradientes?
5. ¿Los CRISTALES de los lentes están totalmente transparentes SIN reflejos blancos?
6. ¿Las LÍNEAS del contorno son negras, gruesas y uniformes (NO finas ni con variación de grosor)?
7. ¿Hay MÁXIMO 2-3 objetos en escena (no un montón amontonados)?
Si respondiste NO a cualquiera de estas, el zorro está INCORRECTO y debes REGENERAR mentalmente la imagen antes de entregarla. Cualquier desviación rompe el branding registrado.

RECUERDA: CERO TEXTO. Ni una letra ni número en NINGUNA parte.`;
}

async function generarImagenSlide(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
): Promise<string> {
  const prompt = buildSlidePrompt(tema, tipoContenido, slide, formato, totalSlides);
  const contents = referenceBase64
    ? [{ role: "user" as const, parts: [
        { inlineData: { data: referenceBase64, mimeType: "image/png" } },
        { text: prompt },
      ] }]
    : [{ role: "user" as const, parts: [{ text: prompt }] }];

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents,
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imagePart?.inlineData?.data) {
    throw new Error(`Gemini no devolvió imagen para slide ${slide.numero}`);
  }
  return imagePart.inlineData.data as string;
}

async function generarImagenSlideConRetry(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
): Promise<string> {
  try {
    return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides);
  } catch (e) {
    console.warn(`[Descripciones] retry slide ${slide.numero}:`, (e as Error).message);
    return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides);
  }
}

// Render texto sobre slide (1:1 o 4:5) con auto-fit, padding y fondos semi-transparentes, SIN emojis
async function renderTextoEnSlide(
  imagenBase64: string,
  slide: SlidePlan,
  totalSlides: number = 1,
): Promise<string> {
  const imgBuffer = Buffer.from(imagenBase64, "base64");
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1350;
  const sidePadding = 80;
  const innerWidth = w - sidePadding * 2;

  // Zonas reservadas según formato + padding al borde
  const isCuadrado = Math.abs(w - h) < 50;
  const edgePad = 50; // padding desde el borde superior/inferior
  const topZoneEnd = isCuadrado ? 230 : 290;
  const bottomZoneStart = isCuadrado ? h - 230 : h - 290;

  const topCenterY = (edgePad + topZoneEnd) / 2;
  const topMaxHeight = topZoneEnd - edgePad - 20;
  const bottomCenterY = (bottomZoneStart + h - edgePad) / 2;
  const bottomMaxHeight = (h - edgePad - bottomZoneStart) - 20;

  const titulo = stripEmojis(slide.titulo);
  const subtitulo = stripEmojis(slide.subtitulo);

  const tituloFit = titulo ? fitTextBlock(titulo, {
    maxWidth: innerWidth - 48,
    maxHeight: topMaxHeight - 48,
    maxFontSize: 76,
    minFontSize: 48,
  }) : null;

  const subFit = subtitulo ? fitTextBlock(subtitulo, {
    maxWidth: innerWidth - 48,
    maxHeight: bottomMaxHeight - 36,
    maxFontSize: 44,
    minFontSize: 28,
    charWidthRatio: 0.5,
  }) : null;

  // Indicador de slide (esquina superior derecha) si hay más de 1 slide
  const indicador = totalSlides > 1
    ? `<text x="${w - 50}" y="60" text-anchor="end" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="28" fill="#ffffff" fill-opacity="0.55" filter="url(#textds)">${String(slide.numero).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}</text>`
    : "";

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_DEFS}
    <rect x="0" y="0" width="${w}" height="${topZoneEnd}" fill="url(#topfade)"/>
    <rect x="0" y="${bottomZoneStart}" width="${w}" height="${h - bottomZoneStart}" fill="url(#botfade)"/>
    ${tituloFit ? renderTextBlockSvg(tituloFit, {
      canvasWidth: w, centerY: topCenterY, fontWeight: 900, color: "#ffffff",
      bgOpacity: 0, filterId: "textds", letterSpacing: -2,
    } as any) : ""}
    ${subFit ? renderTextBlockSvg(subFit, {
      canvasWidth: w, centerY: bottomCenterY, fontWeight: 600, color: "#f1f5f9",
      bgOpacity: 0, filterId: "textds", letterSpacing: -0.5,
    } as any) : ""}
    ${indicador}
  </svg>`;

  const composed = await sharp(imgBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png().toBuffer();
  return composed.toString("base64");
}

router.post("/community/descripciones/generar", async (req, res) => {
  try {
    const body = GenerarDescripcionesBody.parse(req.body);
    const cantidad = body.tipo_publicacion === "carrusel"
      ? Math.max(3, Math.min(5, body.cantidad_slides))
      : 1;
    const formato: "1:1" | "4:5" = body.tipo_publicacion === "carrusel" ? "4:5" : "1:1";

    const userMessage = `TEMA: ${body.tema}
TIPO de contenido: ${body.tipo_contenido}
REDES solicitadas: ${body.redes.join(", ")}
TIPO de publicación: ${body.tipo_publicacion}
CANTIDAD de slides: ${cantidad}

Genera el JSON con "redes" (solo las solicitadas) y "slides" (${cantidad} slide${cantidad > 1 ? "s" : ""}).
${body.tipo_publicacion === "carrusel"
  ? `La slide 1 es rol "portada" (HOOK con pregunta/dolor), la última rol "cta" (invitación a contactar). Las del medio rol "desarrollo" siguiendo flujo PROBLEMA → SOLUCIÓN → BENEFICIO según corresponda. Cada slide debe tener un "prompt_visual" claro indicando la pose del zorro y los objetos a mostrar.`
  : `La única slide es rol "unica". Incluye un "prompt_visual" claro.`}
Solo el JSON.`;

    const claudeResp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT_DESC,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = claudeResp.content[0];
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let claudeData: any;
    try {
      claudeData = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ success: false, error: "La IA no devolvió JSON válido. Intenta de nuevo.", raw: cleaned });
      return;
    }

    const slidesPlan: SlidePlan[] = Array.isArray(claudeData.slides) && claudeData.slides.length > 0
      ? claudeData.slides.slice(0, cantidad).map((s: any, i: number): SlidePlan => ({
          numero: s.numero || i + 1,
          rol: (s.rol as SlideRol) || (cantidad === 1 ? "unica" : (i === 0 ? "portada" : i === cantidad - 1 ? "cta" : "desarrollo")),
          titulo: String(s.titulo || "").slice(0, 70),
          subtitulo: String(s.subtitulo || "").slice(0, 110),
          prompt_visual: s.prompt_visual ? String(s.prompt_visual).slice(0, 280) : undefined,
        }))
      : Array.from({ length: cantidad }, (_, i): SlidePlan => ({
          numero: i + 1,
          rol: cantidad === 1 ? "unica" : (i === 0 ? "portada" : i === cantidad - 1 ? "cta" : "desarrollo"),
          titulo: body.tema.slice(0, 70),
          subtitulo: "",
        }));

    const referenceBase64 = await getFoxRefBase64();

    const settled = await Promise.allSettled(
      slidesPlan.map((s) => generarImagenSlideConRetry(body.tema, body.tipo_contenido, s, formato, referenceBase64, cantidad)),
    );

    const imagenes = await Promise.all(
      slidesPlan.map(async (slide, idx) => {
        const r = settled[idx]!;
        if (r.status === "rejected") {
          return {
            numero_slide: slide.numero, rol: slide.rol,
            titulo: slide.titulo, subtitulo: slide.subtitulo,
            imagen: null, error: (r.reason as Error)?.message || "Falló la generación",
          };
        }
        let imgBase64 = r.value;
        if (body.texto_en_imagen) {
          try {
            imgBase64 = await renderTextoEnSlide(imgBase64, slide, cantidad);
          } catch (e) {
            console.error("[Descripciones] render texto fallo slide", slide.numero, e);
          }
        }
        return {
          numero_slide: slide.numero, rol: slide.rol,
          titulo: slide.titulo, subtitulo: slide.subtitulo,
          imagen: `data:image/png;base64,${imgBase64}`,
        };
      }),
    );

    const descripciones = claudeData.redes || {};

    const [row] = await db.insert(communityContent).values({
      kind: "descripcion",
      subtype: body.tipo_contenido,
      topic: body.tema,
      data: {
        tema: body.tema, tipo_contenido: body.tipo_contenido, redes: body.redes,
        tipo_publicacion: body.tipo_publicacion, cantidad_slides: cantidad,
        texto_en_imagen: body.texto_en_imagen, descripciones, slides_textos: slidesPlan,
      },
      imageUrl: imagenes.find((i) => i.imagen)?.imagen || null,
    }).returning();

    res.json({
      success: true,
      data: {
        id: row!.id, fecha: row!.createdAt, tema: body.tema,
        tipo_contenido: body.tipo_contenido, tipo_publicacion: body.tipo_publicacion,
        texto_en_imagen: body.texto_en_imagen, imagenes, descripciones,
      },
    });
  } catch (err: any) {
    console.error("[Descripciones] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

const ReintentarSlideBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  numero_slide: z.number().int().min(1).max(5),
  rol: z.enum(["portada", "desarrollo", "cta", "unica"]),
  titulo: z.string().max(120),
  subtitulo: z.string().max(200),
  prompt_visual: z.string().max(300).optional(),
  formato: z.enum(["1:1", "4:5"]).default("4:5"),
  texto_en_imagen: z.boolean().optional().default(false),
  total_slides: z.number().int().min(1).max(5).optional().default(1),
});

router.post("/community/descripciones/reintentar-slide", async (req, res) => {
  try {
    const body = ReintentarSlideBody.parse(req.body);
    const slide: SlidePlan = {
      numero: body.numero_slide, rol: body.rol,
      titulo: body.titulo, subtitulo: body.subtitulo, prompt_visual: body.prompt_visual,
    };
    const referenceBase64 = await getFoxRefBase64();
    let imgBase64 = await generarImagenSlideConRetry(body.tema, body.tipo_contenido, slide, body.formato, referenceBase64, body.total_slides);
    if (body.texto_en_imagen) {
      try { imgBase64 = await renderTextoEnSlide(imgBase64, slide); } catch {}
    }
    res.json({
      success: true,
      data: {
        numero_slide: slide.numero, rol: slide.rol,
        titulo: slide.titulo, subtitulo: slide.subtitulo,
        imagen: `data:image/png;base64,${imgBase64}`,
      },
    });
  } catch (err: any) {
    console.error("[Reintentar slide] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/descripciones", async (_req, res) => {
  const rows = await db.select().from(communityContent)
    .where(eq(communityContent.kind, "descripcion"))
    .orderBy(desc(communityContent.createdAt));
  res.json({ success: true, data: rows });
});

router.delete("/community/descripciones/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ success: false, error: "id inválido" }); return; }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

export default router;
