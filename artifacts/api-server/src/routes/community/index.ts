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

  return `
    <rect x="${bgX.toFixed(1)}" y="${bgY.toFixed(1)}" width="${bgWidth.toFixed(1)}" height="${bgHeight.toFixed(1)}"
      rx="${bgRadius}" fill="${bgColor}" fill-opacity="${bgOpacity}" />
    ${fit.lines.map((line, i) => `
      <text x="${opts.canvasWidth / 2}" y="${(firstBaselineY + i * fit.lineHeight).toFixed(1)}"
        text-anchor="middle" font-family="'Inter','Helvetica Neue',Arial,sans-serif"
        font-weight="${opts.fontWeight}" font-size="${fit.fontSize}" fill="${opts.color}"
        filter="url(#${opts.filterId})">${escapeXml(line)}</text>
    `).join("")}
  `;
}

const SVG_FILTER_DEFS = `
  <defs>
    <filter id="textds" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
      <feOffset dx="0" dy="2" result="offsetblur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.85"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
`;

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

PERSONAJE - ESTILO FLAT CARTOON PURO (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico llamado Webi, con lentes rectangulares negros gruesos y polera verde oscuro
- SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado
- Ocupa al menos 35% del área visual CENTRAL. Es el PROTAGONISTA
- ESTILO OBLIGATORIO: FLAT CARTOON PURO con colores planos sólidos. SIN sombras realistas, SIN sombreados degradados, SIN texturas en el pelaje, SIN volumen 3D, SIN highlights brillantes. Solo líneas de contorno NEGRAS GRUESAS y colores totalmente PLANOS (naranja vibrante uniforme, verde uniforme, blanco, negro). Debe verse IDÉNTICO al zorro de la imagen de referencia (mismas proporciones, misma cabeza grande, mismos ojos detrás de los lentes, misma polera verde oscuro). Si dudas, copia la referencia.
- POSE Y EXPRESIÓN ESPECÍFICA para esta historia (categoría narrativa: "${categoria}"): ${pose}
- POSICIÓN VERTICAL: el zorro debe estar ELEVADO en el cuadro. Sus PIES deben terminar ANTES del píxel 1370 (no más abajo). La cabeza debe estar a partir del píxel 420 aproximadamente. Esto deja libre la franja inferior 1370-1920 para el texto.

CONTENIDO Y CONTEXTO:
TIPO de historia: "${tipoHistoria}"
CONCEPTO/TEMA del día: "${concepto}"

OBJETOS DE LA ESCENA (REGLAS ESTRICTAS):
- Extrae las PALABRAS CLAVE VISUALES del tema y úsalas como objetos. Ejemplos:
  * "chatbot" / "responder" / "WhatsApp" → burbuja de chat verde estilo WhatsApp, smartphone, robot pequeño amigable
  * "web" / "sitio" / "landing" → pantalla de laptop o monitor mostrando una web abstracta (sin texto), cursor del mouse
  * "ventas" / "vender más" / "ingresos" → carrito de compras, gráfico de barras ascendente, signos de moneda ($)
  * "rápido" / "carga" / "velocidad" → cohete, velocímetro, líneas de movimiento
  * "automatización" / "IA" / "ahorro de tiempo" → engranajes interconectados, reloj, cerebro digital estilizado
  * "clientes" / "atención" → siluetas de personas pequeñas, corazones, manos saludando
  * "SEO" / "Google" / "encontrar" → lupa, gráfico de búsqueda, primera posición/podio
  * "móvil" / "app" → smartphone con interfaz abstracta, notificación
- 1 a 3 objetos máximo, todos RELACIONADOS al tema
- Los objetos deben INTERACTUAR con el zorro o entre sí, NO flotar al azar:
  * El zorro SEÑALA / SOSTIENE / EMPUJA / MUESTRA el objeto principal
  * O los objetos se conectan visualmente entre sí (flechas, líneas de movimiento, sucesión)
- ESCENA NARRATIVA: la imagen debe contar visualmente la idea del tema, no ser un montón de iconos sueltos

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- 22% SUPERIOR (0px a 420px) = fondo limpio SIN elementos (reservado para texto)
- 29% INFERIOR (1370px a 1920px) = fondo limpio SIN elementos (reservado para sub-copy + botón CTA + hashtags)
- Toda la acción visual (zorro y objetos) va estrictamente entre los píxeles 420 y 1370 (zona central)
- NADA puede invadir las zonas reservadas: ni el zorro, ni sus pies, ni objetos, ni sombras, ni el glow del fondo (el glow es decorativo del fondo plano sin elementos sólidos arriba)

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

Genera el TEXTO que va a acompañar una HISTORIA (story 9:16). Reglas:
- copy_principal: 1-2 líneas, MÁX 70 caracteres totales, hook orientado a beneficio de negocio
- sub_copy: 1 línea de contexto/explicación, MÁX 90 caracteres
- cta: llamada a acción corta y específica, MÁX 30 caracteres (ej: "Agenda tu reunión", "Escríbenos", "Guarda este tip")
- hashtags: 3-5 hashtags. Incluye al menos 1 de marca (#WebMakerLatam, #WebMaker, #ComunidadWebMaker) y 2-3 de la industria del cliente (#Emprendedores, #PymesLatam, #NegociosOnline, #Marketing, #Ecommerce, #Chatbot, #IA, #PaginasWeb, #Automatizacion, etc.)

Tono: cercano, latino, accesible, sin cringe. Habla de "tú". Emojis con moderación (0-2 totales en todo el texto).

FORMATO DE SALIDA: SOLO un objeto JSON válido, sin markdown, sin texto adicional. Estructura:
{ "copy_principal": "...", "sub_copy": "...", "cta": "...", "hashtags": "#... #..." }`;

async function generarTextoHistoria(tipoHistoria: string, concepto: string): Promise<{
  copy_principal: string; sub_copy: string; cta: string; hashtags: string;
}> {
  const userMessage = `TIPO de historia: ${tipoHistoria}
TEMA/CONCEPTO: ${concepto}

Genera el JSON con copy_principal, sub_copy, cta y hashtags. Solo el JSON.`;
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
    copy_principal: String(parsed.copy_principal || "").slice(0, 90),
    sub_copy: String(parsed.sub_copy || "").slice(0, 110),
    cta: String(parsed.cta || "").slice(0, 40),
    hashtags: String(parsed.hashtags || ""),
  };
}

// Render texto sobre historia 9:16 con auto-fit, padding, fondos semi-transparentes y SIN emojis
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

  // Strip emojis para evitar cajitas con códigos unicode
  const principal = stripEmojis(texto.copy_principal);
  const sub = stripEmojis(texto.sub_copy);
  const cta = stripEmojis(texto.cta);
  const hashtags = stripEmojis(texto.hashtags);

  // Zona superior reservada: 0-420px. Padding interno 60.
  const topZoneTop = 60;
  const topZoneBottom = 420 - 30;
  const topZoneCenterY = (topZoneTop + topZoneBottom) / 2;
  const topMaxHeight = topZoneBottom - topZoneTop;

  // Zona inferior reservada: 1370-1920 (550px). Layout vertical:
  //   sub_copy → 30px → CTA (botón pill) → 30px → hashtags → 60px al borde
  const bottomEdgePadding = 60; // padding al borde inferior de la imagen
  const ctaButtonHeight = 96;
  const subMaxHeight = 200; // hasta 4 líneas a 32-44px
  const hashMaxHeight = 100; // hasta 2 líneas a 28-36px
  const gapBetween = 30;

  const principalFit = principal ? fitTextBlock(principal, {
    maxWidth: innerWidth - 48,
    maxHeight: topMaxHeight - 48,
    maxFontSize: 84,
    minFontSize: 48,
  }) : null;

  const subFit = sub ? fitTextBlock(sub, {
    maxWidth: innerWidth - 48,
    maxHeight: subMaxHeight - 36,
    maxFontSize: 44,
    minFontSize: 32,
    charWidthRatio: 0.5,
  }) : null;

  const ctaFit = cta ? fitTextBlock(cta, {
    maxWidth: innerWidth - 80,
    maxHeight: ctaButtonHeight - 28,
    maxFontSize: 44,
    minFontSize: 30,
    charWidthRatio: 0.55,
  }) : null;

  const hashFit = hashtags ? fitTextBlock(hashtags, {
    maxWidth: innerWidth - 48, // RESPETA el padding lateral de 80px + 24px del bg
    maxHeight: hashMaxHeight - 16,
    maxFontSize: 36,
    minFontSize: 28,
    charWidthRatio: 0.5,
  }) : null;

  // Stack desde el borde inferior hacia arriba:
  // hashtags al fondo → CTA → sub_copy
  const subBlockH = subFit ? subFit.blockHeight + 36 : 0; // bg padding 18 c/lado
  const ctaBlockH = ctaFit ? ctaFit.blockHeight + 36 : 0; // padY 18
  const hashBlockH = hashFit ? hashFit.blockHeight + 24 : 0; // bg padding 12 c/lado

  // Posiciones bottom-up
  const hashBottom = h - bottomEdgePadding;
  const hashCenterY = hashBottom - hashBlockH / 2;
  const ctaBottom = hashFit ? hashCenterY - hashBlockH / 2 - gapBetween : h - bottomEdgePadding;
  const ctaCenterY = ctaBottom - ctaBlockH / 2;
  const subBottom = ctaFit ? ctaCenterY - ctaBlockH / 2 - gapBetween : (hashFit ? hashCenterY - hashBlockH / 2 - gapBetween : h - bottomEdgePadding);
  const subCenterY = subBottom - subBlockH / 2;

  // Construir CTA tipo botón con su propio fondo (naranja sólido)
  const ctaSvg = ctaFit ? (() => {
    const padX = 44, padY = 18;
    const btnWidth = Math.min(innerWidth, ctaFit.blockWidth + padX * 2);
    const btnHeight = ctaFit.blockHeight + padY * 2;
    const btnX = (w - btnWidth) / 2;
    const btnY = ctaCenterY - btnHeight / 2;
    const baselineY = btnY + padY + ctaFit.fontSize * 0.85;
    return `
      <rect x="${btnX.toFixed(1)}" y="${btnY.toFixed(1)}" width="${btnWidth.toFixed(1)}" height="${btnHeight.toFixed(1)}"
        rx="${btnHeight / 2}" fill="#E86A30" />
      ${ctaFit.lines.map((line, i) => `
        <text x="${w / 2}" y="${(baselineY + i * ctaFit.lineHeight).toFixed(1)}" text-anchor="middle"
          font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="800"
          font-size="${ctaFit.fontSize}" fill="#ffffff">${escapeXml(line)}</text>
      `).join("")}
    `;
  })() : "";

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_FILTER_DEFS}
    ${principalFit ? renderTextBlockSvg(principalFit, {
      canvasWidth: w, centerY: topZoneCenterY, fontWeight: 900, color: "#ffffff",
      bgOpacity: 0.7, bgPadding: 24, bgRadius: 22, filterId: "textds",
    }) : ""}
    ${subFit ? renderTextBlockSvg(subFit, {
      canvasWidth: w, centerY: subCenterY, fontWeight: 700, color: "#f8fafc",
      bgOpacity: 0.7, bgPadding: 18, bgRadius: 16, filterId: "textds",
    }) : ""}
    ${ctaSvg}
    ${hashFit ? renderTextBlockSvg(hashFit, {
      canvasWidth: w, centerY: hashCenterY, fontWeight: 700, color: "#fb923c",
      bgOpacity: 0.55, bgPadding: 12, bgRadius: 12, filterId: "textds",
    }) : ""}
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

PERSONAJE - ESTILO FLAT CARTOON PURO (copiar EXACTAMENTE de la imagen de referencia adjunta):
- Zorro naranja antropomórfico Webi, lentes rectangulares negros gruesos, polera verde oscuro
- ESTILO OBLIGATORIO: FLAT CARTOON PURO con colores planos sólidos. SIN sombras realistas, SIN sombreados degradados, SIN texturas en el pelaje, SIN volumen 3D, SIN highlights brillantes. Solo líneas de contorno NEGRAS GRUESAS y colores totalmente PLANOS (naranja vibrante uniforme, verde uniforme, blanco, negro).
- IDÉNTICO a la referencia en proporciones, cabeza grande, ojos detrás de los lentes, polera verde oscuro y nivel de detalle, sin importar la pose. Si dudas, copia la referencia.

ROL NARRATIVO DE ESTA SLIDE:
${rolDescripcion}

CONTEXTO DE LA PUBLICACIÓN:
TEMA general: "${tema}" (${tipoContenido})
TÍTULO de esta slide: "${slide.titulo}"
SUBTÍTULO de esta slide: "${slide.subtitulo}"
${enfoqueVisual}

OBJETOS DE LA ESCENA (REGLAS ESTRICTAS):
- Extrae las PALABRAS CLAVE VISUALES del tema y del foco de esta slide. Mapeo:
  * chatbot/responder/WhatsApp → burbuja de chat verde estilo WhatsApp + smartphone + robot pequeño
  * web/sitio/landing → laptop o monitor con web abstracta sin texto + cursor
  * ventas/vender/ingresos → carrito + gráfico de barras ascendente + signos $
  * rápido/carga/velocidad → cohete + velocímetro + líneas de movimiento
  * automatización/IA/ahorro de tiempo → engranajes + reloj + cerebro digital
  * clientes/atención → siluetas pequeñas de personas + corazones + manos saludando
  * SEO/Google/encontrar → lupa + podio + gráfico
  * móvil/app → smartphone con interfaz abstracta + notificación
  * agendar/reunión → calendario + checkmark
- 1 a 3 objetos máximo, TODOS relacionados al tema y al rol de la slide
- Los objetos INTERACTÚAN con el zorro o entre sí (el zorro señala/sostiene/empuja, o flechas conectan los objetos), NUNCA flotan al azar
- ESCENA NARRATIVA, no un montón de iconos sueltos

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

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_FILTER_DEFS}
    ${tituloFit ? renderTextBlockSvg(tituloFit, {
      canvasWidth: w, centerY: topCenterY, fontWeight: 900, color: "#ffffff",
      bgOpacity: 0.7, bgPadding: 24, bgRadius: 22, filterId: "textds",
    }) : ""}
    ${subFit ? renderTextBlockSvg(subFit, {
      canvasWidth: w, centerY: bottomCenterY, fontWeight: 700, color: "#f8fafc",
      bgOpacity: 0.7, bgPadding: 18, bgRadius: 16, filterId: "textds",
    }) : ""}
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
            imgBase64 = await renderTextoEnSlide(imgBase64, slide);
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
