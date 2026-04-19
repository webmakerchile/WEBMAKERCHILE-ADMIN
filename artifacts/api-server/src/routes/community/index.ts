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
// GALERÍA CANON — imágenes 10/10 aprobadas por el usuario
// Se incluyen como referencias adicionales para forzar consistencia visual.
// ============================================
type GalleryEntry = { file: string; rol: SlideRol | "any"; tags: string[] };
const STYLE_GALLERY: GalleryEntry[] = [
  // PORTADAS — hooks, preguntas, problema inicial
  { file: "portada_01.png", rol: "portada", tags: ["hook", "laptop", "cohete", "señalando"] },
  { file: "portada_espanta_clientes.png", rol: "portada", tags: ["web", "espanta", "clientes", "laptop", "x", "rojo", "señalando", "menton", "pensativo"] },
  { file: "portada_haciendo_solo.png", rol: "portada", tags: ["solo", "shrug", "manos", "arriba", "agobio", "multitask", "tareas", "ia", "automatizar", "celular", "documento", "reloj"] },
  { file: "portada_dinero_pensativo.png", rol: "portada", tags: ["dinero", "ingresos", "cofre", "tesoro", "monedas", "menton", "pensativo", "trampa", "proyecto"] },

  // DESARROLLO — explicación de problemas/soluciones
  { file: "desarrollo_problema_lento.png", rol: "desarrollo", tags: ["problema", "lento", "laptop", "preocupado"] },
  { file: "desarrollo_lento_snail.png", rol: "desarrollo", tags: ["lento", "carga", "snail", "caracol", "telaraña", "laptop", "preocupado", "señalando"] },
  { file: "desarrollo_movil_roto.png", rol: "desarrollo", tags: ["movil", "celular", "responsive", "preocupado"] },
  { file: "desarrollo_movil_celular.png", rol: "desarrollo", tags: ["movil", "celular", "smartphone", "responsive", "mostrando", "señalando", "preocupado"] },
  { file: "desarrollo_confusion_shrug.png", rol: "desarrollo", tags: ["confusion", "shrug", "interrogante", "duda"] },
  { file: "desarrollo_lupa.png", rol: "desarrollo", tags: ["lupa", "buscar", "investigar", "analizar", "seo", "404"] },
  { file: "desarrollo_abandonada.png", rol: "desarrollo", tags: ["abandono", "carrito", "triste", "vacio"] },
  { file: "desarrollo_chat_link_roto.png", rol: "desarrollo", tags: ["chat", "contacto", "link", "roto", "celular", "interrogante", "competencia", "preocupado"] },
  { file: "desarrollo_chat_lento.png", rol: "desarrollo", tags: ["chat", "lento", "respuesta", "celular", "interrogante", "tarde", "competencia"] },
  { file: "desarrollo_overwhelm.png", rol: "desarrollo", tags: ["overwhelm", "agobio", "manos", "arriba", "multiples", "chats", "celular", "tareas", "tiempo", "reloj", "perdiendo", "clientes"] },
  { file: "desarrollo_chatbot_solucion.png", rol: "desarrollo", tags: ["chatbot", "ia", "solucion", "automatizar", "celular", "engranaje", "gear", "thumbs", "pulgar", "responder"] },
  { file: "desarrollo_negocio_crece.png", rol: "desarrollo", tags: ["crecimiento", "exito", "thumbs", "pulgar", "doble", "grafico", "subir", "ventas", "laptop", "engranaje", "vender", "automatizar", "feliz"] },
  { file: "desarrollo_ciclo_agotador.png", rol: "desarrollo", tags: ["ciclo", "agotamiento", "cansado", "caminando", "engranajes", "casa", "monedas", "reloj", "lupa", "loop", "repetir"] },
  { file: "desarrollo_membresia_escudo.png", rol: "desarrollo", tags: ["membresia", "escudo", "seguro", "proteccion", "planos", "checklist", "ingreso", "recurrente", "ofrecer"] },
  { file: "desarrollo_ingresos_predecibles.png", rol: "desarrollo", tags: ["ingresos", "predecibles", "laptop", "grafico", "subir", "monedas", "thumbs", "pulgar", "señalando", "plataforma"] },

  // CTA — cierre, invitación a contactar
  { file: "cta_whatsapp.png", rol: "cta", tags: ["cta", "whatsapp", "feliz", "invitando", "contacto"] },
  { file: "cta_brazos_abiertos.png", rol: "cta", tags: ["cta", "brazos", "abiertos", "invitando", "whatsapp", "calendario", "agenda", "membresia", "ingresos", "fijos", "feliz"] },
];

// Las imágenes canon son screenshots de slides FINALES con título/subtítulo
// renderizados en bandas superior (22%) e inferior (25%). Si Gemini ve esas
// referencias con texto, replica texto en su salida (rompe la regla "CERO TEXTO"
// del prompt). Solución: enmascarar esas bandas con el color del fondo navy
// (#0F172A) antes de enviarlas al modelo. Mantiene dimensiones para no confundir
// la composición; el modelo solo ve la ilustración limpia del personaje.
const galleryCache = new Map<string, string>();
async function loadGalleryFile(file: string): Promise<string | null> {
  if (galleryCache.has(file)) return galleryCache.get(file)!;
  try {
    const p = await resolveAsset("public", "style-gallery", file);
    const raw = await readFile(p);
    const meta = await sharp(raw).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    let buf: Buffer;
    if (w > 0 && h > 0) {
      const topBand = Math.max(1, Math.floor(h * 0.22));
      const bottomBand = Math.max(1, Math.floor(h * 0.25));
      buf = await sharp(raw)
        .composite([
          {
            input: {
              create: { width: w, height: topBand, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } },
            },
            top: 0,
            left: 0,
          },
          {
            input: {
              create: { width: w, height: bottomBand, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } },
            },
            top: h - bottomBand,
            left: 0,
          },
        ])
        .png()
        .toBuffer();
    } else {
      buf = raw;
    }
    const b64 = buf.toString("base64");
    galleryCache.set(file, b64);
    return b64;
  } catch (e) {
    console.warn(`[style-gallery] no pude cargar ${file}:`, (e as Error).message);
    return null;
  }
}

// ============================================
// FIX 1 — EXTRACCIÓN DE IMAGEN FINAL DE GEMINI 3 PRO IMAGE
// El modelo devuelve múltiples parts: bocetos del "thinking" + imagen final.
// Hay que filtrar parts con thought:true y tomar la ÚLTIMA inlineData (no la primera).
// ============================================
function extractFinalImage(response: any): { mimeType: string; data: string } | null {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const imageParts = parts.filter(
    (p: any) => p?.inlineData?.data && !p?.thought,
  );
  if (imageParts.length === 0) return null;
  const finalImage = imageParts[imageParts.length - 1];
  return {
    mimeType: finalImage.inlineData.mimeType || "image/png",
    data: finalImage.inlineData.data as string,
  };
}

// Config estándar para Gemini 3 Pro Image: dejar temperature/topK/topP en default,
// y desactivar inclusión de bocetos en el response (siguen generándose internamente).
const GEMINI_IMAGE_BASE_CONFIG = {
  responseModalities: ["TEXT", "IMAGE"] as string[],
  thinkingConfig: { includeThoughts: false },
} as const;

