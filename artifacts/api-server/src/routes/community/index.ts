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

const galleryCache = new Map<string, string>();
async function loadGalleryFile(file: string): Promise<string | null> {
  if (galleryCache.has(file)) return galleryCache.get(file)!;
  try {
    const p = await resolveAsset("public", "style-gallery", file);
    const b64 = (await readFile(p)).toString("base64");
    galleryCache.set(file, b64);
    return b64;
  } catch {
    return null;
  }
}

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

REGLA DE ORO: si NO se puede confundir con la imagen master adjunta, es INCORRECTA y debe regenerarse.`;

// ============================================
// SORPRÉNDEME (audiencia: emprendedores/pymes)
// ============================================

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

const SORPRENDEME_SYSTEM = `Eres el estratega senior de contenido de WebMakerLatam, AGENCIA digital LATAM que ayuda a EMPRENDEDORES, PYMES y EMPRESAS a crecer con tecnología (desarrollo web a medida, e-commerce, software, chatbots con IA, apps móviles, automatizaciones, marketing digital, SEO, integraciones, branding, hosting/dominios).

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
- POSICIÓN VERTICAL EXACTA Y NO NEGOCIABLE: la cabeza del zorro debe empezar DESPUÉS del píxel y=420, y sus PIES deben terminar ANTES del píxel y=1080. Es decir, todo el zorro vive ESTRICTAMENTE entre y=420 y y=1080 (660 px de altura). NUNCA invadas la franja inferior (y=1080-1920) — esa zona está reservada para texto, sub-copy, botón CTA y hashtags. Si tu zorro queda demasiado abajo o demasiado grande, RECÓRTALO. Mejor un zorro mediano centrado en la mitad superior que un zorro grande que invade la zona inferior.
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

  // Centros de cada zona
  // Zonas recalculadas: zorro vive 420-1080, abajo queda libre desde 1100
  const Z1_TOP = 0,       Z1_BOTTOM = 380;
  const Z3_TOP = 1180,    Z3_BOTTOM = 1480;   // sub-copy con más espacio (300 px)
  const Z4_TOP = 1500,    Z4_BOTTOM = 1720;
  const Z5_TOP = 1740,    Z5_BOTTOM = 1880;

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

  // Referencias canon (imágenes 10/10 aprobadas) según rol del slide
  const canonRefs = await pickCanonReferences(slide.rol, tema, slide.prompt_visual);

  const parts: any[] = [];
  if (referenceBase64) {
    parts.push({ inlineData: { data: referenceBase64, mimeType: "image/png" } });
  }
  for (const ref of canonRefs) {
    parts.push({ inlineData: { data: ref, mimeType: "image/png" } });
  }
  if (referenceBase64 || canonRefs.length > 0) {
    const lineas: string[] = ["IMÁGENES DE REFERENCIA arriba:"];
    if (referenceBase64) {
      lineas.push("• La PRIMERA es el MASTER OFICIAL del zorro Webi (anatomía, colores, estilo línea exactos a replicar).");
    }
    if (canonRefs.length > 0) {
      const cuantas = canonRefs.length === 1 ? "1 referencia" : `${canonRefs.length} referencias`;
      lineas.push(`• Las siguientes son ${cuantas} CANON 10/10 ya aprobadas por el cliente: muestran composición, pose, props, paleta de fondo, tipografía blanca, tamaño del zorro, gradiente naranja radial detrás del personaje, grilla geométrica sutil de fondo y nivel de detalle CORRECTOS para este tipo de slide. RESPETA esta estética de forma estricta: misma escala del zorro (ocupa ~55% del alto, NO más), mismo fondo azul oscuro #0F1B2D con gradiente naranja radial detrás del personaje, mismas líneas negras gruesas uniformes, mismo nivel de plano (NO close-up de cara), misma calidad y limpieza de los props (laptops/celulares con iconos simples vector, no fotorrealistas).`);
    }
    parts.push({ text: lineas.join("\n") });
  }
  parts.push({ text: prompt });

  const contents = [{ role: "user" as const, parts }];

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
  modo: z.enum(["imagen", "texto", "ambos", "personalizado"]).optional().default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
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

    // 3) Regenerar imagen — para "personalizado", inyectamos ajuste al prompt visual
    const referenceBase64 = await getFoxRefBase64();
    let slideParaImagen = slide;
    if (body.modo === "personalizado" && body.prompt_personalizado) {
      slideParaImagen = {
        ...slide,
        prompt_visual: `${slide.prompt_visual || ""}. AJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${body.prompt_personalizado}`.trim(),
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
  modo: z.enum(["imagen", "texto", "ambos", "personalizado"]).default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
});

router.post("/community/historias/reintentar", async (req, res) => {
  try {
    const body = ReintentarHistoriaBody.parse(req.body);

    // 1) Regenerar texto si modo lo requiere
    let texto = body.texto_actual || { copy_principal: "", sub_copy: "", cta: "", hashtags: "" };
    if (body.modo === "texto" || body.modo === "ambos" ||
        (body.modo === "personalizado" && !body.texto_actual)) {
      const conceptoExtendido = body.prompt_personalizado && (body.modo === "texto" || body.modo === "ambos")
        ? `${body.concepto}. AJUSTE PEDIDO: ${body.prompt_personalizado}`
        : body.concepto;
      texto = await generarTextoHistoria(body.tipo_historia, conceptoExtendido);
    }

    // 2) Modo "texto" puro: devuelve solo texto, sin imagen
    if (body.modo === "texto") {
      res.json({ success: true, data: { texto, imagen: null } });
      return;
    }

    // 3) Regenerar imagen
    let promptOverride: string | undefined;
    if (body.modo === "personalizado" && body.prompt_personalizado) {
      promptOverride = `Pose y escena con AJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${body.prompt_personalizado}`;
    }
    const prompt = buildHistoriaPrompt(body.tipo_historia, body.concepto, promptOverride);
    const referenceBase64 = await getFoxRefBase64();
    const contents = referenceBase64
      ? [{ role: "user" as const, parts: [
          { inlineData: { data: referenceBase64, mimeType: "image/png" } },
          { text: prompt },
        ] }]
      : [{ role: "user" as const, parts: [{ text: prompt }] }];

    const imageResp = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents,
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const imagePart = imageResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      res.status(502).json({ success: false, error: "Gemini no devolvió imagen" });
      return;
    }
    let imgBase64 = imagePart.inlineData.data as string;
    const mime = imagePart.inlineData.mimeType || "image/png";

    if (body.texto_en_imagen) {
      try { imgBase64 = await renderTextoEnHistoria(imgBase64, texto); } catch (e) { console.error("[Hist reintentar] render:", e); }
    }
    const imagenDataUrl = `data:${body.texto_en_imagen ? "image/png" : mime};base64,${imgBase64}`;
    res.json({ success: true, data: { texto, imagen: imagenDataUrl } });
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