// Selecciona 2-3 referencias canon: la mejor por score semántico + 1-2 adicionales
// para dar variedad de pose y forzar consistencia de estilo en primera generación.
async function pickCanonReferences(
  rol: SlideRol,
  tema: string,
  promptVisual: string | undefined,
): Promise<string[]> {
  const haystack = `${tema} ${promptVisual || ""}`.toLowerCase();
  const candidatas = STYLE_GALLERY.filter((g) => g.rol === rol);
  if (candidatas.length === 0) return [];

  // Score por coincidencia de tags en tema/prompt_visual (con desempate aleatorio)
  const scored = candidatas.map((g) => ({
    g,
    score: g.tags.reduce((acc, tag) => acc + (haystack.includes(tag) ? 1 : 0), 0),
    rand: Math.random(),
  }));
  scored.sort((a, b) => (b.score - a.score) || (b.rand - a.rand));

  // Mejor match (semántico) + 1-2 adicionales aleatorias del mismo rol
  // para dar al modelo múltiples anclas de estilo (cara, glasses, camiseta verde, líneas negras)
  const elegidas: GalleryEntry[] = [scored[0]!.g];
  const restantes = scored.slice(1);
  // Mezclar las restantes para variedad
  for (let i = restantes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [restantes[i], restantes[j]] = [restantes[j]!, restantes[i]!];
  }
  // Objetivo: 3 referencias para portada/desarrollo (más anclas), 2 para cta (suelen ser más simples)
  const objetivo = rol === "cta" ? 2 : 3;
  for (const r of restantes) {
    if (elegidas.length >= objetivo) break;
    elegidas.push(r.g);
  }

  const cargadas = await Promise.all(elegidas.map((e) => loadGalleryFile(e.file)));
  return cargadas.filter((b): b is string => !!b);
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
// Distribuye tokens (hashtags, palabras) entre N líneas, minimizando la
// diferencia de longitud entre líneas (líneas balanceadas). Devuelve null si
// no es posible meter todos los tokens en `numLines` sin exceder `maxChars`.
function balanceTokensAcrossLines(
  tokens: string[],
  maxChars: number,
  numLines: number,
): string[] | null {
  if (numLines < 1 || tokens.length === 0) return null;
  let best: { lines: string[]; maxLen: number } | null = null;
  function recurse(start: number, linesSoFar: string[]) {
    const remaining = numLines - linesSoFar.length;
    if (remaining === 1) {
      const line = tokens.slice(start).join(" ");
      if (line.length > maxChars) return;
      const all = [...linesSoFar, line];
      const maxLen = Math.max(...all.map((l) => l.length));
      if (!best || maxLen < best.maxLen) best = { lines: all, maxLen };
      return;
    }
    for (let end = start + 1; end <= tokens.length - (remaining - 1); end++) {
      const line = tokens.slice(start, end).join(" ");
      if (line.length > maxChars) break; // tokens contiguos: si excede, los siguientes también
      recurse(end, [...linesSoFar, line]);
    }
  }
  recurse(0, []);
  return best ? best.lines : null;
}

// Ajusta el font size para que tokens (hashtags) quepan en hasta `maxLines`
// líneas balanceadas dentro del ancho disponible. Garantiza padding visual a los lados.
function fitHashtagsBlock(
  text: string,
  opts: {
    maxWidth: number;
    maxFontSize: number;
    minFontSize: number;
    maxLines: number;
    charWidthRatio?: number;
    lineHeightRatio?: number;
  },
): FitResult {
  const charW = opts.charWidthRatio ?? 0.58; // hashtags = mezcla mayús+minús, ratio realista
  const lhRatio = opts.lineHeightRatio ?? 1.22;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { lines: [], fontSize: opts.minFontSize, lineHeight: opts.minFontSize * lhRatio, blockWidth: 0, blockHeight: 0 };
  }
  for (let fs = opts.maxFontSize; fs >= opts.minFontSize; fs -= 2) {
    const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
    // Buscar la cantidad MÍNIMA de líneas (1, luego 2, … hasta maxLines).
    for (let n = 1; n <= opts.maxLines; n++) {
      const lines = balanceTokensAcrossLines(tokens, maxChars, n);
      if (!lines) continue;
      const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
      const blockWidth = longest * fs * charW;
      const lineHeight = fs * lhRatio;
      const blockHeight = lines.length * lineHeight;
      return { lines, fontSize: fs, lineHeight, blockWidth, blockHeight };
    }
  }
  // Fallback: minFontSize + greedy llenado (evita perder hashtags si nada calza balanceado).
  const fs = opts.minFontSize;
  const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    const candidate = cur ? cur + " " + t : t;
    if (candidate.length > maxChars && cur) {
      lines.push(cur);
      cur = t;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
  const lineHeight = fs * lhRatio;
  return { lines, fontSize: fs, lineHeight, blockWidth: longest * fs * charW, blockHeight: lines.length * lineHeight };
}

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

  // Fallback: usar mínimo y devolver TODAS las líneas (NO truncar con "...")
  // Si overflow leve es preferible a perder texto. El llamador decide qué hacer.
  const fs = opts.minFontSize;
  const maxChars = Math.max(4, Math.floor(opts.maxWidth / (fs * charW)));
  const lines = wrapTextByChars(text, maxChars);
  const lineHeight = fs * (opts.lineHeightRatio ?? 1.18);
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
      <stop offset="20%" stop-color="#0F172A" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="#0F172A" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="1"/>
    </linearGradient>
    <filter id="textds" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dx="0" dy="2" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
`;
// Backwards-compat alias
const SVG_FILTER_DEFS = SVG_DEFS;
void SVG_FILTER_DEFS;

// Especificación rigurosa del zorro de marca - obligatoria en TODOS los prompts de imagen
// Basado en la IMAGEN MASTER OFICIAL: artifacts/api-server/public/fox-reference.png
const FOX_BRAND_SPEC = `PERSONAJE — RÉPLICA EXACTA de la IMAGEN MASTER OFICIAL adjunta. No es "un zorro genérico", es WEBI, mascota registrada de WebMakerLatam. Si la imagen generada NO se puede confundir con la master, es INCORRECTA.

CARACTERÍSTICAS OBLIGATORIAS (cualquier desviación = ERROR de branding):
- Estilo: FLAT CARTOON 2D PURO. PROHIBIDO 3D, render realista, Disney, Pixar, anime, chibi.
- Cara: ALARGADA y estilizada, NO redonda, NO chibi, NO "cute".
- Ojos: CÍRCULOS NEGROS PEQUEÑOS y simples. SIN brillos, SIN reflejos, SIN pestañas, SIN pupila/iris diferenciados, SIN highlights.
- Nariz: NEGRA sólida, forma de triángulo redondeado pequeño. NUNCA rosada.
- Hocico: blanco cremoso plano (#F5E6D3), bien definido del resto de la cara.
- Lentes: rectangulares, gruesos, marco NEGRO sólido (no marrón, no naranja). Cristales transparentes SIN reflejos.
- Polera/sudadera: verde oscuro plano (#4A5D3A), uniforme, SIN arrugas, SIN texturas, SIN sombras.
- Pelaje: UN SOLO color naranja plano (#E86A30), SIN degradados, SIN sombras, SIN variaciones tonales, SIN pelos visibles.
- Vientre/pecho: blanco cremoso plano.
- Cola: naranja con punta blanca plana.
- Líneas de contorno: NEGRAS, gruesas y UNIFORMES en TODO el personaje.
- Expresión: SUTIL, no exagerada. Boca pequeña, sin lengua ni dientes visibles.
- Proporciones idénticas a la master: cabeza algo grande, cuerpo proporcionado, brazos y piernas cortos pero visibles.

PROHIBIDO ABSOLUTAMENTE:
× Ojos grandes tipo Disney/Pixar/chibi con brillos
× Cara redonda
× Pupilas/iris diferenciados
× Nariz rosada
× Sombras o gradientes en pelaje, polera u orejas
× Brillos/reflejos en los lentes
× Cejas expresivas tipo anime
× Lengua o dientes visibles
× Expresiones exageradas (muy feliz, muy triste, muy enojado)
× Cualquier efecto 3D, volumen, iluminación volumétrica o ambient occlusion

REGLA DE ORO: si NO se puede confundir con la imagen master adjunta, es INCORRECTA y debe regenerarse.

CHECKLIST FINAL DE RECHAZO — antes de devolver la imagen, RECHÁZALA y rehazla si:
1. Los ojos del zorro tienen brillos, reflejos, iris o aspecto Disney/Pixar/anime.
2. La cara del zorro es redonda, chibi o "cute" en lugar de alargada.
3. La nariz es rosada, marrón o cualquier color que no sea negra.
4. Los lentes son redondos, marrones, naranjas o tienen reflejos en los cristales.
5. La polera, el pelaje o cualquier parte del personaje tiene sombras, gradientes, texturas, volumen 3D u oclusión ambiental.
6. Hay líneas de contorno finas, irregulares o ausentes — TODO el zorro debe tener líneas negras gruesas y uniformes.
7. La escena tiene MÁS de 3 objetos de apoyo, o están distribuidos rodeando al zorro en lugar de agrupados a un lado.
8. Hay objetos cortados por los bordes de la imagen (laptop, celular, props sin margen).
9. Hay texto, letras o números visibles dentro del arte (en pantallas, pancartas, etc.).
10. El estilo se ve fotográfico, 3D, anime, render o cualquier cosa que NO sea flat cartoon 2D vector plano.

Si CUALQUIERA de estas 10 condiciones se cumple, la imagen es INVÁLIDA y debe regenerarse desde cero.`;

// ============================================
// SORPRÉNDEME (audiencia: emprendedores/pymes)
// ============================================

// Catálogo completo de servicios de WebMakerLatam — se inyecta en TODOS los prompts de texto
// para que el contenido refleje la oferta real (no solo "webs"). Todos los servicios
// terminan con CTA "Solicitar Cotización" o "Cotizar por WhatsApp" o "Agendar Reunión".
const CATALOGO_SERVICIOS = `CATÁLOGO COMPLETO DE SERVICIOS WebMakerLatam (úsalos rotando, NO siempre webs):
1. Páginas web profesionales y e-commerce (tiendas online, landing pages, sitios corporativos).
2. App Móvil Nativa (iOS y Android de alto rendimiento).
3. Sistema ERP (control de inventario, compras, finanzas y operaciones).
4. Sistema CRM (gestión de clientes, leads, ventas y postventa).
5. Plataforma SaaS (software escalable en la nube, multi-cliente).
6. Punto de Venta / POS (caja y stock para tiendas físicas, integrado con e-commerce).
7. Software 100% a medida (cualquier solución que el cliente necesite).
8. Chatbots con IA y automatizaciones (atención 24/7, WhatsApp Business, leads automáticos).
9. SEO y marketing digital (posicionamiento en Google, Ads, contenido).
10. Branding, hosting, dominios e integraciones.

CTAs reales del sitio: "Solicitar Cotización", "Cotizar por WhatsApp", "Agendar Reunión / consulta gratuita 1 hora", "Escríbenos al WhatsApp +56 9 5365 7460".

REGLA DE VARIEDAD: en una serie de contenidos NO hables solo de webs. Rota entre los servicios según la audiencia: tiendas físicas → POS + ERP, equipos de venta → CRM + chatbot, startups → SaaS + app, comercios online → e-commerce + chatbot, empresas medianas → ERP + integraciones, etc.`;

// Regla de idioma compartida — se inyecta en TODOS los prompts de texto.
const REGLA_ESPANOL_NEUTRO = `IDIOMA — REGLA OBLIGATORIA E INNEGOCIABLE:
- Usa SIEMPRE español NEUTRO LATINOAMERICANO, formal-cercano, comprensible para cualquier país de habla hispana (México, Colombia, Perú, Argentina, Chile, España).
- Trata SIEMPRE al lector de "tú" (tuteo estándar): "tú vendes", "tu negocio", "tienes", "necesitas", "configura", "conecta".
- PROHIBIDO el voseo argentino/uruguayo: NUNCA uses "vos", "vos te enfocás", "tenés", "podés", "querés", "sabés", "hacés", "decís", "mirá", "fijate", "dale", "che".
- PROHIBIDOS chilenismos, mexicanismos, colombianismos o cualquier modismo regional: nada de "po", "weón", "cachái", "chévere", "guay", "órale", "padrísimo", "chamba", "platica", "pana".
- PROHIBIDO el voseo verbal en imperativos: NO "enfocate", "fijate", "andá", "vení" — usa "enfócate", "fíjate", "ve", "ven".
- Vocabulario universal: usa "computadora" o "PC" (no "compu" sola), "celular" o "teléfono", "dinero" (no "plata", "lana", "pasta"), "trabajo" (no "chamba", "pega", "curro"), "amigo/cliente" (no "pana", "weón").
- Acentos correctos en todas las palabras (estás, más, también, número, fácil, rápido).
`;

const SORPRENDEME_SYSTEM = `Eres el estratega senior de contenido de WebMakerLatam, AGENCIA digital LATAM que ayuda a EMPRENDEDORES, PYMES y EMPRESAS a crecer con tecnología.

${CATALOGO_SERVICIOS}

${REGLA_ESPANOL_NEUTRO}

AUDIENCIA PRIMARIA (95%): dueños de negocio NO técnicos. Háblales en BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, atender 24/7, profesionalizar marca, escalar, ahorrar plata). Cero jerga técnica.

CATEGORÍAS DISPONIBLES (úsalas TODAS rotándolas, NUNCA repitas categoría dos veces seguidas):
A. CASOS DE ÉXITO ficticios pero verosímiles ("Cómo una [vertical] de [ciudad] [resultado] gracias a [solución]")
B. TIPS DE NEGOCIO accionables ("N errores/señales/claves/hábitos/trucos que…")
C. ¿SABÍAS QUE…? con dato/estadística llamativa
D. PROBLEMA + SOLUCIÓN explícita ("¿Pierdes X? Aquí está cómo solucionarlo")
E. MOTIVACIÓN EMPRENDEDORA con verdad incómoda
F. MITOS DERRIBADOS ("La verdad sobre…", "Mito vs realidad de…")
G. COMPARATIVOS ("Web propia vs Instagram", "Chatbot vs contestar tú", "Plantilla vs hecho a medida")
H. CHECKLIST/AUDITORÍA ("Audita tu web en 60 seg", "10 cosas que tu negocio debe tener online en 2026")
I. TENDENCIAS ("Lo que está funcionando en e-commerce 2026", "IA que ya usan tus competidores")
J. ANTES Y DESPUÉS ("De Excel a un sistema en 7 días")
K. STORYTELLING / HOOK INESPERADO ("Mi cliente perdió $3M por no tener WhatsApp Business…")
L. PREGUNTA INCÓMODA AL LECTOR ("¿Cuántos clientes pierdes por no responder a tiempo?")
M. ANALOGÍAS DEL MUNDO REAL ("Tu web es como tu vitrina: si está sucia, no entran")
N. NUMEROLOGÍA / RANKING ("Top 5 herramientas IA gratis para tu negocio")
O. TEMPORAL / ESTACIONAL (Black Friday, Navidad, Año Nuevo, Día de la Madre, vuelta a clases, etc. — solo si es coherente con el mes)
P. DETRÁS DE CÁMARAS de la agencia ("Así diseñamos una landing en 48 horas")
Q. TUTORIAL EXPRESS sin código ("Cómo conectar WhatsApp a tu tienda en 5 minutos")
R. ADVERTENCIA / RIESGO ("Por qué tu web podría desaparecer mañana si no haces esto")

VERTICALES TÍPICAS DE CLIENTES (rota entre ellas para variar): restaurantes, panaderías, cafeterías, peluquerías/barberías, salones de belleza, gimnasios/personal trainers, clínicas dentales, veterinarias, ferreterías, librerías, tiendas de ropa, e-commerce, inmobiliarias, abogados/contadores/consultoras, talleres mecánicos, escuelas/cursos online, agencias de viajes, hoteles/cabañas, farmacias, distribuidoras, importadoras, productores audiovisuales, fotógrafos, organizadores de eventos, food trucks, delivery, dropshipping, infoproductos, coaches, psicólogos online, freelancers.

PAÍSES/CIUDADES LATAM para anclar (úsalos rotando): Santiago, Valparaíso, Concepción, Antofagasta, Temuco, La Serena, Buenos Aires, Córdoba, Mendoza, Rosario, Lima, Arequipa, Bogotá, Medellín, Cali, Quito, Guayaquil, CDMX, Guadalajara, Monterrey, Asunción, Montevideo, La Paz, San José, Panamá. (No abuses, solo cuando aporte verosimilitud.)

FORMATOS DE TÍTULO (rota — no uses dos veces seguidas el mismo):
- Pregunta directa: "¿Sabías que…?", "¿Tu web…?", "¿Pierdes ventas porque…?"
- Lista numerada: "5 señales que…", "7 errores que…", "3 razones por las que…"
- Provocador: "Tu [X] está [problema] y no lo sabes"
- Storytelling: "Esta [vertical] facturó $X por hacer esto…"
- Comparativo: "X vs Y: cuál conviene a tu negocio"
- Antes/Después: "De [malo] a [bueno] en [tiempo]"
- Imperativo: "Deja de [error]…", "Empieza a [acción]…"
- Confidencial: "Lo que tu competencia no quiere que sepas sobre…"
- Tendencia: "Lo nuevo en [tema] que cambia las reglas en [año/2026]"

REGLAS DE ORO:
- Tema CONCRETO y específico — NUNCA genérico tipo "cómo automatizar tu empresa con IA". Siempre con un ángulo, vertical, número o promesa concreta.
- Máximo 100 caracteres.
- Si el usuario da contexto, respétalo y úsalo como pivote pero igual aplica un ángulo creativo de la lista.
- Si el usuario te entrega temas recientes a evitar, NO los repitas ni propongas variaciones cercanas (cambia categoría, vertical, ángulo y formato).
- Devuelve SOLO el tema en una línea, sin comillas, sin prefijos, sin explicación, sin emojis.`;

const SorprendemeBody = z.object({
  contexto: z.string().max(300).optional(),
  tipo_seccion: z.enum(["historia", "descripcion"]),
  temas_recientes: z.array(z.string().max(200)).max(20).optional(),
});

// Bancos para inyectar variedad por llamada
const VERTICALES = [
  "restaurante", "panadería", "cafetería", "peluquería", "barbería", "salón de belleza", "gimnasio", "personal trainer",
  "clínica dental", "veterinaria", "ferretería", "librería", "tienda de ropa", "e-commerce", "inmobiliaria",
  "estudio de abogados", "contadora", "consultora", "taller mecánico", "escuela online", "agencia de viajes",
  "hotel", "cabaña", "farmacia", "distribuidora", "importadora", "fotógrafo", "organizadora de eventos",
  "food truck", "delivery", "dropshipping", "coach", "psicóloga online", "freelancer", "diseñadora", "arquitecta",
];
const CIUDADES = ["Santiago", "Valparaíso", "Concepción", "Buenos Aires", "Córdoba", "Mendoza", "Lima", "Arequipa",
  "Bogotá", "Medellín", "Cali", "Quito", "Guayaquil", "CDMX", "Guadalajara", "Monterrey", "Montevideo", "Asunción"];
const ANGULOS = [
  { letra: "A", nombre: "CASO DE ÉXITO ficticio verosímil con vertical+ciudad+resultado concreto" },
  { letra: "B", nombre: "TIPS — N errores/señales/claves/hábitos/trucos" },
  { letra: "C", nombre: "¿SABÍAS QUE…? con dato o estadística llamativa" },
  { letra: "D", nombre: "PROBLEMA + SOLUCIÓN explícita" },
  { letra: "E", nombre: "MOTIVACIÓN EMPRENDEDORA con verdad incómoda" },
  { letra: "F", nombre: "MITO DERRIBADO — 'la verdad sobre' o 'mito vs realidad'" },
  { letra: "G", nombre: "COMPARATIVO entre dos opciones (X vs Y)" },
  { letra: "H", nombre: "CHECKLIST / mini auditoría rápida" },
  { letra: "I", nombre: "TENDENCIA actual en marketing/IA/web/e-commerce 2026" },
  { letra: "J", nombre: "ANTES Y DESPUÉS de adoptar una solución" },
  { letra: "K", nombre: "STORYTELLING con hook inesperado o cifra perdida" },
  { letra: "L", nombre: "PREGUNTA INCÓMODA dirigida al lector" },
  { letra: "M", nombre: "ANALOGÍA del mundo real para explicar concepto digital" },
  { letra: "N", nombre: "RANKING / Top N herramientas o prácticas" },
  { letra: "O", nombre: "TEMPORAL / ESTACIONAL coherente con el mes actual" },
  { letra: "P", nombre: "DETRÁS DE CÁMARAS de la agencia WebMakerLatam" },
  { letra: "Q", nombre: "TUTORIAL EXPRESS sin código en pasos simples" },
  { letra: "R", nombre: "ADVERTENCIA / RIESGO si no se hace algo" },
];
const FORMATOS_TITULO = [
  "Pregunta directa", "Lista numerada (N…)", "Provocador ('Tu X está Y y no lo sabes')",
  "Storytelling ('Esta panadería facturó $X por…')", "Comparativo (X vs Y)",
  "Antes/Después ('De X a Y en N días')", "Imperativo ('Deja de…' / 'Empieza a…')",
  "Confidencial ('Lo que tu competencia no quiere que sepas…')",
  "Tendencia ('Lo nuevo en X que cambia el juego en 2026')",
];
const TEMAS_PIVOTE = [
  "WhatsApp Business", "página web propia", "tienda online", "chatbot con IA", "automatización con n8n/Make",
  "Google My Business / Perfil de Empresa", "SEO local", "Instagram Ads", "TikTok orgánico", "email marketing",
  "embudo de ventas", "carrito abandonado", "atención 24/7", "facturación electrónica", "agenda online de citas",
  "formularios y captura de leads", "Pixel de Facebook", "Google Analytics", "velocidad de carga de la web",
  "diseño responsive móvil", "checkout en un click", "MercadoPago/Transbank/Stripe", "reseñas en Google",
  "newsletter / base de datos propia", "reportes y métricas", "fidelización con descuentos", "membresías y suscripciones",
];

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }

router.post("/community/sorprendeme", async (req, res) => {
  try {
    const body = SorprendemeBody.parse(req.body);
    const ctx = (body.contexto || "").trim();
    const recientes = (body.temas_recientes || []).slice(0, 12);
    const sectionHint = body.tipo_seccion === "historia"
      ? "una HISTORIA corta (story 9:16 con un solo concepto digerible en 5 segundos)"
      : "una PUBLICACIÓN de feed (post único o carrusel con desarrollo más largo)";

    // Semilla creativa aleatoria — fuerza variedad cada llamada
    const angulo = pickRandom(ANGULOS);
    const formato = pickRandom(FORMATOS_TITULO);
    const vertical = pickRandom(VERTICALES);
    const ciudad = pickRandom(CIUDADES);
    const pivote = pickRandom(TEMAS_PIVOTE);
    const mes = new Date().toLocaleDateString("es-CL", { month: "long" });

    const seedBlock = `SEMILLA CREATIVA OBLIGATORIA para esta generación (úsala como guía, no como copia literal):
- Categoría a usar: ${angulo.letra} — ${angulo.nombre}
- Formato de título sugerido: ${formato}
- Vertical de cliente sugerida si aplica: "${vertical}"${angulo.letra === "A" ? ` (puedes anclar a ${ciudad})` : ""}
- Tema/herramienta pivote sugerida: "${pivote}"
- Mes actual (úsalo SOLO si elegiste categoría O temporal): ${mes}`;

    const evitarBlock = recientes.length > 0
      ? `\n\nTEMAS RECIENTES — está PROHIBIDO repetirlos o proponer variaciones cercanas. Cambia categoría, vertical, ángulo y formato:\n${recientes.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

    const userPrompt = ctx
      ? `Genera UN tema concreto para ${sectionHint} de WebMakerLatam.

CONTEXTO del usuario (alta prioridad — el tema debe estar alineado): "${ctx}"

${seedBlock}${evitarBlock}

Devuelve SOLO el tema, máx 100 caracteres, sin comillas ni prefijos.`
      : `Genera UN tema concreto para ${sectionHint} de WebMakerLatam, dirigido a emprendedores/pymes LATAM no técnicos.

${seedBlock}${evitarBlock}

Devuelve SOLO el tema, máx 100 caracteres, sin comillas ni prefijos.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      temperature: 1,
      system: SORPRENDEME_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    let tema = block && block.type === "text" ? block.text.trim() : "";
    tema = tema.replace(/^["'`]+|["'`]+$/g, "").replace(/^[-*•]\s*/, "").trim();
    // si el modelo devolvió varias líneas, quédate con la primera no vacía
    tema = tema.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] || tema;
    if (tema.length > 120) tema = tema.slice(0, 117) + "...";
    res.json({ success: true, data: { tema, _seed: { angulo: angulo.letra, formato, vertical, pivote } } });
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

// ============================================
// HISTORIAS — soporte para FORMATO ÚNICO o SERIE de 2-5 frames
// ============================================

type RolFrame = "unica" | "hook" | "contexto" | "problema" | "desarrollo" | "solucion" | "cta";
interface FrameContext {
  numero: number;        // 1..N
  total: number;         // total de frames en la serie
  rol: RolFrame;
}

// Estructura narrativa por cantidad de frames en una serie de stories
function getEstructuraSerie(n: number): RolFrame[] {
  switch (n) {
    case 2: return ["hook", "cta"];
    case 3: return ["hook", "desarrollo", "cta"];
    case 4: return ["hook", "problema", "solucion", "cta"];
    case 5: return ["hook", "contexto", "problema", "solucion", "cta"];
    default: return ["hook", "desarrollo", "cta"];
  }
}

// Pose y elementos visuales del zorro según el rol del frame en la serie
const POSE_POR_ROL: Record<RolFrame, { pose: string; visualHint: string }> = {
  hook: {
    pose: "expresión de pregunta/curiosidad: cabeza ligeramente inclinada, una pata en el mentón o señalando hacia el espectador, cejas levantadas. Cara amigable que invita a seguir mirando.",
    visualHint: "ícono pequeño relacionado al tema acompañado de un símbolo sutil de interrogación visual (no texto)",
  },
  contexto: {
    pose: "atento y didáctico: una pata abierta señalando un dato visual, expresión seria pero cercana, postura erguida.",
    visualHint: "ícono de dato/estadística (gráfico de barras simple, lupa, ícono porcentual) — sin texto",
  },
  problema: {
    pose: "preocupado/frustrado: cejas fruncidas hacia abajo, una pata en la cabeza o cruzada al pecho, cuerpo levemente encorvado. Muestra el dolor del problema sin caricaturizar.",
    visualHint: "objeto del tema con una X roja o un pequeño símbolo de alerta naranja",
  },
  desarrollo: {
    pose: "explicando con calma: una pata abierta hacia el espectador como en una mini-clase, expresión confiada y educativa.",
    visualHint: "objeto del tema en estado neutro (lupa, libro, engranaje, monitor)",
  },
  solucion: {
    pose: "confiado y resolutivo: bombilla de idea brillante sobre la cabeza o gesto de '¡ya está!', sonrisa satisfecha, postura erguida con energía positiva.",
    visualHint: "objeto solución con un check verde o un brillo dorado/naranja positivo",
  },
  cta: {
    pose: "saludando con la pata, sonriente y muy invitante. Postura abierta y receptiva, mostrando un teléfono o burbuja de WhatsApp verde como invitando a contactar.",
    visualHint: "ícono verde de WhatsApp y/o ícono de calendario representando 'agendar reunión'",
  },
  unica: {
    pose: "definida por el sistema según el concepto",
    visualHint: "definido por el sistema según el concepto",
  },
};

function buildHistoriaPrompt(
  tipoHistoria: string,
  concepto: string,
  poseOverride?: string,
  frame?: FrameContext,
): string {
  const { categoria, pose: poseElegida } = elegirCategoriaPose(concepto, tipoHistoria);
  let pose = poseOverride || poseElegida;
  let visualHintSerie = "";
  let frameRoleHeader = "";

  if (frame && frame.rol !== "unica") {
    const conf = POSE_POR_ROL[frame.rol];
    pose = poseOverride || conf.pose;
    visualHintSerie = `\nPISTA VISUAL adicional para este rol: ${conf.visualHint}.`;
    frameRoleHeader = `\nEste frame forma parte de una SERIE de ${frame.total} stories conectadas. Frame actual: ${frame.numero} de ${frame.total} con rol "${frame.rol}". Mantén EXACTAMENTE el mismo gradiente de fondo, mismo glow naranja y mismas partículas que un story estándar — los frames de la serie deben verse como un set cohesivo. Solo cambia la POSE/EXPRESIÓN del zorro y los OBJETOS DE APOYO según el rol indicado.\n`;
  }

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam (agencia digital para emprendedores y pymes en LATAM).
${frameRoleHeader}
REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, ni texto en pantallas/objetos. CERO caracteres alfanuméricos. Pantallas/monitores muestran formas abstractas de colores, NUNCA texto. Esta regla no tiene excepciones.

${FOX_BRAND_SPEC}

REGLAS ADICIONALES PARA ESTA HISTORIA:
- Cuerpo completo SIEMPRE visible (cabeza, torso, brazos, piernas, cola). Nunca cortado por los bordes ni recortado.
- El zorro es el PROTAGONISTA ABSOLUTO. Ocupa el centro de la zona de imagen.
- POSE Y EXPRESIÓN específica (categoría narrativa: "${categoria}"): ${pose}
- POSICIÓN VERTICAL EXACTA Y NO NEGOCIABLE: la cabeza del zorro debe empezar DESPUÉS del píxel y=550, y sus PIES deben terminar ANTES del píxel y=1300. Es decir, todo el zorro vive ESTRICTAMENTE entre y=550 y y=1300 (750 px de altura). NUNCA invadas la franja inferior (y=1300-1920) — esa zona está reservada para sub-copy, botón CTA y hashtags. Si tu zorro queda demasiado abajo o demasiado grande, RECÓRTALO. Mejor un zorro mediano bien centrado verticalmente que un zorro grande que invada las zonas reservadas.
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
- MÁXIMO ABSOLUTO: 2 objetos de apoyo (no 3, no más). En historias el zorro es el rey.${visualHintSerie}
- POSICIÓN DE LOS OBJETOS: a los LADOS del zorro (izquierda y/o derecha), a su altura, NUNCA detrás de él, NUNCA encima ni debajo invadiendo otra zona.
- Los objetos PUEDEN ser señalados/sostenidos por el zorro, pero su silueta debe verse completa y separada del zorro.
- PROHIBIDO: amontonar iconos, llenar el fondo de elementos, hacer un collage. Si dudas, elimina objetos.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
- 28% SUPERIOR (0px a 550px) = fondo limpio SIN elementos sólidos (reservado para título)
- 32% INFERIOR (1300px a 1920px) = fondo limpio SIN elementos sólidos (reservado para sub-copy + CTA + hashtags)
- Toda la acción visual (zorro + 1-2 objetos pequeños) va estrictamente entre los píxeles 550 y 1300 (zona central de 750 px)
- NADA puede invadir las zonas reservadas: ni el zorro, ni sus pies, ni objetos, ni sombras, ni el glow del fondo

VALIDACIÓN FINAL ANTES DE ENTREGAR LA IMAGEN — verifica MENTALMENTE:
1. ¿El zorro está 100% IDÉNTICO a la referencia (ojos pequeños, nariz negra, pelaje plano #E86A30, sin estilo Disney/Pixar)?
2. ¿Hay un máximo de 2 objetos de apoyo y están a los lados, NUNCA detrás del zorro?
3. ¿La franja superior 0-550 está LIMPIA sin objetos, y la inferior 1300-1920 también?
4. ¿El zorro tiene 100+ px de aire alrededor?
Si respondes NO a cualquiera, REGENERA mentalmente antes de devolver la imagen.

FONDO PREMIUM (consistencia de marca):
- Gradiente RADIAL (circular) desde el centro hacia afuera: #1E293B (slate 800) en el centro hacia #0F172A (slate 900) en los bordes
- Grid geométrico muy sutil con líneas VERTICALES y HORIZONTALES de igual peso al 3-5% opacidad (debe verse como malla uniforme, NO como horizonte)
- Halo naranja CIRCULAR (#E86A30 al 20% opacidad) con blur amplio centrado EXACTAMENTE detrás de la cabeza/torso del zorro. Forma de DISCO/AURA radial, NUNCA banda ni stripe.
- 3-5 partículas de luz blancas difusas distribuidas aleatoriamente

PROHIBIDO ABSOLUTAMENTE EN EL FONDO (causas comunes de defectos visuales):
✗ Líneas horizontales naranjas, bandas, stripes o franjas que crucen la imagen
✗ Línea de horizonte (estilo paisaje sol/atardecer/amanecer)
✗ Gradiente lineal vertical que divida la imagen en dos zonas (cielo/suelo)
✗ Cualquier elemento que sugiera "suelo" + "cielo"
✗ Resplandores en forma de barra, rayo o banda
El fondo es ESPACIO ABSTRACTO, no un escenario. El zorro flota sobre un fondo plano con halo radial.

PALETA: fondo slate oscuro + halo naranja radial. Zorro naranja PLANO + verde sólido + líneas negras. Objetos con colores planos vibrantes (naranja, verde, azul eléctrico, blanco) y contornos negros gruesos.

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte.`;
}

const SYSTEM_PROMPT_HISTORIA_TEXTO = `Eres el Community Manager de WebMakerLatam, una AGENCIA DIGITAL que ayuda a EMPRENDEDORES, PYMES y EMPRESAS de Latinoamérica a crecer con tecnología. Tu mascota es Webi (zorro naranja con lentes).

${CATALOGO_SERVICIOS}

${REGLA_ESPANOL_NEUTRO}

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

// Refuerzo opcional para CTA de conversión (modo única o último frame de serie)
const CTA_CONVERSION_INSTRUCTION = `Este es un story DE CIERRE: el usuario NO verá más después de este. El campo "cta" DEBE ser una invitación clara a contactar a WebMakerLatam — escríbenos al WhatsApp +56 9 5365 7460, agenda una reunión, o cotiza tu proyecto. Tono de AGENCIA, no de influencer. Ejemplos válidos (≤25 chars): "Agenda hoy", "Hablemos por WhatsApp", "Cotiza gratis", "Escríbenos hoy", "Agenda tu diagnóstico". PROHIBIDO: "Sígueme", "Dale like", "Comparte", "Comenta".`;

// Refuerzo para frames intermedios (no son cierre, microCTA tipo "sigue viendo")
const CTA_INTERMEDIO_INSTRUCTION = `Este story NO es el último de la serie — viene otro después. El campo "cta" debe ser un microCTA que invite a CONTINUAR viendo. Ejemplos válidos (≤25 chars): "Sigue viendo", "Mira esto", "Toca para seguir", "Continúa". Hashtags pueden quedar vacíos en este frame ya que solo el último frame los necesita.`;

async function generarTextoHistoria(
  tipoHistoria: string,
  concepto: string,
  options?: { rol?: RolFrame; numero?: number; total?: number },
): Promise<{
  copy_principal: string; sub_copy: string; cta: string; hashtags: string;
}> {
  // Si el frame pertenece a una serie, contextualizamos el copy según rol
  let extraSerie = "";
  let conceptoFinal = concepto;
  if (options && options.total && options.total > 1) {
    const esUltimo = options.numero === options.total;
    const esPrimero = options.numero === 1;
    extraSerie = `\n\nESTE COPY ES PARA UN FRAME DE UNA SERIE de ${options.total} stories conectadas.\nFrame actual: ${options.numero}/${options.total} con rol "${options.rol}".\nReglas adicionales:\n- Cada frame debe poder leerse SOLO (la gente entra a stories en cualquier punto).\n- copy_principal: titular específico para el rol "${options.rol}" (no repetir entre frames).\n- sub_copy: contexto breve consistente con la narrativa del rol.\n- ${esUltimo ? CTA_CONVERSION_INSTRUCTION : CTA_INTERMEDIO_INSTRUCTION}\n- ${esPrimero || esUltimo ? "Hashtags requeridos en este frame (es portada o cierre)." : "Hashtags pueden quedar vacíos."}`;
    conceptoFinal = `${concepto} (rol del frame: ${options.rol})`;
  }

  let texto = await callClaudeHistoria(tipoHistoria, conceptoFinal, extraSerie || undefined);
  const issues = excedeLimites(texto);
  if (issues.length > 0) {
    console.log("[Historias] copy excede límites, pidiendo versión más corta:", issues);
    try {
      const extraRetry = `${extraSerie}\n\nIMPORTANTE: tu intento anterior excedió los límites: ${issues.join("; ")}. REESCRIBE TODO el JSON con versiones MÁS CORTAS y PUNZANTES que sí respeten los máximos. Prefiere impacto sobre información. MANTÉN las reglas de rol/CTA indicadas arriba.`;
      texto = await callClaudeHistoria(tipoHistoria, conceptoFinal, extraRetry);
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

// Detector automático: dada una idea, sugiere "unica" o "serie" con N frames
async function detectarFormatoHistoria(concepto: string): Promise<{
  formato_recomendado: "unica" | "serie";
  cantidad_frames: number;
  razon: string;
  estructura: RolFrame[];
}> {
  const sys = `Eres un estratega de contenido de Instagram Stories para WebMakerLatam (agencia digital LATAM). Tu trabajo es decidir si un tema necesita 1 sola historia o una mini-serie.

REGLAS DE DECISIÓN:
1) Si el tema es una FRASE motivacional, dato curioso, tip rápido o mensaje simple → "unica".
2) Si el tema MENCIONA un número (ej. "3 razones", "5 tips", "4 errores", "2 claves") → "serie" con cantidad = (N + 2) frames (hook + N + cta), pero acotada al rango 2-5. Si N+2 > 5, devolver 5.
3) Si el tema es complejo o EDUCATIVO (necesita explicar qué/por qué/cómo) → "serie" con 3 frames (hook+desarrollo+cta).
4) Si dudas → "unica".

ESTRUCTURAS VÁLIDAS según cantidad:
- 2: ["hook","cta"]
- 3: ["hook","desarrollo","cta"]
- 4: ["hook","problema","solucion","cta"]
- 5: ["hook","contexto","problema","solucion","cta"]

DEVUELVE SOLO un JSON válido sin markdown:
{ "formato_recomendado": "unica"|"serie", "cantidad_frames": 1|2|3|4|5, "razon": "...breve...", "estructura": ["unica"] | [...roles...] }`;
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: sys,
    messages: [{ role: "user", content: `TEMA: ${concepto}\n\nDevuelve solo el JSON.` }],
  });
  const block = resp.content[0];
  const raw = block && block.type === "text" ? block.text.trim() : "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: any = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
  const formato = parsed.formato_recomendado === "serie" ? "serie" : "unica";
  let cantidad = Number(parsed.cantidad_frames) || (formato === "unica" ? 1 : 3);
  cantidad = Math.max(formato === "unica" ? 1 : 2, Math.min(5, cantidad));
  const estructura: RolFrame[] = formato === "unica" ? ["unica"] : getEstructuraSerie(cantidad);
  return {
    formato_recomendado: formato,
    cantidad_frames: cantidad,
    razon: String(parsed.razon || "").slice(0, 240) || (formato === "unica" ? "Tema simple, una historia es suficiente." : "Tema con desarrollo, mejor en serie."),
    estructura,
  };
}

// Genera UN frame de historia (imagen + texto + opcional render con counter).
// Reusable para modo "unica" (frame único) y modo "serie" (N frames).
async function generarFrameHistoria(args: {
  tipoHistoria: string;
  concepto: string;
  poseOverride?: string;
  promptOverride?: string;
  textoEnImagen: boolean;
  referenceBase64: string | null;
  rol: RolFrame;
  numero: number;
  total: number;
  textoPreservado?: { copy_principal: string; sub_copy: string; cta: string; hashtags: string };
}): Promise<{
  numero_frame: number;
  total_frames: number;
  rol: RolFrame;
  imagen: string; // data url
  texto: { copy_principal: string; sub_copy: string; cta: string; hashtags: string };
}> {
  const frameCtx: FrameContext | undefined = args.total > 1
    ? { numero: args.numero, total: args.total, rol: args.rol }
    : undefined;
  const basePrompt = buildHistoriaPrompt(args.tipoHistoria, args.concepto, args.poseOverride, frameCtx);
  const finalPrompt = args.promptOverride ? `${basePrompt}\n\nAJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${args.promptOverride}` : basePrompt;
  const contents = args.referenceBase64
    ? [{ role: "user" as const, parts: [
        { text: "REFERENCE IMAGE 1 (PRIMARY CANON — replicate this character EXACTLY: outline weight, fur color saturation, glasses shape, eye size, body proportions, muzzle length):" },
        { inlineData: { data: args.referenceBase64, mimeType: "image/png" } },
        { text: finalPrompt },
      ] }]
    : [{ role: "user" as const, parts: [{ text: finalPrompt }] }];

  // Backoff para 429
  const MAX_ATTEMPTS = 3;
  let lastErr: any;
  let imgBase64 = "";
  let mime = "image/png";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents,
        config: GEMINI_IMAGE_BASE_CONFIG,
      });
      const finalImg = extractFinalImage(resp);
      if (!finalImg) throw new Error("Gemini no devolvió imagen final");
      imgBase64 = finalImg.data;
      mime = finalImg.mimeType;
      break;
    } catch (e) {
      lastErr = e;
      const rate = isRateLimitErr(e);
      console.warn(`[Historia frame ${args.numero}/${args.total}] intento ${attempt} falló${rate ? " (429)" : ""}:`, (e as Error).message?.slice(0, 200));
      if (attempt === MAX_ATTEMPTS) throw lastErr;
      const baseMs = rate ? 4000 : 800;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, attempt - 1) + Math.random() * 500));
    }
  }

  const texto = args.textoPreservado
    ? args.textoPreservado
    : await generarTextoHistoria(args.tipoHistoria, args.concepto, {
        rol: args.rol, numero: args.numero, total: args.total,
      });

  let outBase64 = imgBase64;
  if (args.textoEnImagen) {
    try {
      outBase64 = await renderTextoEnHistoria(imgBase64, texto, args.total > 1 ? { numero: args.numero, total: args.total } : undefined);
    } catch (e) {
      console.error("[Historia frame] render texto fallo:", e);
    }
  }
  const imagenDataUrl = `data:${args.textoEnImagen ? "image/png" : mime};base64,${outBase64}`;
  return {
    numero_frame: args.numero,
    total_frames: args.total,
    rol: args.rol,
    imagen: imagenDataUrl,
    texto,
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
  frameInfo?: { numero: number; total: number },
): Promise<string> {
  // Forzar 9:16 (1080x1920) — Gemini suele devolver tamaños menores (ej. 768x1376)
  // Sin este resize, las zonas hardcodeadas (Z3_TOP=1280, etc.) quedan fuera del canvas.
  const imgBuffer = await sharp(Buffer.from(imagenBase64, "base64"))
    .resize(1080, 1920, { fit: "cover", position: "center" })
    .png().toBuffer();
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const sidePadding = 80;
  const innerWidth = w - sidePadding * 2;

  const principal = stripEmojis(texto.copy_principal);
  const sub = stripEmojis(texto.sub_copy);
  const cta = stripEmojis(texto.cta);
  const hashtags = stripEmojis(texto.hashtags);

  // LAYOUT DEFINITIVO 1080x1920 (zorro vive 550-1300, ~750 px de alto):
  //   0-150     padding top
  //   150-430   Z1 título (centro 290) — 280 px
  //   430-550   transición con glow ambiental
  //   550-1300  zorro
  //   1300-1360 transición
  //   1360-1540 Z3 sub-copy (centro 1450)
  //   1540-1700 Z4 botón CTA (centro 1620)
  //   1700-1840 Z5 hashtags (centro 1770)
  //   1840-1920 padding bottom
  const Z1_TOP = 150,     Z1_BOTTOM = 430;
  const Z3_TOP = 1360,    Z3_BOTTOM = 1540;
  const Z4_TOP = 1540,    Z4_BOTTOM = 1700;
  const Z5_TOP = 1700,    Z5_BOTTOM = 1840;

  const z1Center = (Z1_TOP + Z1_BOTTOM) / 2;       // 290
  const z3Center = (Z3_TOP + Z3_BOTTOM) / 2;       // 1450
  const z4Center = (Z4_TOP + Z4_BOTTOM) / 2;       // 1620
  const z5Center = (Z5_TOP + Z5_BOTTOM) / 2;       // 1770

  // Título: 72-88px, máximo 2 líneas. Z1 = 280px, dejamos ~30px de padding interno.
  const principalFit = principal ? fitTextBlock(principal, {
    maxWidth: innerWidth,
    maxHeight: Z1_BOTTOM - Z1_TOP - 60,
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

  // Hashtags: ancho con padding lateral generoso (no llegan al borde) +
  // balanceo entre líneas (preferir "3+2" sobre "4+1"). Hasta 3 líneas si hace falta.
  const hashSidePadding = 140;
  const hashFit = hashtags ? fitHashtagsBlock(hashtags, {
    maxWidth: w - hashSidePadding * 2,
    maxFontSize: 32,
    minFontSize: 22,
    maxLines: 3,
    charWidthRatio: 0.58,
    lineHeightRatio: 1.22,
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

  // (Antes había un separador naranja entre el título y el sub-copy, pero
  // se veía como una línea horizontal partiendo la imagen — eliminado.
  // Las zonas se distinguen visualmente por los gradientes topfade/botfade
  // y por la jerarquía tipográfica.)
  const separatorSvg = "";

  // Gradientes en las zonas reservadas para mejorar legibilidad sin parecer cajas
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_DEFS}
    <filter id="ctashadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14"/>
    </filter>
    <rect x="0" y="0" width="${w}" height="${Z1_BOTTOM + 60}" fill="url(#topfade)"/>
    <rect x="0" y="${Z3_TOP - 100}" width="${w}" height="${h - (Z3_TOP - 100)}" fill="url(#botfade)"/>
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
    ${frameInfo && frameInfo.total > 1 ? `
      <rect x="${(w - 160).toFixed(1)}" y="40" width="120" height="56" rx="28"
        fill="#0F172A" fill-opacity="0.55"/>
      <text x="${(w - 100).toFixed(1)}" y="78" text-anchor="middle"
        font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="700"
        font-size="30" fill="#ffffff" fill-opacity="0.85">${frameInfo.numero}/${frameInfo.total}</text>
    ` : ""}
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
  formato: z.enum(["unica", "serie"]).optional().default("unica"),
  cantidad_frames: z.number().int().min(2).max(5).optional(),
});

router.post("/community/historias/generar", async (req, res) => {
  try {
    const body = GenerarHistoriaBody.parse(req.body);
    const referenceBase64 = await getFoxRefBase64();

    // Determinar estructura de frames
    const estructura: RolFrame[] = body.formato === "serie"
      ? getEstructuraSerie(body.cantidad_frames || 3)
      : ["unica"];
    const total = estructura.length;

    // Generar todos los frames en paralelo
    const settled = await Promise.allSettled(
      estructura.map((rol, i) => generarFrameHistoria({
        tipoHistoria: body.tipo_historia,
        concepto: body.concepto,
        poseOverride: body.pose_override,
        textoEnImagen: body.texto_en_imagen,
        referenceBase64,
        rol,
        numero: i + 1,
        total,
      })),
    );

    const frames = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[Historias] frame ${i + 1} falló:`, (r.reason as Error)?.message);
      return {
        numero_frame: i + 1, total_frames: total, rol: estructura[i] as RolFrame,
        imagen: "", texto: { copy_principal: "", sub_copy: "", cta: "", hashtags: "" },
        error: (r.reason as Error)?.message || "Falló este frame",
      };
    });

    // Si TODOS fallaron, reportar error
    const algunoOk = frames.some((f) => f.imagen);
    if (!algunoOk) {
      res.status(502).json({ success: false, error: "Falló la generación de todos los frames" });
      return;
    }

    const primerImg = frames.find((f) => f.imagen)?.imagen || "";

    const [row] = await db.insert(communityContent).values({
      kind: "historia",
      subtype: body.tipo_historia,
      topic: body.concepto,
      data: {
        tipo_historia: body.tipo_historia,
        concepto: body.concepto,
        pose: body.pose_override || "auto",
        texto_en_imagen: body.texto_en_imagen,
        formato: body.formato,
        cantidad_frames: total,
        frames,
        // Compat con vista de historial: el primer frame se expone también plano
        texto: frames[0]?.texto,
      },
      imageUrl: primerImg,
    }).returning();

    res.json({
      success: true,
      data: {
        id: row!.id,
        formato: body.formato,
        tipo_historia: body.tipo_historia,
        concepto: body.concepto,
        texto_en_imagen: body.texto_en_imagen,
        fecha: row!.createdAt,
        frames,
        // Compat con UI antigua (modo única siempre llena estos campos)
        imagen: primerImg,
        texto: frames[0]?.texto,
      },
    });
  } catch (err: any) {
    console.error("[Historias] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

// ============================================
// HISTORIAS — DETECTAR FORMATO (auto)
// ============================================
const DetectarFormatoBody = z.object({
  concepto: z.string().min(1).max(200),
});

router.post("/community/historias/detectar-formato", async (req, res) => {
  try {
    const body = DetectarFormatoBody.parse(req.body);
    const reco = await detectarFormatoHistoria(body.concepto);
    res.json({ success: true, data: reco });
  } catch (err: any) {
    console.error("[Detectar formato] Error:", err);
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

const SYSTEM_PROMPT_DESC = `Eres el Community Manager oficial de WebMakerLatam, una AGENCIA DIGITAL que ayuda a EMPRENDEDORES, PYMES y EMPRESAS de Latinoamérica a crecer con tecnología. Tu mascota es Webi (zorro naranja con lentes).

${CATALOGO_SERVICIOS}

${REGLA_ESPANOL_NEUTRO}

AUDIENCIA: dueños de negocio que NO son técnicos. Habla de BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, profesionalizar marca, atender 24/7), nunca jerga técnica. Conecta el contenido con servicios de WebMakerLatam de forma natural, sin ser spam.

EJEMPLOS BUENOS:
✅ "Tu web vende aunque tú duermas"
✅ "Deja de perder clientes por responder tarde"

PROHIBIDOS (salvo audiencia dev explícita):
❌ Tutoriales de código, librerías, frameworks técnicos

REGLAS DE ESCRITURA (NO NEGOCIABLES):
1. Largo por defecto: MÁXIMO 5 LÍNEAS por descripción
2. EXCEPCIÓN — TEMA ENUMERADO (cuando el tema menciona un número explícito: "5 señales", "3 razones", "7 errores", "10 tips", etc.):
   - La descripción DEBE enumerar y explicar BREVEMENTE los N puntos (1 línea por punto, formato "1. ... 2. ... 3. ..." o con emojis numéricos).
   - Aplica TANTO si la publicación es única (una sola imagen) COMO si es un carrusel (en el carrusel la descripción ofrece el resumen de los N puntos para quien no haga swipe).
   - Esta regla aplica a TIKTOK, INSTAGRAM y YOUTUBE SHORTS.
   - TWITTER mantiene su límite de 280 caracteres: si no caben los N puntos enteros, lista los títulos cortos numerados (ej: "1) Web lenta 2) Sin móvil 3) Sin CTA 4) Sin chat 5) Sin SEO") + CTA + hashtags.
   - Cierra siempre con pregunta/CTA después de la lista.
3. Tono cercano, latino, accesible, sin cringe
4. SIEMPRE pregunta o CTA al final para generar comentarios
5. Emojis con moderación (0-3, salvo numéricos 1️⃣2️⃣3️⃣ permitidos en listas)
6. Habla de "tú"
7. Conecta con servicios de la agencia cuando sea natural

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

REGLA ESTRICTA — TEMAS ENUMERADOS EN CARRUSEL ("3 tips", "5 errores", "7 señales", "4 razones", "10 hábitos", etc.):
- Si el tema dice "N tips/errores/señales/razones/claves/hábitos/trucos/etc.", el carrusel DEBE tener exactamente 1 portada + N slides de desarrollo + 1 CTA = N+2 slides totales.
- CADA slide de desarrollo cubre EXACTAMENTE UN punto de la lista, en orden secuencial 1, 2, 3, …, N. PROHIBIDO agrupar dos puntos en una sola slide (NUNCA "Tip 2 y 3 juntos", NUNCA "Errores 1 y 2", NUNCA "Razones 4 y 5").
- El "titulo" de cada slide de desarrollo DEBE empezar con la palabra del tema seguida del número: "Tip 1: ...", "Tip 2: ...", "Tip 3: ..." (o "Error 1: ...", "Señal 1: ...", "Razón 1: ...", "Clave 1: ...", según corresponda al tema). Mantén el mismo sustantivo y la misma estructura en TODOS los desarrollos del mismo carrusel.
- PROHIBIDO insertar slides extra de "problema general" o "intro adicional" entre la portada y el primer punto enumerado: el slide #2 debe ser DIRECTAMENTE "Tip 1" (o "Error 1", etc.).
- Si el front pide menos slides que N+2 (ej: tema dice "5 tips" pero piden 4 slides), recorta los puntos finales pero mantén la numeración correlativa desde 1 (NUNCA saltes números, NUNCA agrupes).

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
  cantidad_slides: z.number().int().min(1).max(10).default(1),
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

  // FIX 4 — prompt en estructura XML: Gemini 3 da más peso a las instrucciones FINALES.
  // Por eso <critical_final_requirements> va al cierre del prompt, no al inicio.
  return `<role>
Professional brand illustrator replicating exact character style from the provided reference images for WebMakerLatam's mascot "Webi" (an orange cartoon fox with glasses). Output: a single illustration of ${dims} for a WebMakerLatam social media post (digital agency for entrepreneurs/pymes in LATAM).
</role>

<character_canon>
The character (Webi the fox) MUST match EXACTLY the provided reference images:
- REFERENCE IMAGE 1 = primary canon (replicate outline weight, fur color, glasses shape, eye size, body proportions, muzzle length).
- Additional REFERENCE IMAGES = approved pose/scene variants in the same style and palette.
Study these references carefully BEFORE generating. Only the pose and surrounding objects change between slides — the character itself never deviates.
</character_canon>

<reference_image_handling>
CRITICAL — about the reference images you received above:
- The dark navy bands at the top (~22%) and bottom (~25%) of each canonical reference are RESERVED EMPTY ZONES. They were intentionally cleared. They are NOT part of the illustration.
- Your output MUST keep those same top and bottom bands completely empty: no character parts, no objects, no shadows, no text, no buttons, no badges, no logos.
- Replicate ONLY the central illustration (the fox + the supporting objects in the middle). Ignore any artifact you might perceive in the bands.
- The references contain ZERO readable text. Your output must also contain ZERO readable text — no titles, no captions, no buttons with words like "Hablemos" or "Escríbenos", no UI labels, no numbers, no logos with text.
</reference_image_handling>

<strict_style_specifications>
${FOX_BRAND_SPEC}

Additional carousel-wide rules:
- Style: Flat 2D cartoon (NOT 3D, NOT Disney, NOT chibi, NOT anime, NOT realistic).
- Outlines: bold uniform black lines, ~3-4px weight everywhere (character + objects).
- Fills: solid flat colors only — NO gradients, NO shading on the character, NO highlights, NO glossy reflections in glasses lenses.
- Fox fur: saturated orange #E86A30 single flat tone.
- Shirt: olive green #4A5D3A single flat color.
- Glasses: thick rectangular dark-brown frames, transparent lenses (no white reflections).
- Face: elongated slim muzzle (NOT round chibi), black triangular nose (NOT pink), small simple black-dot eyes (NOT big Disney/Pixar shiny eyes).
- This slide must look part of the SAME visual universe as the other slides of the same carousel (same background, palette, line weight).
</strict_style_specifications>

<scene_role>
${rolDescripcion}
</scene_role>

<scene_context>
- Carousel theme: "${tema}" (${tipoContenido})
- Slide title: "${slide.titulo}"
- Slide subtitle: "${slide.subtitulo}"
- ${enfoqueVisual}
</scene_context>

<scene_objects>
RULE "less is more": MAXIMUM 2-3 main objects in the WHOLE scene (never 5, never 7). When the scene gets crowded, the character loses consistency because the model balances styles.
Object mapping (pick ONE or TWO, never all):
  * chatbot / WhatsApp → green chat bubble OR a single smartphone
  * website → laptop with abstract webpage (no readable text)
  * sales → cart OR ascending chart (one)
  * speed → rocket OR speedometer
  * automation / AI → gears OR digital brain
  * customers → 2-3 small silhouettes
  * SEO → magnifier OR podium
  * mobile / app → smartphone
  * scheduling → calendar
- Objects INTERACT with the fox (he points at / holds / pushes them). They never float in a pile.
- Solid vibrant flat colors with thick black outlines — never multiple colorful elements competing with the character.
</scene_objects>

<composition>
- Aspect ratio and canvas: ${dims}.
- Character placement: centered, full body visible from ears to feet, occupying ~30-55% of the central area depending on the role above.
- Reserved TOP zone — 22% (1:1 → 0-220px / 4:5 → 0-280px): clean background, no character parts, no objects, no shadows. Reserved for text overlay.
- Reserved BOTTOM zone — 25% (1:1 → 880-1080px / 4:5 → 1050-1350px): clean background, no character parts, no objects, no shadows. Reserved for text overlay.
- All visual action goes strictly in the central zone.
</composition>

<background>
- Radial gradient from center: #1E293B (slate-800) toward #0F172A (slate-900) at edges.
- Subtle geometric grid: white lines at 3-5% opacity.
- Ambient orange glow (#E86A30 at ~20% opacity) behind the character as a halo.
- 3-5 soft white light particles scattered.
</background>

<critical_final_requirements>
VERIFY these BEFORE finalizing the image. If ANY answer is "no", regenerate internally:
1. NO text, NO letters, NO numbers, NO labels, NO captions ANYWHERE in the image. Screens and UI show abstract shapes only.
2. Character matches REFERENCE IMAGE 1 in: outline weight, fur color saturation (#E86A30 flat), glasses shape (rectangular, dark brown), eye size (small simple black dots), nose color (black, NOT pink), muzzle length (elongated, NOT round chibi), shirt color (olive green #4A5D3A flat).
3. Glasses lenses are fully transparent — NO white reflections, NO highlights.
4. NO 3D rendering, NO Disney/Pixar big shiny eyes, NO realistic shading or gradients on the fox or his shirt, NO anime style.
5. Maximum 2-3 main objects in scene — character is the clear focus.
6. Full body visible (ears to feet), not cropped.
7. Top 22% and bottom 25% zones are completely clean (no character, no objects, no shadows).
8. Background follows the radial gradient + subtle grid + orange glow halo + light particles spec exactly.

If any element deviates from the reference style or violates these rules, regenerate internally before returning the final image. Any deviation breaks the registered branding.
</critical_final_requirements>`;
}

async function generarImagenSlide(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
): Promise<string> {
  const prompt = buildSlidePrompt(tema, tipoContenido, slide, formato, totalSlides);

  // Referencias canon (imágenes 10/10 aprobadas) según rol del slide
  const canonRefs = await pickCanonReferences(slide.rol, tema, slide.prompt_visual);

  // FIX 3 — Construcción del array `parts` con etiqueta de rol ANTES de cada imagen
  // y prompt al FINAL (Gemini 3 da más peso a las instrucciones finales).
  // Cap de 5 imágenes de personaje por request (límite "character consistency").
  const parts: any[] = [];
  let charImagesUsed = 0;
  const MAX_CHARACTER_IMAGES = 5;

  if (referenceBase64 && charImagesUsed < MAX_CHARACTER_IMAGES) {
    parts.push({
      text: "REFERENCE IMAGE 1 (PRIMARY CANON — replicate this character EXACTLY: outline weight, fur color saturation, glasses shape, eye size, body proportions, muzzle length, FLAT 2D cartoon style with NO shading or gradients):",
    });
    parts.push({ inlineData: { mimeType: "image/png", data: referenceBase64 } });
    charImagesUsed++;
  }
  for (let i = 0; i < canonRefs.length; i++) {
    if (charImagesUsed >= MAX_CHARACTER_IMAGES) {
      console.warn(`[Slide ${slide.numero}] limitando referencias a ${MAX_CHARACTER_IMAGES} (descartadas: ${canonRefs.length - i})`);
      break;
    }
    parts.push({
      text: `REFERENCE IMAGE ${charImagesUsed + 1} (canonical pose/style variant — same FLAT 2D cartoon style, same background palette, same character anatomy. The dark navy bands at the top and bottom of this reference are the RESERVED TEXT ZONES kept intentionally empty — they are NOT part of the illustration; do NOT draw any character parts, objects, shadows or text into those bands in your output):`,
    });
    parts.push({ inlineData: { mimeType: "image/png", data: canonRefs[i]! } });
    charImagesUsed++;
  }
  // FIX 4 — el prompt (con instrucciones críticas al final) va AL FINAL del array
  parts.push({ text: prompt });

  const contents = [{ role: "user" as const, parts }];

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents,
    config: GEMINI_IMAGE_BASE_CONFIG,
  });
  const finalImg = extractFinalImage(response);
  if (!finalImg) {
    throw new Error(`Gemini no devolvió imagen final para slide ${slide.numero}`);
  }
  return finalImg.data;
}

function isRateLimitErr(err: any): boolean {
  const msg = typeof err?.message === "string" ? err.message : "";
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted") || msg.toLowerCase().includes("quota");
}

async function generarImagenSlideConRetry(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
): Promise<string> {
  const MAX_ATTEMPTS = 4;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides);
    } catch (e) {
      lastErr = e;
      const rate = isRateLimitErr(e);
      console.warn(`[Descripciones] slide ${slide.numero} intento ${attempt}/${MAX_ATTEMPTS} falló${rate ? " (429)" : ""}:`, (e as Error).message?.slice(0, 200));
      if (attempt === MAX_ATTEMPTS) break;
      // Backoff: 429 espera más; otros errores espera menos
      const baseMs = rate ? 4000 : 800;
      const wait = baseMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (isRateLimitErr(lastErr)) {
    throw new Error("RATE_LIMIT");
  }
  throw lastErr;
}

// Post-validación con Gemini Vision: compara la imagen generada vs la master
// Devuelve true si el zorro es estilísticamente IDÉNTICO. Falla → false.
async function validarConsistenciaZorro(
  imagenGeneradaBase64: string,
  referenceBase64: string | null,
): Promise<boolean> {
  if (!referenceBase64) return true; // sin referencia no podemos validar
  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [
        { inlineData: { data: referenceBase64, mimeType: "image/png" } },
        { inlineData: { data: imagenGeneradaBase64, mimeType: "image/png" } },
        { text: `Analiza ambas imágenes. La PRIMERA es la imagen MASTER OFICIAL del zorro Webi de la marca WebMakerLatam. La SEGUNDA es una imagen recién generada que también debe contener al zorro Webi.

¿El zorro de la SEGUNDA imagen es estilísticamente IDÉNTICO al de la PRIMERA? Verifica:
- Cara alargada (NO redonda chibi)
- Ojos pequeños círculos negros (NO ojos grandes Disney/Pixar con brillos)
- Nariz negra triangular (NO rosada)
- Lentes rectangulares con marco negro (NO marrón ni naranja)
- Pelaje plano #E86A30 (NO con sombras ni gradientes)
- Polera verde oscuro plana #4A5D3A
- Líneas negras gruesas y uniformes
- Estilo flat cartoon 2D (NO 3D ni anime ni realista)

Responde EXCLUSIVAMENTE con una sola palabra: SI o NO. Sin explicación.` },
      ] }],
    });
    const txt = (resp.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "").trim().toUpperCase();
    return txt.startsWith("SI") || txt.startsWith("SÍ") || txt.startsWith("YES");
  } catch (e) {
    console.warn("[Descripciones] validación Vision falló:", (e as Error).message);
    return true; // si falla la validación, no bloqueamos la generación
  }
}

// Auto-diagnóstico con Gemini Vision: compara la imagen generada vs la master
// y devuelve correcciones específicas que se inyectan al prompt en el siguiente reintento.
async function diagnosticarImagenConVision(
  imagenGeneradaBase64: string,
  referenceBase64: string | null,
): Promise<string | null> {
  if (!referenceBase64) return null;
  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [
        { inlineData: { data: referenceBase64, mimeType: "image/png" } },
        { inlineData: { data: imagenGeneradaBase64, mimeType: "image/png" } },
        { text: `Eres un director de arte experto en branding flat cartoon 2D. La PRIMERA imagen es la MASTER OFICIAL del zorro Webi (mascota de WebMakerLatam). La SEGUNDA es una imagen recién generada que debe replicar al zorro idéntico y respetar la composición de marca.

Diagnostica EXCLUSIVAMENTE los defectos visibles en la SEGUNDA imagen comparándola con la PRIMERA y con estas reglas:
- Cara alargada (NO redonda chibi), ojos pequeños puntos negros (NO Disney/Pixar con brillos), nariz negra triangular (NO rosada), lentes RECTANGULARES marco negro (NO redondos/marrones).
- Pelaje plano #E86A30, polera verde plana #4A5D3A, líneas negras gruesas y uniformes, estilo flat cartoon 2D vector (NO 3D, NO anime, NO realista).
- Composición: máximo 3 objetos AGRUPADOS a un lado, nada cortado por bordes, sin texto/letras dentro del arte, sin fondos saturados.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con ESTA estructura exacta (sin markdown, sin texto extra):
{
  "problemas": ["problema 1 concreto", "problema 2 concreto", "problema 3 concreto"],
  "correcciones": ["instrucción imperativa 1 para arreglarlo", "instrucción imperativa 2", "instrucción imperativa 3"]
}

Reglas:
- Máximo 4 problemas + 4 correcciones (uno por defecto real). Si hay menos, devuelve menos.
- Si la imagen está PERFECTA y no requiere cambios, devuelve {"problemas": [], "correcciones": []}.
- Las correcciones deben ser instrucciones imperativas en español, concretas y accionables (ej. "Reemplaza los ojos grandes por dos puntos negros pequeños sin brillo").
- NO repitas el mismo defecto en problemas y correcciones; sé conciso.` },
      ] }],
    });
    const txt = (resp.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "").trim();
    // Limpia posible bloque markdown ```json ... ```
    const limpio = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const json = JSON.parse(limpio);
    const correcciones: string[] = Array.isArray(json?.correcciones) ? json.correcciones.filter((c: any) => typeof c === "string" && c.trim()) : [];
    const problemas: string[] = Array.isArray(json?.problemas) ? json.problemas.filter((c: any) => typeof c === "string" && c.trim()) : [];
    if (correcciones.length === 0) {
      console.log("[Auto-diagnóstico] Imagen aprobada por Vision, sin correcciones.");
      return null;
    }
    console.log(`[Auto-diagnóstico] Vision detectó ${problemas.length} problema(s):`, problemas);
    const bloque = `AUTO-DIAGNÓSTICO VISION (alta prioridad — corrige estos defectos detectados en el intento anterior):
PROBLEMAS DETECTADOS:
${problemas.map((p, i) => `${i + 1}. ${p}`).join("\n")}
CORRECCIONES OBLIGATORIAS:
${correcciones.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
    return bloque;
  } catch (e) {
    console.warn("[Auto-diagnóstico] Vision falló:", (e as Error).message);
    return null;
  }
}

async function generarImagenSlideConValidacion(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
): Promise<{ imagen: string; consistente: boolean }> {
  let imagen = await generarImagenSlideConRetry(tema, tipoContenido, slide, formato, referenceBase64, totalSlides);
  let consistente = await validarConsistenciaZorro(imagen, referenceBase64);
  if (!consistente) {
    console.warn(`[Descripciones] slide ${slide.numero} falló validación Vision, reintentando una vez...`);
    try {
      const segundo = await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides);
      const segundoOk = await validarConsistenciaZorro(segundo, referenceBase64);
      if (segundoOk) { imagen = segundo; consistente = true; }
      else { imagen = segundo; } // Devuelve el segundo intento aunque siga inconsistente (mejor que nada)
    } catch (e) {
      console.warn("[Descripciones] retry validado fallo:", (e as Error).message);
    }
  }
  return { imagen, consistente };
}

// Render texto sobre slide (1:1 o 4:5) con auto-fit, padding y fondos semi-transparentes, SIN emojis
async function renderTextoEnSlide(
  imagenBase64: string,
  slide: SlidePlan,
  totalSlides: number = 1,
  formatoForzado?: "1:1" | "4:5",
): Promise<string> {
  let imgBuffer = Buffer.from(imagenBase64, "base64");
  // Garantizar dimensiones exactas según formato (Gemini suele devolver 1:1 aunque pidamos 4:5)
  if (formatoForzado === "4:5") {
    imgBuffer = await sharp(imgBuffer).resize(1080, 1350, { fit: "cover", position: "center" }).png().toBuffer();
  } else if (formatoForzado === "1:1") {
    imgBuffer = await sharp(imgBuffer).resize(1080, 1080, { fit: "cover", position: "center" }).png().toBuffer();
  }
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

// Detecta automáticamente cuántas slides necesita un tema (1 portada + N desarrollo + 1 CTA)
const CalcularSlidesBody = z.object({ tema: z.string().min(1).max(300) });
router.post("/community/descripciones/calcular-slides", async (req, res) => {
  try {
    const body = CalcularSlidesBody.parse(req.body);
    const sys = `Eres un analista de contenido para Instagram. Recibes el tema de un carrusel y debes detectar cuántas slides son necesarias para cubrirlo.

REGLAS:
- Estructura siempre: 1 portada (hook) + N desarrollo + 1 CTA final.
- Si el tema menciona un número explícito ("5 señales", "3 razones", "7 errores", "10 tips"), usa ese N.
- Si no menciona número, usa N=3 (3 puntos de desarrollo, total 5 slides).
- Mínimo total: 3 slides. Máximo total: 10 slides (límite de Instagram).
- Si el número detectado haría que el total > 10, ajusta a 10 (cap).

Devuelve SOLO JSON con esta forma exacta, sin texto extra ni markdown:
{
  "cantidad_recomendada": <número entre 3 y 10>,
  "razon": "<explicación corta en español, ej: Detecté '5 señales' → portada + 5 desarrollo + CTA>",
  "estructura": ["portada", "<rol slide 2>", "<rol slide 3>", ..., "CTA"]
}`;

    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: sys,
      messages: [{ role: "user", content: `TEMA: ${body.tema}\n\nDevuelve solo el JSON.` }],
    });
    const block = resp.content[0];
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    let data: any;
    try { data = JSON.parse(cleaned); } catch { data = null; }
    const cantidad = Math.max(3, Math.min(10, Number(data?.cantidad_recomendada) || 5));
    res.json({
      success: true,
      data: {
        cantidad_recomendada: cantidad,
        razon: String(data?.razon || `Estructura por defecto: portada + 3 desarrollo + CTA = ${cantidad} slides.`),
        estructura: Array.isArray(data?.estructura) ? data.estructura.slice(0, cantidad) : undefined,
      },
    });
  } catch (err: any) {
    console.error("[Descripciones] calcular-slides error:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.post("/community/descripciones/generar", async (req, res) => {
  try {
    const body = GenerarDescripcionesBody.parse(req.body);
    const cantidad = body.tipo_publicacion === "carrusel"
      ? Math.max(3, Math.min(10, body.cantidad_slides))
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
      slidesPlan.map((s) => generarImagenSlideConValidacion(body.tema, body.tipo_contenido, s, formato, referenceBase64, cantidad)),
    );

    const imagenes = await Promise.all(
      slidesPlan.map(async (slide, idx) => {
        const r = settled[idx]!;
        if (r.status === "rejected") {
          return {
            numero_slide: slide.numero, rol: slide.rol,
            titulo: slide.titulo, subtitulo: slide.subtitulo,
            imagen: null, consistente: false, error: (r.reason as Error)?.message || "Falló la generación",
          };
        }
        let imgBase64 = r.value.imagen;
        if (body.texto_en_imagen) {
          try {
            imgBase64 = await renderTextoEnSlide(imgBase64, slide, cantidad, formato);
          } catch (e) {
            console.error("[Descripciones] render texto fallo slide", slide.numero, e);
          }
        }
        return {
          numero_slide: slide.numero, rol: slide.rol,
          titulo: slide.titulo, subtitulo: slide.subtitulo,
          imagen: `data:image/png;base64,${imgBase64}`,
          consistente: r.value.consistente,
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
  numero_slide: z.number().int().min(1).max(10),
  rol: z.enum(["portada", "desarrollo", "cta", "unica"]),
  titulo: z.string().max(120),
  subtitulo: z.string().max(200),
  prompt_visual: z.string().max(300).optional(),
  formato: z.enum(["1:1", "4:5"]).default("4:5"),
  texto_en_imagen: z.boolean().optional().default(false),
  total_slides: z.number().int().min(1).max(10).optional().default(1),
  modo: z.enum(["imagen", "texto", "ambos", "personalizado", "auto-diagnose"]).optional().default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
  imagen_actual_base64: z.string().optional(), // sin prefijo data:; usado por auto-diagnose
});

// Regenera SOLO el texto (titulo + subtitulo) de una slide, manteniendo el rol
async function regenerarTextoSlide(
  tema: string, tipoContenido: string, rol: SlideRol, numero: number, totalSlides: number,
  ajuste?: string,
): Promise<{ titulo: string; subtitulo: string; prompt_visual?: string }> {
  const ajusteTxt = ajuste ? `\n\nAJUSTE PEDIDO POR EL USUARIO: "${ajuste}". Aplica este ajuste al copy.` : "";
  const prompt = `Genera SOLO una slide de carrusel para WebMakerLatam.
Tema general: "${tema}" (${tipoContenido})
Es la slide número ${numero} de ${totalSlides} con rol "${rol}".${ajusteTxt}

Devuelve JSON estricto:
{ "titulo": "máx 50 chars", "subtitulo": "máx 90 chars", "prompt_visual": "1 frase descripción visual" }`;
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: SYSTEM_PROMPT_DESC,
    messages: [{ role: "user", content: prompt }],
  });
  const txt = resp.content[0]?.type === "text" ? resp.content[0].text : "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude no devolvió JSON válido para texto de slide");
  const parsed = JSON.parse(m[0]);
  return { titulo: parsed.titulo || "", subtitulo: parsed.subtitulo || "", prompt_visual: parsed.prompt_visual };
}

router.post("/community/descripciones/reintentar-slide", async (req, res) => {
  try {
    const body = ReintentarSlideBody.parse(req.body);
    let titulo = body.titulo;
    let subtitulo = body.subtitulo;
    let prompt_visual = body.prompt_visual;

    // 1) Regenerar texto si modo lo requiere
    if (body.modo === "texto" || body.modo === "ambos") {
      try {
        const nuevo = await regenerarTextoSlide(
          body.tema, body.tipo_contenido, body.rol, body.numero_slide, body.total_slides,
          body.modo === "ambos" ? body.prompt_personalizado : body.prompt_personalizado,
        );
        titulo = nuevo.titulo || titulo;
        subtitulo = nuevo.subtitulo || subtitulo;
        if (nuevo.prompt_visual) prompt_visual = nuevo.prompt_visual;
      } catch (e) { console.error("[Reintentar slide] regen texto:", e); }
    }

    const slide: SlidePlan = {
      numero: body.numero_slide, rol: body.rol,
      titulo, subtitulo, prompt_visual,
    };

    // 2) Si modo es "texto", devolvemos sin tocar imagen
    if (body.modo === "texto") {
      res.json({
        success: true,
        data: {
          numero_slide: slide.numero, rol: slide.rol,
          titulo, subtitulo, prompt_visual,
          imagen: null, // frontend conserva la imagen actual
        },
      });
      return;
    }

    // 3) Regenerar imagen — para "personalizado"/"auto-diagnose", inyectamos ajuste al prompt visual
    const referenceBase64 = await getFoxRefBase64();
    let slideParaImagen = slide;
    let ajusteFinal: string | undefined = body.modo === "personalizado" ? body.prompt_personalizado : undefined;
    if (body.modo === "auto-diagnose" && body.imagen_actual_base64) {
      const diagnostico = await diagnosticarImagenConVision(body.imagen_actual_base64, referenceBase64);
      if (diagnostico) ajusteFinal = diagnostico;
      else ajusteFinal = "La imagen anterior fue aprobada por Vision pero el usuario pidió un nuevo intento — varía la pose y el encuadre manteniendo el mismo concepto.";
    }
    if (ajusteFinal) {
      slideParaImagen = {
        ...slide,
        prompt_visual: `${slide.prompt_visual || ""}. AJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${ajusteFinal}`.trim(),
      };
    }
    let imgBase64 = await generarImagenSlideConRetry(body.tema, body.tipo_contenido, slideParaImagen, body.formato, referenceBase64, body.total_slides);
    if (body.texto_en_imagen) {
      try { imgBase64 = await renderTextoEnSlide(imgBase64, slide, body.total_slides, body.formato); } catch {}
    }
    res.json({
      success: true,
      data: {
        numero_slide: slide.numero, rol: slide.rol,
        titulo, subtitulo, prompt_visual,
        imagen: `data:image/png;base64,${imgBase64}`,
      },
    });
  } catch (err: any) {
    console.error("[Reintentar slide] Error:", err);
    if (err?.message === "RATE_LIMIT" || isRateLimitErr(err)) {
      res.status(429).json({ success: false, error: "El servicio de imágenes está saturado ahora mismo (cuota de Gemini). Espera 1-2 minutos y vuelve a intentar el ajuste rápido." });
      return;
    }
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

// ============================================
// HISTORIAS — REINTENTAR
// ============================================
const ReintentarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  texto_actual: z.object({
    copy_principal: z.string(),
    sub_copy: z.string(),
    cta: z.string(),
    hashtags: z.string(),
  }).optional(),
  texto_en_imagen: z.boolean().optional().default(false),
  modo: z.enum(["imagen", "texto", "ambos", "personalizado", "auto-diagnose"]).default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
  imagen_actual_base64: z.string().optional(), // sin prefijo data:; usado por auto-diagnose
  // Soporte de serie: regenerar UN frame específico
  numero_frame: z.number().int().min(1).max(5).optional(),
  total_frames: z.number().int().min(1).max(5).optional(),
  rol: z.enum(["unica", "hook", "contexto", "problema", "desarrollo", "solucion", "cta"]).optional(),
});

router.post("/community/historias/reintentar", async (req, res) => {
  try {
    const body = ReintentarHistoriaBody.parse(req.body);
    const total = body.total_frames || 1;
    const numero = body.numero_frame || 1;
    const rol: RolFrame = body.rol || "unica";

    // 1) Regenerar texto si modo lo requiere
    let texto = body.texto_actual || { copy_principal: "", sub_copy: "", cta: "", hashtags: "" };
    if (body.modo === "texto" || body.modo === "ambos" ||
        (body.modo === "personalizado" && !body.texto_actual)) {
      const conceptoExtendido = body.prompt_personalizado && (body.modo === "texto" || body.modo === "ambos")
        ? `${body.concepto}. AJUSTE PEDIDO: ${body.prompt_personalizado}`
        : body.concepto;
      texto = await generarTextoHistoria(body.tipo_historia, conceptoExtendido, { rol, numero, total });
    }

    // 2) Modo "texto" puro: devuelve solo texto, sin imagen
    if (body.modo === "texto") {
      res.json({ success: true, data: { texto, imagen: null } });
      return;
    }

    // 3) Regenerar imagen (con contexto de frame si aplica)
    // El ajuste personalizado debe afectar a la IMAGEN tanto en modo "personalizado"
    // como en modo "ambos" (texto + imagen) cuando viene un prompt del usuario.
    const referenceBase64 = await getFoxRefBase64();
    let promptOverride: string | undefined = body.prompt_personalizado &&
      (body.modo === "personalizado" || body.modo === "ambos")
      ? body.prompt_personalizado
      : undefined;
    if (body.modo === "auto-diagnose" && body.imagen_actual_base64) {
      const diagnostico = await diagnosticarImagenConVision(body.imagen_actual_base64, referenceBase64);
      promptOverride = diagnostico
        ?? "La imagen anterior fue aprobada por Vision pero el usuario pidió un nuevo intento — varía la pose y el encuadre manteniendo el mismo concepto.";
    }
    // Si NO regeneramos texto en este modo y el cliente envió texto_actual,
    // preservamos el texto y evitamos llamar a Claude (más rápido y robusto).
    const textoPreservado = (body.modo === "imagen" || body.modo === "personalizado" || body.modo === "auto-diagnose") && body.texto_actual
      ? body.texto_actual
      : undefined;
    const frame = await generarFrameHistoria({
      tipoHistoria: body.tipo_historia,
      concepto: body.concepto,
      promptOverride,
      textoEnImagen: body.texto_en_imagen,
      referenceBase64,
      rol,
      numero,
      total,
      textoPreservado,
    });
    // El frame ya devuelve el texto correcto (preservado o nuevo)
    const textoFinal = frame.texto;

    // Si conservamos el texto pero hicimos texto_en_imagen, hay que re-renderizar el counter encima de la nueva imagen — generarFrameHistoria ya lo hizo con su propio texto.
    // Para evitar inconsistencia visual (counter+texto que no coincide con el panel), cuando hay texto_actual y texto_en_imagen, re-renderizamos con el texto preservado.
    let imagenFinal = frame.imagen;
    if (body.texto_en_imagen && (body.modo === "imagen" || body.modo === "personalizado") && body.texto_actual) {
      try {
        // Extraer base64 puro del data URL para re-render
        const m = frame.imagen.match(/^data:[^;]+;base64,(.+)$/);
        if (m) {
          const reRendered = await renderTextoEnHistoria(m[1]!, body.texto_actual, total > 1 ? { numero, total } : undefined);
          imagenFinal = `data:image/png;base64,${reRendered}`;
        }
      } catch (e) {
        console.error("[Hist reintentar] re-render con texto preservado falló:", e);
      }
    }

    res.json({ success: true, data: { texto: textoFinal, imagen: imagenFinal, numero_frame: numero, total_frames: total, rol } });
  } catch (err: any) {
    console.error("[Reintentar historia] Error:", err);
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
