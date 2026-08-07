import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import sharp from "sharp";
import { db } from "@workspace/db";
import { communityContent } from "@workspace/db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { firstText } from "../../lib/gemini-parts";
import { buildBrandToneSuffix } from "../../lib/brand-tone";
import { PLATFORM_LIMITS, PLATFORM_HASHTAGS } from "../../lib/platform-guides";
import {
  construirOverlayTitular,
  resolverEstiloTitular,
  obtenerEstiloTitular,
  ajustarTextoMedido,
  type ZonaTexto,
} from "../../lib/title-style";
import {
  PALETA_COMMUNITY,
  svgDefs,
  type PaletaComposicion,
  FUENTE_SECUNDARIA,
  bloqueSecundarioSvg,
  escapeXml,
  stripEmojis,
  renderTextoEnHistoria,
} from "../../lib/story-render";
import {
  resolverFormatoHistoria,
  obtenerFormatoHistoria,
  obtenerLayoutHistoria,
  layoutHistoriaPorDefecto,
  arcoParaFrames,
  listarFormatosHistoria,
  type LayoutHistoria,
  type FormatoHistoria,
  type PasoNarrativo,
} from "../../lib/story-formats";
import {
  buildGuionSystemPrompt,
  buildGuionUserPrompt,
  parseGuion,
  revisarGuion,
  recortarLimpio,
  sanearFrameGuion,
  resolverModoCierre,
  type FrameGuion,
  type GuionHistoria,
} from "../../lib/story-script";
import { REGLA_ESPANOL_NEUTRO, neutralizarProfundo } from "../../lib/lenguaje-neutro";
import {
  resolverDireccionDeMarca, listarOpcionesPortada, ID_DIRECCION_MARCA, type DireccionArte,
} from "../../lib/cover-style";
import { PORTADA_POSES, type PoseEntry } from "../../lib/pose-bank";
import { posesCompatibles, textoEncuadre, textoGesto } from "../../lib/set-presets";
import { prepararFotos, type FotosPorRanura } from "../../lib/foto-ranura";
import { buildRedactarIdeaPostPrompt, parseIdeaPost } from "../../lib/redactar-idea-post";
import { planPurga, avisoCaducidad, diasRestantes, DIAS_RETENCION, MAX_BORRADORES } from "../../lib/borradores";
import { puedeVerHistorias } from "../../lib/community-gate";
import {
  listarFormatosInteractivos,
  obtenerFormatoInteractivo,
  buildPromptInteractivo,
  parseContenidoInteractivo,
  titularDe,
  type ContenidoInteractivo,
  type FormatoInteractivo,
} from "../../lib/formatos-interactivos";
import { bloqueInteractivoSvg, zonaInteractiva } from "../../lib/render-interactivo";
import { revisarCarrusel } from "../../lib/carrusel-revision";
import { readFile } from "fs/promises";
import path from "path";

const router: IRouter = Router();

// Modelo real de texto usado por este módulo (vía OpenAI).
const OPENAI_TEXT_MODEL = "gpt-4.1";

// Shim de compatibilidad: emula la forma de la API `messages.create` de
// Anthropic (para no reescribir los call sites), pero SIEMPRE llama a OpenAI
// chat completions con el modelo indicado en `params.model`.
const openaiShim = {
  messages: {
    create: async (params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: { role: "user" | "assistant"; content: string }[];
      temperature?: number;
    }) => {
      const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [];
      if (params.system) msgs.push({ role: "system", content: params.system });
      msgs.push(...params.messages);
      const resp = await ai._openai.chat.completions.create({
        model: params.model,
        messages: msgs,
        max_completion_tokens: params.max_tokens,
      });
      const text = resp.choices[0]?.message?.content ?? "";
      return { content: [{ type: "text" as const, text }] };
    },
  },
};

// userId del usuario autenticado (las rutas /api van detrás de requireAuth).
// Se usa para inyectar el tono de marca configurado en Ajustes.
function getReqUserId(req: { user?: unknown }): number | null {
  const id = (req.user as { id?: number } | undefined)?.id;
  return typeof id === "number" ? id : null;
}

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
// renderizados en las bandas superior (22%) e inferior (25%). Si el modelo ve
// esas referencias con texto, replica texto en su salida y rompe la regla
// "CERO TEXTO" del prompt, así que hay que quitarles las bandas.
//
// Antes se pintaban de azul marino (#0F172A), el fondo de la generación
// anterior. Eso metía un color de la paleta vieja en TODAS las referencias, y
// el modelo lo copiaba: la ilustración salía con el set iluminado nuevo en el
// centro y dos franjas azules pegadas arriba y abajo — dos estilos en la misma
// imagen. Ahora las bandas se RECORTAN: la referencia pasa a ser solo la
// ilustración central, que es lo único que tiene que enseñar (anatomía, líneas,
// colores planos del personaje). Dónde van las zonas reservadas ya lo dice el
// prompt en píxeles; no hace falta enseñárselo con una banda de color.
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
    const topBand = Math.floor(h * 0.22);
    const bottomBand = Math.floor(h * 0.25);
    const alto = h - topBand - bottomBand;
    if (w > 0 && alto > 0) {
      buf = await sharp(raw)
        .extract({ left: 0, top: topBand, width: w, height: alto })
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

// ============================================
// ASPECTO EXACTO DE LAS IMÁGENES
// gpt-image-1 (el backend real detrás del adaptador) solo soporta 1024x1024,
// 1024x1536 y 1536x1024. Pedimos el tamaño soportado más cercano al aspecto
// prometido por la UI (1:1, 4:5 o 9:16) y luego recortamos SIEMPRE con sharp
// al aspecto exacto — antes todo salía 1024x1536 y el resize solo se aplicaba
// cuando "texto en imagen" estaba activo.
// ============================================
const FORMATO_DIMS = {
  "1:1": { width: 1080, height: 1080, apiSize: "1024x1024" },
  "4:5": { width: 1080, height: 1350, apiSize: "1024x1536" },
  "9:16": { width: 1080, height: 1920, apiSize: "1024x1536" },
} as const;
type FormatoImagen = keyof typeof FORMATO_DIMS;

async function ajustarAspectoExacto(base64: string, formato: FormatoImagen): Promise<string> {
  const { width, height } = FORMATO_DIMS[formato];
  const buf = await sharp(Buffer.from(base64, "base64"))
    .resize(width, height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  return buf.toString("base64");
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

// ============================================
// TÍTULOS CON EL MOTOR DE TIPOGRAFÍA DE IMPACTO
// El mismo motor del generador de portadas (title-style: métricas reales por
// carácter, contorno/sombra/extrusión/neón/degradado) renderiza el TÍTULO de
// historias y slides como capa full-canvas que se composita aparte. El resto
// del texto (sub-copy, CTA, hashtags) conserva su render Inter original.
// ============================================
/** Resuelve el estilo del título para UNA generación: id pedido y validado, o
 *  rotación automática de los estilos impactantes. Una historia en serie o un
 *  carrusel completo usan el MISMO estilo en todos sus frames/slides. */
function resolverEstiloTitulo(estiloId?: string | null): string {
  if (estiloId) {
    const e = obtenerEstiloTitular(estiloId);
    if (e) return e.id;
  }
  return resolverEstiloTitular().id;
}

/** Capa SVG full-canvas con el título en tipografía de impacto. */
function overlayTituloImpacto(
  titulo: string,
  canvas: { width: number; height: number },
  zona: ZonaTexto,
  estiloId: string,
  paleta: PaletaComposicion = PALETA_COMMUNITY,
): Buffer {
  const estilo = obtenerEstiloTitular(estiloId) ?? resolverEstiloTitular();
  return construirOverlayTitular({
    canvas,
    zona,
    scrim: "ninguno", // los gradientes topfade/botfade existentes hacen de scrim
    titulo,
    estilo,
    paleta,
  });
}

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

    const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
    const response = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
      max_tokens: 200,
      temperature: 1,
      system: SORPRENDEME_SYSTEM + toneSuffix,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    let tema = block && block.type === "text" ? block.text.trim() : "";
    tema = tema.replace(/^["'`]+|["'`]+$/g, "").replace(/^[-*•]\s*/, "").trim();
    // si el modelo devolvió varias líneas, quédate con la primera no vacía
    tema = tema.split(/\n+/).map((s: string) => s.trim()).filter(Boolean)[0] || tema;
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

export function buildHistoriaPrompt(
  tipoHistoria: string,
  concepto: string,
  opts: {
    /** Dirección visual de ESTE frame, escrita por el guionista. */
    promptVisual?: string;
    /** Layout del frame: define qué franjas deben quedar despejadas. */
    layout: LayoutHistoria;
    /**
     * Set del estudio: EL MISMO objeto que usan Portadas y Posts IA.
     *
     * Historias tenía su propio fondo plano ("espacio abstracto" con halo
     * radial) mientras las portadas usaban un set fotográfico con luz
     * cinematográfica: por eso se veían de otra generación. Y después, cuando
     * la luz sí se unificó, seguía sin haber pose, utilería ni estilo extra
     * — o sea que el mismo concepto salía distinto según la sección.
     */
    set: SetEstudio;
    frame?: FrameContext;
    /** Ajuste libre del usuario (reintentos). */
    poseOverride?: string;
    /** Hilo conductor de la serie, para que la escena no se salga del relato. */
    hilo?: string;
  },
): string {
  const { set } = opts;
  const direccion = set.direccion;
  const { categoria, pose: poseElegida } = elegirCategoriaPose(concepto, tipoHistoria);
  // La dirección del guion manda; la pose del banco es solo respaldo.
  const direccionEscena = opts.poseOverride || opts.promptVisual || poseElegida;
  // Pose elegida a mano: manda sobre la del guion y sobre la del banco, igual
  // que en Posts IA. Es la misma lista de poses en las tres secciones.
  // El gesto va después de la pose y manda sobre ella: la pose describe el
  // cuerpo y suele arrastrar una expresión, así que si el usuario pidió otra
  // cara hay que decir cuál gana o el modelo se queda con la de la pose.
  const bloquePose = [
    set.pose
      ? `\n- POSE OBLIGATORIA del zorro, elegida por el usuario (tiene prioridad sobre la escena descrita arriba): ${set.pose.descripcion}`
      : "",
    set.gesto ? `\n- EXPRESIÓN OBLIGATORIA de la cara (manda sobre la que sugiera la pose): ${set.gesto}` : "",
    set.encuadre ? `\n- ENCUADRE OBLIGATORIO de cámara (manda sobre el que sugiera la pose): ${set.encuadre}` : "",
  ].join("");
  const bloqueUtileria = set.utileria?.trim()
    ? `\n\nUTILERÍA PEDIDA POR EL USUARIO: "${set.utileria.trim()}".
Dibújala como OBJETOS FÍSICOS REALES apoyados en el set, con volumen y sombra propia, iluminados por la misma luz de la dirección de arte. NUNCA stickers, iconos planos ni elementos flotantes. Cuenta dentro del máximo de 2 objetos.`
    : "";
  const bloqueEstiloExtra = set.estiloExtra?.trim()
    ? `\n\nTOQUE DE ESTILO PEDIDO POR EL USUARIO: "${set.estiloExtra.trim()}". Aplícalo al ambiente y al color del set SIN romper ninguna regla del personaje.`
    : "";
  const { layout } = opts;
  const escena = layout.zonaEscena;

  const frameRoleHeader = opts.frame && opts.frame.total > 1
    ? `\nEste frame es el ${opts.frame.numero} de ${opts.frame.total} de una SERIE conectada${opts.hilo ? ` que cuenta: "${opts.hilo}"` : ""}. Los frames deben verse como un SET: mismo gradiente de fondo, mismo halo naranja y mismas partículas. Lo único que cambia entre frames es la POSE/EXPRESIÓN del zorro y los OBJETOS de apoyo.\n`
    : "";

  const zonasTexto = layout.zonasDespejadas
    .map(z => `  · de y=${z.desde} a y=${z.hasta}`)
    .join("\n");

  return `Genera una ilustración VERTICAL en formato 9:16 (1080x1920 píxeles) para una HISTORIA de red social de WebMakerLatam (agencia digital para emprendedores y pymes en LATAM).
${frameRoleHeader}
REGLA ABSOLUTA - SIN TEXTO:
NO incluyas NINGUNA letra, palabra, número, rótulo, etiqueta, título, cartel, ni texto en pantallas/objetos. CERO caracteres alfanuméricos. Pantallas/monitores muestran formas abstractas de colores, NUNCA texto. Esta regla no tiene excepciones.

${FOX_BRAND_SPEC}

REGLAS ADICIONALES PARA ESTA HISTORIA:
- Cuerpo completo SIEMPRE visible (cabeza, torso, brazos, piernas, cola). Nunca cortado por los bordes ni recortado.
- El zorro es el PROTAGONISTA ABSOLUTO. Ocupa el centro de la zona de imagen.
- ESCENA DE ESTE FRAME (categoría narrativa "${categoria}"): ${direccionEscena}${bloquePose}
- POSICIÓN VERTICAL EXACTA Y NO NEGOCIABLE: la cabeza del zorro debe empezar DESPUÉS del píxel y=${escena.desde} y sus PIES deben terminar ANTES del píxel y=${escena.hasta}. Todo el zorro vive ESTRICTAMENTE entre y=${escena.desde} y y=${escena.hasta} (${escena.hasta - escena.desde} px de altura). Si tu zorro queda demasiado grande, RECÓRTALO: mejor un zorro mediano bien centrado que uno grande que invada las zonas reservadas.
- RESPIRACIÓN: el zorro debe tener al menos 100 px de aire vacío por TODOS sus lados. Nada lo toca.

CONTENIDO Y CONTEXTO:
TIPO de historia: "${tipoHistoria}"
CONCEPTO/TEMA: "${concepto}"

OBJETOS DE LA ESCENA (REGLAS ESTRICTAS - "MENOS ES MÁS"):
- MÁXIMO ABSOLUTO: 2 objetos de apoyo (no 3, no más). En historias el zorro es el rey.
- Los objetos salen de la escena descrita arriba: son props concretos del relato, no iconos decorativos sueltos.
- POSICIÓN DE LOS OBJETOS: a los LADOS del zorro (izquierda y/o derecha), a su altura, NUNCA detrás de él, NUNCA invadiendo las zonas reservadas.
- Los objetos PUEDEN ser señalados/sostenidos por el zorro, pero su silueta debe verse completa y separada del zorro.
- PROHIBIDO: amontonar iconos, llenar el fondo de elementos, hacer un collage. Si dudas, elimina objetos.

ZONAS RESERVADAS PARA TEXTO OVERLAY (CRÍTICO - NO NEGOCIABLE):
${zonasTexto}
- Esas franjas deben quedar SIN elementos sólidos: ahí se monta el texto después.
- "Reservada" significa VACÍA DE OBJETOS, NO de otro color. Esas franjas son el MISMO set siguiendo: la misma pared, la misma atmósfera, la misma caída de luz, solo que más oscuras y vacías. NUNCA una banda plana, NUNCA un bloque de otro color, NUNCA azul marino ni azul oscuro. El lienzo entero tiene que leerse como UNA sola foto de UN solo set, de borde a borde.
- Toda la acción visual (zorro + 1-2 objetos) va ESTRICTAMENTE entre y=${escena.desde} y y=${escena.hasta}.
- NADA puede invadir las zonas reservadas: ni el zorro, ni sus pies, ni objetos, ni sombras, ni el glow del fondo.

VALIDACIÓN FINAL ANTES DE ENTREGAR LA IMAGEN — verifica MENTALMENTE:
1. ¿El zorro está 100% IDÉNTICO a la referencia (ojos pequeños, nariz negra, pelaje plano #E86A30, sin estilo Disney/Pixar)?
2. ¿Hay un máximo de 2 objetos de apoyo y están a los lados, NUNCA detrás del zorro?
3. ¿Las franjas reservadas quedaron LIMPIAS y con el MISMO fondo del set (sin bandas planas ni azul marino)?
4. ¿El zorro tiene 100+ px de aire alrededor y vive entre y=${escena.desde} y y=${escena.hasta}?
Si respondes NO a cualquiera, REGENERA mentalmente antes de devolver la imagen.

CONTRASTE DE ESTILOS (la firma visual de la marca):
- SOLO el ZORRO se dibuja en estilo FLAT CARTOON: contornos gruesos negros, colores planos y vibrantes, sin degradados.
- El FONDO y la UTILERÍA pertenecen al mundo del set: iluminación cinematográfica, volumen y sombreado suave, SIN contornos gruesos de cartoon en los objetos.
- La mascota cartoon parada dentro de un set fotográfico estilizado con props reales: ESE es el look.

DIRECCIÓN DE ARTE DEL FONDO — "${direccion.nombre}" (solo el fondo, NO el personaje; toda mención a "franja superior" aplícala a las zonas reservadas de arriba):
${direccion.fondo}

UTILERÍA — PALETA Y COMPORTAMIENTO BAJO LA LUZ:
${direccion.paletaObjetos}${bloqueUtileria}${bloqueEstiloExtra}

PROHIBIDO EN EL FONDO:
✗ Línea de horizonte que divida la imagen en cielo y suelo
✗ Bandas, stripes o resplandores en forma de barra cruzando la imagen
✗ Aclarar las franjas reservadas: ahí va el texto y tiene que leerse
✗ Azul marino o azul oscuro en cualquier parte: es la paleta de la generación anterior
✗ Un bloque de color plano arriba o abajo: el fondo es continuo de borde a borde

RECUERDA: CERO TEXTO. Ni una sola letra o número en NINGUNA parte.`;
}

/* ==================== Guion completo de la serie ========================= */

/**
 * Genera el GUION de toda la serie en UNA sola llamada: mismo protagonista,
 * mismas cifras, progresión real entre frames. Si el guion vuelve con
 * problemas de calidad (titulares repetidos, cifras vacías), se pide una
 * segunda pasada indicándole exactamente qué corregir.
 */
async function generarGuionHistoria(args: {
  tipoHistoria: string;
  concepto: string;
  formato: FormatoHistoria;
  arco: PasoNarrativo[];
  toneSuffix?: string;
  ajuste?: string | null;
}): Promise<GuionHistoria> {
  // El modo de cierre lo elige el servidor con rotación: así la serie no
  // termina siempre igual (y 1 de cada 3 no pide nada).
  const modoCierre = resolverModoCierre(args.tipoHistoria);
  const opts = {
    tipoHistoria: args.tipoHistoria,
    concepto: args.concepto,
    formato: args.formato,
    arco: args.arco,
    ajuste: args.ajuste ?? null,
    catalogoServicios: CATALOGO_SERVICIOS,
    reglaIdioma: REGLA_ESPANOL_NEUTRO,
    modoCierre,
  };
  const system = buildGuionSystemPrompt(opts) + (args.toneSuffix || "");
  const user = buildGuionUserPrompt(opts);

  const pedir = async (extra?: string): Promise<GuionHistoria | null> => {
    const resp = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
      max_tokens: 2600,
      system,
      messages: [{ role: "user", content: extra ? `${user}\n\n${extra}` : user }],
    });
    const block = resp.content[0];
    const raw = block && block.type === "text" ? block.text : "";
    return parseGuion(raw, args.arco, args.formato.id);
  };

  let guion = await pedir();
  if (guion) {
    const issues = revisarGuion(guion, args.arco);
    if (issues.length > 0) {
      console.log(`[Historias] guion con observaciones, segunda pasada: ${issues.join("; ")}`);
      try {
        const mejor = await pedir(
          `Tu intento anterior tuvo estos problemas: ${issues.join("; ")}. Reescribe el JSON COMPLETO corrigiéndolos, respetando el arco, los límites de longitud y el hilo conductor.`,
        );
        if (mejor && revisarGuion(mejor, args.arco).length < issues.length) guion = mejor;
      } catch (e) {
        console.warn(`[Historias] segunda pasada del guion falló: ${(e as Error).message}`);
      }
    }
  }

  if (!guion) {
    // Fallback mínimo: la serie sale con el tema como titular en vez de romper.
    console.warn("[Historias] el modelo no devolvió un guion parseable; uso fallback");
    guion = {
      hilo: args.concepto,
      protagonista: "",
      formatoId: args.formato.id,
      frames: args.arco.map((paso, i) => ({
        numero: i + 1,
        paso: paso.paso,
        layoutId: paso.layoutId,
        copy_principal: args.concepto.slice(0, 44),
        sub_copy: "",
        dato: "",
        dato_label: "",
        cta: i === args.arco.length - 1 ? "Cuéntanos tu caso" : "",
        hashtags: i === args.arco.length - 1 ? "#WebMakerLatam #PymesLatam #NegociosOnline" : "",
        prompt_visual: "",
      })),
    };
  }
  console.log(`[Historias] Guion "${args.formato.id}" (${args.arco.length} frames) · cierre: ${modoCierre.id} · hilo: ${guion.hilo.slice(0, 80)}`);
  return guion;
}

// El texto de las historias ya NO se genera frame por frame: lo escribe el
// guion completo (lib/story-script). Aquí solo quedan los helpers de imagen.

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
  const resp = await openaiShim.messages.create({
    model: OPENAI_TEXT_MODEL,
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
  /** Guion de ESTE frame (texto + dirección visual). */
  frameGuion: FrameGuion;
  layout: LayoutHistoria;
  /** Set del estudio: el MISMO para todos los frames de la serie. */
  set: SetEstudio;
  hilo?: string;
  poseOverride?: string;
  promptOverride?: string;
  textoEnImagen: boolean;
  referenceBase64: string | null;
  numero: number;
  total: number;
  estiloTitular?: string;
  /**
   * Relación final de la pieza. 9:16 por defecto — Historias no cambia.
   *
   * Antes esto no existía y TODO se generaba y componía a 9:16, así que una
   * pieza de feed se recortaba después: el titular ya estaba dibujado dentro y
   * el recorte se llevaba el 30 % del alto en 4:5 y el 44 % en 1:1. Por eso "en
   * Historias funciona y en el feed no".
   */
  relacion?: FormatoImagen;
}): Promise<{
  numero_frame: number;
  total_frames: number;
  rol: string;
  layout: string;
  imagen: string; // data url
  texto: { copy_principal: string; sub_copy: string; cta: string; hashtags: string };
  guion: FrameGuion;
}> {
  const relacion: FormatoImagen = args.relacion ?? "9:16";
  const frameCtx: FrameContext | undefined = args.total > 1
    ? { numero: args.numero, total: args.total, rol: (args.frameGuion.paso as RolFrame) }
    : undefined;
  const basePrompt = buildHistoriaPrompt(args.tipoHistoria, args.concepto, {
    promptVisual: args.frameGuion.prompt_visual,
    layout: args.layout,
    set: args.set,
    frame: frameCtx,
    poseOverride: args.poseOverride,
    hilo: args.hilo,
  });
  const finalPrompt = args.promptOverride
    ? `${basePrompt}\n\nAJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${args.promptOverride}`
    : basePrompt;
  const contents = args.referenceBase64
    ? [{ role: "user" as const, parts: [
        { text: args.set.referenciaPropia
          ? "REFERENCE IMAGE 1 (character reference chosen by the user — replicate THIS character, not the brand fox):"
          : "REFERENCE IMAGE 1 (PRIMARY CANON — replicate this character EXACTLY: outline weight, fur color saturation, glasses shape, eye size, body proportions, muzzle length):" },
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
        // El lienzo que se le pide al modelo es el más cercano a la relación
        // final: para 1:1 existe 1024x1024, y generarlo en 2:3 para recortarlo
        // después tiraba un tercio de la ilustración que el modelo compuso.
        config: { ...GEMINI_IMAGE_BASE_CONFIG, imageSize: FORMATO_DIMS[relacion].apiSize },
      });
      const finalImg = extractFinalImage(resp);
      if (!finalImg) throw new Error("Gemini no devolvió imagen final");
      // Un solo recorte, al aspecto final. El texto se dibuja después, ya sobre
      // el lienzo bueno, así que no hay un segundo recorte que se lo lleve.
      imgBase64 = await ajustarAspectoExacto(finalImg.data, relacion);
      mime = "image/png";
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

  let outBase64 = imgBase64;
  if (args.textoEnImagen) {
    try {
      outBase64 = await renderTextoEnHistoria(imgBase64, args.frameGuion, args.layout, {
        frameInfo: args.total > 1 ? { numero: args.numero, total: args.total } : undefined,
        estiloTitularId: args.estiloTitular,
        paleta: paletaDe(args.set.direccion),
        lienzo: { width: FORMATO_DIMS[relacion].width, height: FORMATO_DIMS[relacion].height },
      });
    } catch (e) {
      console.error("[Historia frame] render texto fallo:", e);
    }
  }
  const imagenDataUrl = `data:${args.textoEnImagen ? "image/png" : mime};base64,${outBase64}`;
  return {
    numero_frame: args.numero,
    total_frames: args.total,
    rol: args.frameGuion.paso,
    layout: args.layout.id,
    imagen: imagenDataUrl,
    texto: {
      copy_principal: args.frameGuion.copy_principal,
      sub_copy: args.frameGuion.sub_copy,
      cta: args.frameGuion.cta,
      hashtags: args.frameGuion.hashtags,
    },
    guion: args.frameGuion,
  };
}

/**
 * Personalización del personaje, idéntica en las cinco rutas que la aceptan.
 *
 * Estaba copiada campo a campo en cada esquema, y así fue como Historias se
 * quedó sin pose y sin utilería mientras Posts IA ya las tenía: añadir una
 * opción obligaba a acordarse de cinco sitios. Declarada una vez, aparece en
 * todas a la vez o en ninguna.
 */
const CAMPOS_PERSONAJE = {
  /** Pose fijada del zorro (id de PORTADA_POSES); vacío = la decide el rol. */
  pose_id: z.string().max(40).optional(),
  /** Expresión de la cara (id de GESTOS_WEBI); manda sobre la que sugiere la pose. */
  gesto_id: z.string().max(40).optional(),
  /** Encuadre de cámara (id de ENCUADRES). */
  encuadre_id: z.string().max(40).optional(),
  utileria: z.string().max(300).optional(),
  estilo_extra: z.string().max(300).optional(),
} as const;

// Render del texto sobre una historia 9:16 según el LAYOUT del frame.
//
// El layout (story-formats) define qué bloques se dibujan y dónde: hay frames
// que solo llevan titular, otros que llevan una cifra gigante y solo el frame
// de cierre lleva botón de invitación y hashtags. Antes se pintaban los cuatro
// bloques siempre, en todos los frames — eso era lo que se sentía a plantilla.
const GenerarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  pose_override: z.string().optional(),
  // Por defecto SÍ: componer el texto con el motor de tipografía es el
  // estándar de la marca. El default en false hacía que cualquier llamada que
  // omitiera el campo devolviera la imagen limpia, sin el estilo nuevo.
  texto_en_imagen: z.boolean().optional().default(true),
  formato: z.enum(["unica", "serie"]).optional().default("unica"),
  cantidad_frames: z.number().int().min(2).max(5).optional(),
  /** Estilo tipográfico del titular (id de ESTILOS_TITULAR); vacío = rotación. */
  estilo_titular: z.string().max(40).optional(),
  /** Formato narrativo (id de FORMATOS_HISTORIA); vacío = rotación automática. */
  formato_narrativo: z.string().max(40).optional(),
  /** Idea en bruto del usuario: contexto extra para el guion. */
  idea: z.string().max(2000).optional(),
  // Personalización del set — los MISMOS campos que Portadas y Posts IA.
  /** Iluminación: id de DIRECCIONES_PORTADA, `"auto"` para rotar, vacío = ámbar. */
  direccion_id: z.string().max(40).optional(),
  /** Pose fijada del zorro (id de PORTADA_POSES); vacío = la decide el guion. */
  ...CAMPOS_PERSONAJE,
  /** Referencia de personaje propia en base64 (sin prefijo data:); vacío = Webi. */
  imagen_referencia_base64: z.string().max(12_000_000).optional(),
});

router.post("/community/historias/generar", async (req, res) => {
  try {
    const body = GenerarHistoriaBody.parse(req.body);
    const referenciaPropia = (body.imagen_referencia_base64 ?? "").trim();
    const referenceBase64 = referenciaPropia || (await getFoxRefBase64());
    const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
    // Un estilo tipográfico por historia: todos los frames comparten diseño.
    const estiloTitular = resolverEstiloTitulo(body.estilo_titular);
    // Y UN solo set (luz, pose, utilería, estilo) para toda la serie: si cada
    // frame resolviera el suyo, dejaría de verse como un set. Por defecto, el
    // spotlight ámbar de la marca — no una de las 8 al azar.
    const setEstudio = resolverSetEstudio(body, referenciaPropia.length > 0);
    // Lo que se guarda y se devuelve: el reintento de un frame tiene que poder
    // reproducir EXACTAMENTE el mismo set o desentona con el resto de la serie.
    const setUsado = {
      direccion_id: setEstudio.direccion.id,
      pose_id: setEstudio.pose?.id ?? null,
      utileria: setEstudio.utileria,
      estilo_extra: setEstudio.estiloExtra,
    };

    // Formato narrativo + arco: definen QUÉ cuenta cada frame.
    const totalPedido = body.formato === "serie" ? (body.cantidad_frames || 3) : 1;
    const formatoNarrativo = resolverFormatoHistoria(body.formato_narrativo, body.tipo_historia);
    const arco = arcoParaFrames(formatoNarrativo, totalPedido);
    const total = arco.length;

    // UNA sola llamada escribe el guion completo: de aquí sale la coherencia.
    const guion = await generarGuionHistoria({
      tipoHistoria: body.tipo_historia,
      concepto: body.concepto,
      formato: formatoNarrativo,
      arco,
      toneSuffix,
      // La idea en bruto es contexto: dice qué mostrar y con qué emoción. Sin
      // ella el guion solo tenía el concepto de una línea para trabajar.
      ajuste: [body.idea?.trim(), body.pose_override?.trim()].filter(Boolean).join(". ") || null,
    });

    // Las imágenes sí se generan en paralelo: ya comparten guion e hilo.
    const settled = await Promise.allSettled(
      guion.frames.map((frameGuion, i) => generarFrameHistoria({
        tipoHistoria: body.tipo_historia,
        concepto: body.concepto,
        frameGuion,
        layout: obtenerLayoutHistoria(frameGuion.layoutId) ?? layoutHistoriaPorDefecto(),
        set: setEstudio,
        hilo: guion.hilo,
        poseOverride: body.pose_override,
        textoEnImagen: body.texto_en_imagen,
        referenceBase64,
        numero: i + 1,
        total,
        estiloTitular,
      })),
    );

    const frames = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[Historias] frame ${i + 1} falló:`, (r.reason as Error)?.message);
      const g = guion.frames[i]!;
      return {
        numero_frame: i + 1, total_frames: total, rol: g.paso, layout: g.layoutId,
        imagen: "",
        texto: { copy_principal: g.copy_principal, sub_copy: g.sub_copy, cta: g.cta, hashtags: g.hashtags },
        guion: g,
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
    // Miniatura para la tira de borradores: la lista NO puede viajar con las
    // imágenes completas (son decenas de megas por petición).
    const thumb = await miniatura(primerImg);

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
        estilo_titular: estiloTitular,
        formato_narrativo: formatoNarrativo.id,
        idea: body.idea?.trim() || undefined,
        set: setUsado,
        thumb,
        // Las piezas COMPLETAS, no solo la primera: sin esto una serie de 5
        // frames se guardaba con 1 y las otras 4 se perdían al generar.
        piezas: await Promise.all(
          frames.map(async (f) => ({
            numero: f.numero_frame,
            rol: f.rol,
            layout: f.layout,
            texto: f.texto,
            guion: f.guion,
            imagen: await comprimirParaBorrador(f.imagen),
          })),
        ),
        hilo: guion.hilo,
        protagonista: guion.protagonista,
        frames,
        // Compat con vista de historial: el primer frame se expone también plano
        texto: frames[0]?.texto,
      },
      imageUrl: primerImg,
    }).returning();

    // Barrido oportunista: limpiar al guardar evita depender de un cron.
    void purgarBorradores("historia");

    res.json({
      success: true,
      data: {
        id: row!.id,
        formato: body.formato,
        tipo_historia: body.tipo_historia,
        concepto: body.concepto,
        texto_en_imagen: body.texto_en_imagen,
        estilo_titular: estiloTitular,
        formato_narrativo: formatoNarrativo.id,
        formato_narrativo_nombre: formatoNarrativo.nombre,
        set: setUsado,
        hilo: guion.hilo,
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

// Catálogo de formatos narrativos para la UI.
router.get("/community/historias/formatos", (_req, res) => {
  res.json({ success: true, data: listarFormatosHistoria() });
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
   - TWITTER mantiene su límite de ${PLATFORM_LIMITS.x} caracteres: si no caben los N puntos enteros, lista los títulos cortos numerados (ej: "1) Web lenta 2) Sin móvil 3) Sin CTA 4) Sin chat 5) Sin SEO") + CTA + hashtags.
   - Cierra siempre con pregunta/CTA después de la lista.
3. Tono cercano, latino, accesible, sin cringe
4. SIEMPRE pregunta o CTA al final para generar comentarios
5. Emojis con moderación (0-3, salvo numéricos 1️⃣2️⃣3️⃣ permitidos en listas)
6. Habla de "tú"
7. Conecta con servicios de la agencia cuando sea natural

ESTRUCTURA POR RED:
📱 TIKTOK: hook + 1-2 líneas + CTA + ${PLATFORM_HASHTAGS.tiktok} hashtags (mezcla nicho+trending+marca)
📸 INSTAGRAM: hook emocional + 3-4 líneas con valor/storytelling + pregunta + ${PLATFORM_HASHTAGS.instagram} hashtags
▶️ YOUTUBE SHORTS: keyword en línea 1 + descripción clara + CTA + ${PLATFORM_HASHTAGS.youtube_shorts} hashtags (#shorts obligatorio)
🐦 X/TWITTER: MÁX ${PLATFORM_LIMITS.x} caracteres totales incluyendo hashtags. Hook punzante + insight + ${PLATFORM_HASHTAGS.x} hashtags

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

/**
 * Convierte la respuesta cruda del modelo en el plan de slides.
 *
 * Está fuera del handler porque lo usan las DOS pasadas de generación, y una
 * copia del mapeo se desincroniza en cuanto se toca un límite.
 */
function mapearSlides(data: any, cantidad: number, tema: string): SlidePlan[] {
  const rolPorIndice = (i: number): SlideRol =>
    cantidad === 1 ? "unica" : i === 0 ? "portada" : i === cantidad - 1 ? "cta" : "desarrollo";
  if (Array.isArray(data?.slides) && data.slides.length > 0) {
    return data.slides.slice(0, cantidad).map((s: any, i: number): SlidePlan => ({
      numero: s.numero || i + 1,
      rol: (s.rol as SlideRol) || rolPorIndice(i),
      // Recorte por palabra, igual que en historias: `.slice()` partía la
      // última palabra a media letra y esa era la causa del texto cortado.
      titulo: recortarLimpio(String(s.titulo || ""), 70),
      subtitulo: recortarLimpio(String(s.subtitulo || ""), 110),
      prompt_visual: s.prompt_visual ? recortarLimpio(String(s.prompt_visual), 280) : undefined,
    }));
  }
  return Array.from({ length: cantidad }, (_, i): SlidePlan => ({
    numero: i + 1,
    rol: rolPorIndice(i),
    titulo: recortarLimpio(tema, 70),
    subtitulo: "",
  }));
}

const GenerarDescripcionesBody = z.object({
  tema: z.string().min(1).max(300),
  tipo_contenido: z.string().min(1),
  redes: z.array(z.enum(["tiktok", "instagram", "youtube_shorts", "twitter"])).min(1),
  tipo_publicacion: z.enum(["unica", "carrusel"]).default("unica"),
  cantidad_slides: z.number().int().min(1).max(10).default(1),
  // Por defecto SÍ: componer el texto con el motor de tipografía es el
  // estándar de la marca. El default en false hacía que cualquier llamada que
  // omitiera el campo devolviera la imagen limpia, sin el estilo nuevo.
  texto_en_imagen: z.boolean().optional().default(true),
  /** Estilo tipográfico del título (id de ESTILOS_TITULAR); vacío = rotación. */
  estilo_titular: z.string().max(40).optional(),
  /** Idea en bruto del usuario: contexto extra para el guion del carrusel. */
  idea: z.string().max(2000).optional(),
  // Personalización del set, igual que en Portadas.
  /** Iluminación: id de DIRECCIONES_PORTADA, `"auto"` para rotar, vacío = ámbar. */
  direccion_id: z.string().max(40).optional(),
  /** Pose fijada del zorro (id de PORTADA_POSES); vacío = la decide el rol. */
  ...CAMPOS_PERSONAJE,
  /** Referencia de personaje propia en base64 (sin prefijo data:); vacío = Webi. */
  imagen_referencia_base64: z.string().max(12_000_000).optional(),
});

/**
 * Paleta de composición de una dirección de arte.
 *
 * El texto se monta encima de la ilustración, así que su scrim y su acento
 * tienen que salir de la MISMA luz con la que se generó el fondo. Si no, las
 * franjas de arriba y abajo quedan de otro color y la pieza se ve pegada de
 * dos generaciones distintas.
 */
function paletaDe(direccion: DireccionArte): PaletaComposicion {
  return { colorAcento: direccion.titular.colorAcento, scrim: direccion.titular.scrim };
}

/** Set pedido por la UI → set resuelto que entiende el generador. */
export function resolverSetEstudio(body: {
  direccion_id?: string;
  pose_id?: string;
  gesto_id?: string;
  encuadre_id?: string;
  utileria?: string;
  estilo_extra?: string;
}, referenciaPropia = false): SetEstudio {
  // Con un encuadre cerrado no cabe cualquier pose. Si no se fijó ninguna, se
  // elige dentro de las que sí caben; si se fijó, manda la elección explícita.
  const compatibles = posesCompatibles(body.encuadre_id);
  const poseFijada = body.pose_id ? PORTADA_POSES.find((p) => p.id === body.pose_id) ?? null : null;
  const pose = poseFijada
    ?? (compatibles ? PORTADA_POSES.find((p) => compatibles.includes(p.id)) ?? null : null);
  return {
    direccion: resolverDireccionDeMarca(body.direccion_id),
    pose,
    gesto: textoGesto(body.gesto_id),
    encuadre: textoEncuadre(body.encuadre_id),
    utileria: body.utileria?.trim() || null,
    estiloExtra: body.estilo_extra?.trim() || null,
    referenciaPropia,
  };
}

type SlideRol = "portada" | "desarrollo" | "cta" | "unica";
interface SlidePlan {
  numero: number;
  rol: SlideRol;
  titulo: string;
  subtitulo: string;
  prompt_visual?: string;
}

/**
 * Personalización del set: el MISMO objeto en Portadas, Posts IA e Historias.
 *
 * Es lo que garantiza que las tres secciones generen con el mismo estándar. Va
 * como objeto y no como cinco parámetros sueltos porque atraviesa cuatro
 * funciones encadenadas: sumarlos uno a uno era pedir un error de orden.
 */
interface SetEstudio {
  /**
   * Iluminación del set, la MISMA que usan las portadas. El carrusel tenía su
   * propio fondo plano (gradiente radial + halo) mientras las portadas usaban
   * un set con luz cinematográfica: por eso se veía de otra generación.
   */
  direccion: DireccionArte;
  /** Pose fijada por el usuario; vacío = la decide el rol de la slide. */
  pose?: PoseEntry | null;
  /** Expresión de la cara, ya resuelta a texto de prompt. */
  gesto?: string | null;
  /** Encuadre de cámara, ya resuelto a texto de prompt. */
  encuadre?: string | null;
  /** Utilería pedida: se dibuja como props físicos del set, nunca stickers. */
  utileria?: string | null;
  /** Toque de estilo extra en palabras del usuario. */
  estiloExtra?: string | null;
  /** true si la referencia del personaje la subió el usuario (no es Webi). */
  referenciaPropia?: boolean;
}

export function buildSlidePrompt(
  tema: string,
  tipoContenido: string,
  slide: SlidePlan,
  formato: "1:1" | "4:5",
  totalSlides: number,
  set: SetEstudio,
): string {
  const direccion = set.direccion;
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

  // Pose fijada por el usuario: manda sobre la que sugiere el rol de la slide.
  // El gesto y el encuadre van en el mismo bloque y por debajo de la pose,
  // porque una pose arrastra su propia expresión y su propio plano: si el
  // usuario pidió otros, hay que decir explícitamente cuál gana.
  const lineasPersonaje = [
    set.pose
      ? `POSE OBLIGATORIA del personaje, elegida por el usuario — tiene prioridad sobre cualquier pose sugerida por el rol de la slide:\n${set.pose.descripcion}`
      : "",
    set.gesto ? `EXPRESIÓN OBLIGATORIA de la cara — manda sobre la que sugiera la pose:\n${set.gesto}` : "",
    set.encuadre ? `ENCUADRE OBLIGATORIO de cámara — manda sobre el que sugiera la pose:\n${set.encuadre}` : "",
  ].filter(Boolean);
  const bloquePose = lineasPersonaje.length
    ? `\n\n<forced_pose>\n${lineasPersonaje.join("\n\n")}\n</forced_pose>`
    : "";

  // Utilería: props REALES del set, no calcomanías pegadas. Es la misma regla
  // que hace que las portadas se vean fotográficas y el carrusel no lo estaba.
  const bloqueUtileria = set.utileria?.trim()
    ? `\n\n<requested_props>
El usuario pidió esta utilería en el set: "${set.utileria.trim()}".
Dibújala como OBJETOS FÍSICOS REALES apoyados en la superficie del set, con volumen y sombra propia, iluminados por la misma luz de la dirección de arte. NUNCA como stickers, iconos planos ni elementos flotantes. Cuentan dentro del máximo de 2-3 objetos de la escena.
</requested_props>`
    : "";

  const bloqueEstiloExtra = set.estiloExtra?.trim()
    ? `\n\n<extra_style_note>
Matiz de estilo pedido por el usuario: "${set.estiloExtra.trim()}". Aplícalo al ambiente y al color del set SIN romper ninguna de las reglas del personaje.
</extra_style_note>`
    : "";

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
- They were CROPPED to show ONLY the central illustration. They are references for the CHARACTER: outline weight, flat colors, anatomy, proportions. They are NOT references for the background, the lighting or the palette — those come exclusively from the art-direction block below.
- Do NOT copy any background colour from the references. In particular, do NOT paint dark navy / dark blue anywhere. If a reference looks flat or bluish, ignore it: the background of YOUR image is the lit studio set described in the art-direction block.
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
- Reserved TOP zone — 22% (1:1 → 0-220px / 4:5 → 0-280px): no character parts, no objects, no shadows. Reserved for text overlay.
- Reserved BOTTOM zone — 25% (1:1 → 880-1080px / 4:5 → 1050-1350px): no character parts, no objects, no shadows. Reserved for text overlay.
- "Reserved" means EMPTY OF OBJECTS — it does NOT mean a different colour. Those zones are the SAME studio set continuing: the same wall, the same atmosphere, the same light falloff, just darker and empty. NEVER paint them as flat bands, NEVER as a block of a different colour, NEVER dark navy or dark blue. A viewer must read the whole canvas as ONE photograph of ONE set, edge to edge.
- All visual action goes strictly in the central zone.
</composition>

<style_contrast>
- ONLY the fox is drawn FLAT CARTOON: thick black outlines, flat vibrant colors, no gradients.
- The BACKGROUND and the PROPS belong to a photographic set: cinematic lighting, volume and soft shading, NO thick cartoon outlines on objects.
- A cartoon mascot standing inside a stylised photographic set with real props: that contrast IS the brand's visual signature.
</style_contrast>

<background>
${direccion.fondo}
</background>

<props_under_light>
${direccion.paletaObjetos}
</props_under_light>${bloquePose}${bloqueUtileria}${bloqueEstiloExtra}

<critical_final_requirements>
VERIFY these BEFORE finalizing the image. If ANY answer is "no", regenerate internally:
1. NO text, NO letters, NO numbers, NO labels, NO captions ANYWHERE in the image. Screens and UI show abstract shapes only.
2. Character matches REFERENCE IMAGE 1 in: outline weight, fur color saturation (#E86A30 flat), glasses shape (rectangular, dark brown), eye size (small simple black dots), nose color (black, NOT pink), muzzle length (elongated, NOT round chibi), shirt color (olive green #4A5D3A flat).
3. Glasses lenses are fully transparent — NO white reflections, NO highlights.
4. NO 3D rendering, NO Disney/Pixar big shiny eyes, NO realistic shading or gradients on the fox or his shirt, NO anime style.
5. Maximum 2-3 main objects in scene — character is the clear focus.
6. Full body visible (ears to feet), not cropped.
7. Top 22% and bottom 25% zones are completely clean (no character, no objects, no shadows).
8. Background follows the art-direction block above: a lit set with atmosphere, never a flat abstract backdrop, and the reserved text zones stay clean.
9. The background is CONTINUOUS from the top edge to the bottom edge: one single set. NO horizontal bands, NO flat colour blocks at the top or bottom, and NO dark navy / dark blue anywhere. If the top or bottom of your image reads as a separate coloured strip instead of the same room getting darker, it is WRONG — redo it.

If any element deviates from the reference style or violates these rules, regenerate internally before returning the final image. Any deviation breaks the registered branding.
</critical_final_requirements>`;
}

async function generarImagenSlide(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
  set: SetEstudio,
): Promise<string> {
  const prompt = buildSlidePrompt(tema, tipoContenido, slide, formato, totalSlides, set);

  // Referencias canon (imágenes 10/10 aprobadas) según rol del slide.
  // Con una referencia propia se omiten: son fotogramas de Webi y meterlas
  // junto a otro personaje le pide al modelo dos cánones a la vez.
  const canonRefs = set.referenciaPropia ? [] : await pickCanonReferences(slide.rol, tema, slide.prompt_visual);

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
      text: `REFERENCE IMAGE ${charImagesUsed + 1} (canonical pose/anatomy variant, CROPPED to the central illustration — copy the FLAT 2D cartoon style and the character anatomy ONLY. Do NOT copy its background or its palette: the background of your image is the lit studio set from the art-direction block, never a flat or dark blue backdrop):`,
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
    config: { ...GEMINI_IMAGE_BASE_CONFIG, imageSize: FORMATO_DIMS[formato].apiSize },
  });
  const finalImg = extractFinalImage(response);
  if (!finalImg) {
    throw new Error(`Gemini no devolvió imagen final para slide ${slide.numero}`);
  }
  // Recorte SIEMPRE al aspecto exacto prometido (1:1 → 1080x1080, 4:5 → 1080x1350),
  // venga o no "texto en imagen" después.
  return ajustarAspectoExacto(finalImg.data, formato);
}

function isRateLimitErr(err: any): boolean {
  const msg = typeof err?.message === "string" ? err.message : "";
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Resource exhausted") || msg.toLowerCase().includes("quota");
}

async function generarImagenSlideConRetry(
  tema: string, tipoContenido: string, slide: SlidePlan,
  formato: "1:1" | "4:5", referenceBase64: string | null, totalSlides: number,
  set: SetEstudio,
): Promise<string> {
  const MAX_ATTEMPTS = 4;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides, set);
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
    const txt = firstText(resp.candidates?.[0]?.content?.parts).trim().toUpperCase();
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
    const txt = firstText(resp.candidates?.[0]?.content?.parts).trim();
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
  set: SetEstudio,
): Promise<{ imagen: string; consistente: boolean }> {
  let imagen = await generarImagenSlideConRetry(tema, tipoContenido, slide, formato, referenceBase64, totalSlides, set);
  // Con una referencia propia el juez de consistencia no aplica: compara
  // contra la master de Webi y marcaría inconsistente lo que el usuario pidió.
  let consistente = set.referenciaPropia ? true : await validarConsistenciaZorro(imagen, referenceBase64);
  if (!consistente) {
    console.warn(`[Descripciones] slide ${slide.numero} falló validación Vision, reintentando una vez...`);
    try {
      const segundo = await generarImagenSlide(tema, tipoContenido, slide, formato, referenceBase64, totalSlides, set);
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
  estiloTitularId?: string,
  // Paleta de la dirección de arte con la que se generó la ilustración. Sin
  // esto el scrim se pintaba siempre del azul viejo y la pieza mezclaba dos
  // estilos: centro con el set iluminado, franjas azul marino.
  paleta: PaletaComposicion = PALETA_COMMUNITY,
): Promise<string> {
  let imgBuffer = Buffer.from(imagenBase64, "base64");
  // Garantizar dimensiones exactas según formato (Gemini suele devolver 1:1 aunque pidamos 4:5)
  if (formatoForzado === "4:5") {
    imgBuffer = Buffer.from(await sharp(imgBuffer).resize(1080, 1350, { fit: "cover", position: "center" }).png().toBuffer());
  } else if (formatoForzado === "1:1") {
    imgBuffer = Buffer.from(await sharp(imgBuffer).resize(1080, 1080, { fit: "cover", position: "center" }).png().toBuffer());
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

  const topMaxHeight = topZoneEnd - edgePad - 20;
  const bottomCenterY = (bottomZoneStart + h - edgePad) / 2;
  const bottomMaxHeight = (h - edgePad - bottomZoneStart) - 20;

  const titulo = stripEmojis(slide.titulo);
  const subtitulo = stripEmojis(slide.subtitulo);

  const subFit = subtitulo ? ajustarTextoMedido(subtitulo, {
    maxWidth: innerWidth - 48,
    maxHeight: bottomMaxHeight - 36,
    maxLineas: 3,
    maxFontSize: 44,
    minFontSize: 26,
    fuenteId: "montserrat_bold",
    lineHeight: 1.2,
  }) : null;

  // Indicador de slide (esquina superior derecha) si hay más de 1 slide
  const indicador = totalSlides > 1
    ? `<text x="${w - 50}" y="60" text-anchor="end" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="28" fill="#ffffff" fill-opacity="0.55" filter="url(#textds)">${String(slide.numero).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}</text>`
    : "";

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${svgDefs(paleta.scrim)}
    <rect x="0" y="0" width="${w}" height="${topZoneEnd}" fill="url(#topfade)"/>
    <rect x="0" y="${bottomZoneStart}" width="${w}" height="${h - bottomZoneStart}" fill="url(#botfade)"/>
    ${subFit ? bloqueSecundarioSvg(subFit, {
      canvasWidth: w, centerY: bottomCenterY, color: "#f1f5f9",
    }) : ""}
    ${indicador}
  </svg>`;

  // TÍTULO con el motor de tipografía de impacto (zona superior), capa aparte.
  const capas: sharp.OverlayOptions[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  if (titulo) {
    const zonaTitulo: ZonaTexto = {
      x: sidePadding + 24, y: edgePad, width: innerWidth - 48, height: topMaxHeight,
      align: "center", vertical: "center", maxFontSize: isCuadrado ? 82 : 90, minFontSize: 44,
    };
    capas.push({
      input: overlayTituloImpacto(titulo, { width: w, height: h }, zonaTitulo, estiloTitularId ?? resolverEstiloTitulo(), paleta),
      top: 0, left: 0,
    });
  }
  const composed = await sharp(imgBuffer)
    .composite(capas)
    .png().toBuffer();
  return composed.toString("base64");
}

// Catálogo del set para la UI: las MISMAS luces, poses y tipografías que
// ofrece Portadas. Se sirve desde aquí para que la página no tenga que hablar
// con dos routers distintos por una lista de opciones.
router.get("/community/set-options", (_req, res) => {
  // Se devuelve el catálogo entero: si un grupo de opciones no viaja, sus
  // botones simplemente no se pintan y no hay forma de saber que faltan.
  const { direcciones, poses, estilosTitular, gestos, encuadres, utileria, estilos, posesPrimerPlano } =
    listarOpcionesPortada();
  res.json({
    success: true,
    data: {
      direcciones, poses, estilosTitular, gestos, encuadres, utileria, estilos, posesPrimerPlano,
      direccionPredeterminada: ID_DIRECCION_MARCA,
    },
  });
});

// "Escribir con IA": el usuario cuenta la idea a lo bruto y recibe tema, idea
// redactada y el set propuesto (luz, pose, utilería, estilo, tipografía).
const RedactarIdeaBody = z.object({
  tema: z.string().max(300).optional(),
  idea: z.string().max(2000).optional(),
  tipo_contenido: z.string().max(40).optional(),
  tipo_publicacion: z.enum(["unica", "carrusel"]).optional(),
  /** "post" (carrusel/publicación) o "historia" (9:16). Cambia el encuadre. */
  destino: z.enum(["post", "historia"]).optional(),
});

// El mismo redactor para las tres secciones. La ruta con prefijo
// /descripciones se mantiene porque ya está publicada.
router.post(["/community/redactar-idea", "/community/descripciones/redactar-idea"], async (req, res) => {
  try {
    const body = RedactarIdeaBody.parse(req.body);
    const tema = (body.tema ?? "").trim();
    const idea = (body.idea ?? "").trim();
    if (!tema && !idea) {
      res.status(400).json({
        success: false,
        error: "Cuenta primero tu idea (aunque sea a lo bruto) para que la IA la redacte.",
      });
      return;
    }

    const catalogo = listarOpcionesPortada();
    const catalogos = {
      direcciones: catalogo.direcciones.map((d) => ({ id: d.id, nombre: d.nombre, descripcion: d.descripcion })),
      poses: catalogo.poses.map((p) => ({ id: p.id, nombre: p.etiqueta })),
      estilosTitular: catalogo.estilosTitular.map((e) => ({ id: e.id, nombre: e.nombre, descripcion: e.descripcion })),
    };

    const resp = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
      max_tokens: 900,
      system: REGLA_ESPANOL_NEUTRO,
      messages: [{
        role: "user",
        content: buildRedactarIdeaPostPrompt(tema, idea, catalogos, {
          tipoContenido: body.tipo_contenido,
          tipoPublicacion: body.tipo_publicacion,
          destino: body.destino,
        }),
      }],
    });
    const bloque = resp.content[0];
    const parsed = parseIdeaPost(bloque && bloque.type === "text" ? bloque.text : "", {
      direcciones: catalogos.direcciones.map((d) => d.id),
      poses: catalogos.poses.map((p) => p.id),
      estilosTitular: catalogos.estilosTitular.map((e) => e.id),
    });
    if (!parsed) {
      res.status(502).json({ success: false, error: "La IA no devolvió una redacción válida. Intenta de nuevo." });
      return;
    }

    // Misma capa determinista que el resto del módulo: el modelo cuela
    // españolismos aunque el prompt los prohíba.
    const neutro = neutralizarProfundo({
      tema: parsed.tema,
      idea: parsed.idea,
      utileria: parsed.utileria,
      estilo_extra: parsed.estiloExtra,
    });

    res.json({
      success: true,
      data: {
        tema: neutro.tema,
        idea: neutro.idea,
        utileria: neutro.utileria,
        estilo_extra: neutro.estilo_extra,
        direccion_id: parsed.direccionId || null,
        pose_id: parsed.poseId || null,
        estilo_titular: parsed.estiloTitularId || null,
      },
    });
  } catch (err: any) {
    console.error("[Descripciones] redactar-idea:", err);
    res.status(500).json({ success: false, error: err.message || "No se pudo redactar la idea." });
  }
});

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

    const resp = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
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
    const formato: "1:1" | "4:5" = "1:1"; // carrusel y única: siempre 1080×1080

    // La idea en bruto es contexto, no el tema: dice qué quiere mostrar y con
    // qué emoción. Sin ella el guion solo tenía el titular para trabajar.
    const ideaBruta = (body.idea ?? "").trim();

    const userMessage = `TEMA: ${body.tema}
${ideaBruta ? `IDEA del usuario (contexto, en sus palabras — respétala): ${ideaBruta}\n` : ""}TIPO de contenido: ${body.tipo_contenido}
REDES solicitadas: ${body.redes.join(", ")}
TIPO de publicación: ${body.tipo_publicacion}
CANTIDAD de slides: ${cantidad}

Genera el JSON con "redes" (solo las solicitadas) y "slides" (${cantidad} slide${cantidad > 1 ? "s" : ""}).
${body.tipo_publicacion === "carrusel"
  ? `La slide 1 es rol "portada" (HOOK con pregunta/dolor), la última rol "cta" (invitación a contactar). Las del medio rol "desarrollo" siguiendo flujo PROBLEMA → SOLUCIÓN → BENEFICIO según corresponda. Cada slide debe tener un "prompt_visual" claro indicando la pose del zorro y los objetos a mostrar.`
  : `La única slide es rol "unica". Incluye un "prompt_visual" claro.`}
Solo el JSON.`;

    const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
    const aiResp = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT_DESC + toneSuffix,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = aiResp.content[0];
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let aiData: any;
    try {
      aiData = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ success: false, error: "La IA no devolvió JSON válido. Intenta de nuevo.", raw: cleaned });
      return;
    }

    const slidesPlan: SlidePlan[] = mapearSlides(aiData, cantidad, body.tema);

    // Segunda pasada de coherencia, igual que en historias: el carrusel ya se
    // generaba en UNA llamada (así que las slides comparten contexto), pero
    // nadie comprobaba el resultado y los titulares repetidos, las aperturas de
    // manual y los subtítulos que repiten el título llegaban tal cual.
    const observaciones = revisarCarrusel(slidesPlan, body.tipo_publicacion === "carrusel");
    if (observaciones.length > 0) {
      console.log(`[Descripciones] carrusel con observaciones, segunda pasada: ${observaciones.join("; ")}`);
      try {
        const reintento = await openaiShim.messages.create({
          model: OPENAI_TEXT_MODEL,
          max_tokens: 8192,
          system: SYSTEM_PROMPT_DESC + toneSuffix,
          messages: [{
            role: "user",
            content: `${userMessage}\n\nTu intento anterior tuvo estos problemas: ${observaciones.join("; ")}. Reescribe el JSON COMPLETO corrigiéndolos, respetando el tema, la cantidad de slides y los roles.`,
          }],
        });
        const b2 = reintento.content[0];
        const raw2 = b2 && b2.type === "text" ? b2.text.trim() : "";
        const limpio2 = raw2.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        const data2 = JSON.parse(limpio2);
        const plan2 = mapearSlides(data2, cantidad, body.tema);
        // Solo se acepta si de verdad quedó mejor: una segunda pasada peor que
        // la primera es un retroceso que el usuario no pidió.
        if (revisarCarrusel(plan2, body.tipo_publicacion === "carrusel").length < observaciones.length) {
          slidesPlan.splice(0, slidesPlan.length, ...plan2);
          if (data2?.redes) aiData.redes = data2.redes;
        }
      } catch (e) {
        console.warn(`[Descripciones] segunda pasada falló: ${(e as Error).message}`);
      }
    }


    // Referencia del personaje: Webi salvo que el usuario suba la suya.
    const referenciaPropia = (body.imagen_referencia_base64 ?? "").trim();
    const referenceBase64 = referenciaPropia || (await getFoxRefBase64());
    // Un estilo tipográfico por carrusel: todas las slides comparten diseño.
    const estiloTitular = resolverEstiloTitulo(body.estilo_titular);
    // Y UN solo set (luz, pose, utilería) para todo el carrusel: si cada slide
    // resolviera el suyo, dejaría de verse como una pieza.
    const setEstudio = resolverSetEstudio(body, referenciaPropia.length > 0);
    // Lo que se guarda y se devuelve: el reintento de una slide tiene que poder
    // reproducir EXACTAMENTE el mismo set, o desentona con el resto.
    const setUsado = {
      direccion_id: setEstudio.direccion.id,
      pose_id: setEstudio.pose?.id ?? null,
      utileria: setEstudio.utileria,
      estilo_extra: setEstudio.estiloExtra,
    };

    const settled = await Promise.allSettled(
      slidesPlan.map((s) => generarImagenSlideConValidacion(body.tema, body.tipo_contenido, s, formato, referenceBase64, cantidad, setEstudio)),
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
            imgBase64 = await renderTextoEnSlide(imgBase64, slide, cantidad, formato, estiloTitular, paletaDe(setEstudio.direccion));
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

    // Español neutro garantizado, no solo pedido en el prompt: el modelo cuela
    // españolismos ("empalmadas") y esta capa los corrige en todo el objeto.
    const descripciones = neutralizarProfundo(aiData.redes || {});
    // X/Twitter: clamp duro a 280 caracteres — el modelo a veces se pasa
    // aunque el prompt lo prohíba, y la UI promete el límite real de la red.
    // Por palabra: cortar el post a media letra se veía como texto roto.
    if (typeof descripciones?.twitter?.post_completo === "string") {
      descripciones.twitter.post_completo = recortarLimpio(descripciones.twitter.post_completo, PLATFORM_LIMITS.x);
    }

    const thumb = await miniatura(imagenes.find((i) => i.imagen)?.imagen ?? null);

    const [row] = await db.insert(communityContent).values({
      kind: "descripcion",
      subtype: body.tipo_contenido,
      topic: body.tema,
      data: {
        tema: body.tema, tipo_contenido: body.tipo_contenido, redes: body.redes,
        tipo_publicacion: body.tipo_publicacion, cantidad_slides: cantidad,
        texto_en_imagen: body.texto_en_imagen, estilo_titular: estiloTitular,
        idea: ideaBruta || undefined,
        set: setUsado,
        thumb,
        piezas: await Promise.all(
          imagenes.map(async (im) => ({
            numero: im.numero_slide,
            rol: im.rol,
            titulo: im.titulo,
            subtitulo: im.subtitulo,
            imagen: await comprimirParaBorrador(im.imagen),
          })),
        ),
        descripciones, slides_textos: slidesPlan,
      },
      imageUrl: imagenes.find((i) => i.imagen)?.imagen || null,
    }).returning();

    void purgarBorradores("post");

    res.json({
      success: true,
      data: {
        id: row!.id, fecha: row!.createdAt, tema: body.tema,
        tipo_contenido: body.tipo_contenido, tipo_publicacion: body.tipo_publicacion,
        texto_en_imagen: body.texto_en_imagen, estilo_titular: estiloTitular,
        set: setUsado,
        imagenes, descripciones,
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
  formato: z.enum(["1:1", "4:5"]).default("1:1"),
  // Por defecto SÍ: componer el texto con el motor de tipografía es el
  // estándar de la marca. El default en false hacía que cualquier llamada que
  // omitiera el campo devolviera la imagen limpia, sin el estilo nuevo.
  texto_en_imagen: z.boolean().optional().default(true),
  total_slides: z.number().int().min(1).max(10).optional().default(1),
  modo: z.enum(["imagen", "texto", "ambos", "personalizado", "auto-diagnose"]).optional().default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
  imagen_actual_base64: z.string().optional(), // sin prefijo data:; usado por auto-diagnose
  /** Estilo tipográfico del carrusel original: el reintento mantiene el diseño. */
  estilo_titular: z.string().max(40).optional(),
  // Set del carrusel original. Antes el reintento resolvía una luz nueva "para
  // que los reintentos no se parezcan": el resultado era una slide con otra
  // iluminación en medio de un carrusel, que es exactamente lo que no puede pasar.
  direccion_id: z.string().max(40).optional(),
  ...CAMPOS_PERSONAJE,
});

// Regenera SOLO el texto (titulo + subtitulo) de una slide, manteniendo el rol
async function regenerarTextoSlide(
  tema: string, tipoContenido: string, rol: SlideRol, numero: number, totalSlides: number,
  ajuste?: string, toneSuffix = "",
): Promise<{ titulo: string; subtitulo: string; prompt_visual?: string }> {
  const ajusteTxt = ajuste ? `\n\nAJUSTE PEDIDO POR EL USUARIO: "${ajuste}". Aplica este ajuste al copy.` : "";
  const prompt = `Genera SOLO una slide de carrusel para WebMakerLatam.
Tema general: "${tema}" (${tipoContenido})
Es la slide número ${numero} de ${totalSlides} con rol "${rol}".${ajusteTxt}

Devuelve JSON estricto:
{ "titulo": "máx 50 chars", "subtitulo": "máx 90 chars", "prompt_visual": "1 frase descripción visual" }`;
  const resp = await openaiShim.messages.create({
    model: OPENAI_TEXT_MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT_DESC + toneSuffix,
    messages: [{ role: "user", content: prompt }],
  });
  const txt = resp.content[0]?.type === "text" ? resp.content[0].text : "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("La IA no devolvió JSON válido para texto de slide");
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
        const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
        const nuevo = await regenerarTextoSlide(
          body.tema, body.tipo_contenido, body.rol, body.numero_slide, body.total_slides,
          body.prompt_personalizado, toneSuffix,
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
    // El mismo set que el carrusel original: la slide regenerada tiene que
    // entrar en la serie, no verse como una pieza de otra sesión.
    const setEstudio = resolverSetEstudio(body);
    let imgBase64 = await generarImagenSlideConRetry(body.tema, body.tipo_contenido, slideParaImagen, body.formato, referenceBase64, body.total_slides, setEstudio);
    if (body.texto_en_imagen) {
      try {
        imgBase64 = await renderTextoEnSlide(
          imgBase64, slide, body.total_slides, body.formato,
          resolverEstiloTitulo(body.estilo_titular), paletaDe(setEstudio.direccion),
        );
      } catch {}
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
const GuionFrameSchema = z.object({
  numero: z.number().int().min(1).max(5),
  paso: z.string().max(40),
  layoutId: z.string().max(40),
  copy_principal: z.string().max(120),
  sub_copy: z.string().max(200),
  dato: z.string().max(20).optional().default(""),
  dato_label: z.string().max(60).optional().default(""),
  cta: z.string().max(60).optional().default(""),
  hashtags: z.string().max(300).optional().default(""),
  prompt_visual: z.string().max(400).optional().default(""),
});

const ReintentarHistoriaBody = z.object({
  tipo_historia: z.enum(["tip_tech", "motivacional", "comunidad"]),
  concepto: z.string().min(1).max(200),
  texto_actual: z.object({
    copy_principal: z.string().max(200),
    sub_copy: z.string().max(300),
    cta: z.string().max(80),
    hashtags: z.string().max(300),
  }).optional(),
  // Por defecto SÍ: componer el texto con el motor de tipografía es el
  // estándar de la marca. El default en false hacía que cualquier llamada que
  // omitiera el campo devolviera la imagen limpia, sin el estilo nuevo.
  texto_en_imagen: z.boolean().optional().default(true),
  modo: z.enum(["imagen", "texto", "ambos", "personalizado", "auto-diagnose"]).default("imagen"),
  prompt_personalizado: z.string().max(2000).optional(),
  imagen_actual_base64: z.string().optional(), // sin prefijo data:; usado por auto-diagnose
  // Soporte de serie: regenerar UN frame específico
  numero_frame: z.number().int().min(1).max(5).optional(),
  total_frames: z.number().int().min(1).max(5).optional(),
  rol: z.string().max(40).optional(),
  /** Estilo tipográfico de la historia original: el reintento mantiene el diseño. */
  estilo_titular: z.string().max(40).optional(),
  /** Guion del frame (lo devuelve la generación): conserva layout y dirección visual. */
  guion_frame: GuionFrameSchema.optional(),
  /** Formato narrativo e hilo de la serie: el reintento no rompe la coherencia. */
  formato_narrativo: z.string().max(40).optional(),
  hilo: z.string().max(400).optional(),
  /** Titulares de los otros frames, para no repetirlos al regenerar el texto. */
  otros_titulares: z.array(z.string().max(120)).max(5).optional(),
  // Set de la serie original. Antes el reintento resolvía una luz nueva "para
  // que los reintentos no se parezcan": el resultado era un frame con otra
  // iluminación en medio de la serie, que es lo que no puede pasar.
  direccion_id: z.string().max(40).optional(),
  ...CAMPOS_PERSONAJE,
  /** Referencia propia de la serie: si la original no usó a Webi, el reintento tampoco. */
  imagen_referencia_base64: z.string().max(12_000_000).optional(),
});

/**
 * Regenera el texto de UN frame sin romper la serie: recibe el hilo conductor,
 * el rol del frame y los titulares de los demás para no repetirlos.
 */
async function regenerarTextoFrame(args: {
  tipoHistoria: string;
  concepto: string;
  formato: FormatoHistoria;
  paso: PasoNarrativo;
  numero: number;
  total: number;
  hilo?: string;
  otrosTitulares?: string[];
  ajuste?: string;
  toneSuffix?: string;
}): Promise<FrameGuion | null> {
  const guion = await generarGuionHistoria({
    tipoHistoria: args.tipoHistoria,
    concepto: args.hilo
      ? `${args.concepto}\n\nHILO CONDUCTOR YA ESTABLECIDO DE LA SERIE (respétalo): ${args.hilo}`
      : args.concepto,
    formato: args.formato,
    arco: [args.paso],
    toneSuffix: args.toneSuffix,
    ajuste: [
      args.ajuste,
      args.otrosTitulares?.length
        ? `Los otros frames de la serie ya dicen: ${args.otrosTitulares.map(t => `"${t}"`).join(", ")}. NO repitas ninguno ni digas lo mismo con otras palabras.`
        : null,
      args.total > 1 ? `Este texto es para el frame ${args.numero} de ${args.total}.` : null,
    ].filter(Boolean).join(" ") || null,
  });
  const f = guion.frames[0];
  if (!f) return null;
  // El arco de un solo paso hace que parseGuion lo trate como cierre: si el
  // frame real NO es el último de la serie, se le quitan CTA y hashtags.
  const esCierre = args.numero === args.total;
  return {
    ...f,
    numero: args.numero,
    cta: esCierre ? f.cta : "",
    hashtags: esCierre ? f.hashtags : "",
  };
}

router.post("/community/historias/reintentar", async (req, res) => {
  try {
    const body = ReintentarHistoriaBody.parse(req.body);
    const total = body.total_frames || 1;
    const numero = body.numero_frame || 1;
    const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
    const estiloTitular = resolverEstiloTitulo(body.estilo_titular);

    // Formato y paso del frame: si el cliente mandó el guion original los
    // respetamos; si no, reconstruimos con el formato y el arco.
    const formatoNarrativo = obtenerFormatoHistoria(body.formato_narrativo ?? "")
      ?? resolverFormatoHistoria(null, body.tipo_historia);
    const arco = arcoParaFrames(formatoNarrativo, total);
    const pasoDelFrame = arco[Math.min(numero - 1, arco.length - 1)]!;

    // Guion base del frame: el que vino del cliente, o uno derivado del texto
    // actual. Pase por donde pase, se sanea igual que uno recién generado —
    // el texto que el usuario editó a mano también tiene que respetar los
    // límites, si no llega al renderizador sin recortar.
    let frameGuion: FrameGuion = sanearFrameGuion(body.guion_frame
      ? { ...body.guion_frame, numero }
      : {
          numero,
          paso: body.rol || pasoDelFrame.paso,
          layoutId: pasoDelFrame.layoutId,
          copy_principal: body.texto_actual?.copy_principal ?? "",
          sub_copy: body.texto_actual?.sub_copy ?? "",
          dato: "",
          dato_label: "",
          cta: body.texto_actual?.cta ?? "",
          hashtags: body.texto_actual?.hashtags ?? "",
          prompt_visual: "",
        });

    // 1) Regenerar texto si el modo lo requiere, manteniendo el hilo de la serie.
    if (body.modo === "texto" || body.modo === "ambos" ||
        (body.modo === "personalizado" && !body.texto_actual)) {
      const nuevo = await regenerarTextoFrame({
        tipoHistoria: body.tipo_historia,
        concepto: body.concepto,
        formato: formatoNarrativo,
        paso: { ...pasoDelFrame, layoutId: frameGuion.layoutId },
        numero,
        total,
        hilo: body.hilo,
        otrosTitulares: body.otros_titulares,
        ajuste: (body.modo === "texto" || body.modo === "ambos") ? body.prompt_personalizado : undefined,
        toneSuffix,
      });
      if (nuevo) frameGuion = sanearFrameGuion(nuevo);
    }

    const layout = obtenerLayoutHistoria(frameGuion.layoutId) ?? layoutHistoriaPorDefecto();

    // 2) Modo "texto" puro: devuelve solo texto, sin imagen
    if (body.modo === "texto") {
      res.json({
        success: true,
        data: {
          texto: {
            copy_principal: frameGuion.copy_principal,
            sub_copy: frameGuion.sub_copy,
            cta: frameGuion.cta,
            hashtags: frameGuion.hashtags,
          },
          guion: frameGuion,
          imagen: null,
        },
      });
      return;
    }

    // 3) Regenerar imagen (el ajuste del usuario afecta a la imagen en
    // "personalizado" y "ambos"; en auto-diagnose lo escribe Vision).
    const referenciaPropia = (body.imagen_referencia_base64 ?? "").trim();
    const referenceBase64 = referenciaPropia || (await getFoxRefBase64());
    let promptOverride: string | undefined = body.prompt_personalizado &&
      (body.modo === "personalizado" || body.modo === "ambos")
      ? body.prompt_personalizado
      : undefined;
    if (body.modo === "auto-diagnose" && body.imagen_actual_base64) {
      const diagnostico = await diagnosticarImagenConVision(body.imagen_actual_base64, referenceBase64);
      promptOverride = diagnostico
        ?? "La imagen anterior fue aprobada por Vision pero el usuario pidió un nuevo intento — varía la pose y el encuadre manteniendo el mismo concepto.";
    }

    const frame = await generarFrameHistoria({
      tipoHistoria: body.tipo_historia,
      concepto: body.concepto,
      frameGuion,
      layout,
      // El MISMO set que la serie original: el frame regenerado tiene que
      // entrar en la serie, no verse como una pieza de otra sesión.
      set: resolverSetEstudio(body, referenciaPropia.length > 0),
      hilo: body.hilo,
      promptOverride,
      textoEnImagen: body.texto_en_imagen,
      referenceBase64,
      numero,
      total,
      estiloTitular,
    });

    res.json({
      success: true,
      data: {
        texto: frame.texto,
        guion: frame.guion,
        imagen: frame.imagen,
        numero_frame: numero,
        total_frames: total,
        rol: frameGuion.paso,
        layout: layout.id,
      },
    });
  } catch (err: any) {
    console.error("[Reintentar historia] Error:", err);
    if (err?.message === "RATE_LIMIT" || isRateLimitErr(err)) {
      res.status(429).json({ success: false, error: "El servicio de imágenes está saturado ahora mismo (cuota de Gemini). Espera 1-2 minutos y vuelve a reintentar la historia." });
      return;
    }
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

/* ==================== Borradores (Historias y Posts IA) ================== */
//
// Cada generación YA se guardaba en `community_content`. Lo que faltaba era
// poder recuperarla — nada en la interfaz volvía a mostrarla, así que salir
// de la página se sentía como perderlo todo — y que algo la borrara alguna
// vez: las filas llevan las imágenes en base64 dentro del JSON y la tabla
// crecía sin techo.
//
// La lista viaja SOLO con miniaturas. Devolver las filas enteras (que es lo
// que hacían /community/historias y /community/descripciones) son decenas de
// megas por petición, y por eso no había UI montada encima.

const KIND_POR_TIPO = { historia: "historia", post: "descripcion" } as const;
type TipoBorrador = keyof typeof KIND_POR_TIPO;

/**
 * Imagen comprimida para guardar en el borrador.
 *
 * El borrador guardaba SOLO la primera imagen: de un carrusel de 8 slides se
 * perdían 7 en el momento de generar. Guardarlas todas en PNG base64 tampoco
 * vale — son megas por slide dentro de una fila JSON. En webp de calidad alta
 * la ilustración es indistinguible y pesa alrededor de ocho veces menos, que
 * es lo que hace viable guardar la pieza ENTERA.
 */
async function comprimirParaBorrador(imagen: string | null | undefined): Promise<string | null> {
  if (!imagen) return null;
  const crudo = imagen.startsWith("data:") ? imagen.replace(/^data:[^;]+;base64,/, "") : imagen;
  if (!crudo) return null;
  try {
    const buf = await sharp(Buffer.from(crudo, "base64")).webp({ quality: 86 }).toBuffer();
    return `data:image/webp;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("[Borradores] no pude comprimir la pieza:", (e as Error).message);
    return null;
  }
}

/** Miniatura webp de una imagen base64 o data URL. */
async function miniatura(imagen: string | null | undefined): Promise<string> {
  if (!imagen) return "";
  const crudo = imagen.startsWith("data:") ? imagen.replace(/^data:[^;]+;base64,/, "") : imagen;
  if (!crudo) return "";
  try {
    const buf = await sharp(Buffer.from(crudo, "base64"))
      .resize(320, undefined, { withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return `data:image/webp;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("[Borradores] no pude generar miniatura:", (e as Error).message);
    return "";
  }
}

/**
 * Borra los borradores caducados de un tipo.
 *
 * Se llama después de guardar (barrido oportunista) y al arrancar. Nunca deja
 * la lista vacía: ver `planPurga`.
 */
async function purgarBorradores(tipo: TipoBorrador): Promise<number> {
  try {
    const filas = await db
      .select({ id: communityContent.id, createdAt: communityContent.createdAt })
      .from(communityContent)
      .where(eq(communityContent.kind, KIND_POR_TIPO[tipo]));
    const plan = planPurga(filas);
    if (plan.ids.length === 0) return 0;
    await db.delete(communityContent).where(inArray(communityContent.id, plan.ids));
    const caducados = plan.ids.filter((id) => plan.motivos[id] === "caducado").length;
    console.log(
      `[Borradores] ${tipo}: purgados ${plan.ids.length} (${caducados} por antigüedad, ${plan.ids.length - caducados} por tope)`,
    );
    return plan.ids.length;
  } catch (e) {
    // Nunca romper una generación por no poder limpiar.
    console.warn(`[Borradores] purga de ${tipo} falló: ${(e as Error).message}`);
    return 0;
  }
}

/** Barrido de arranque: se llama desde el boot del servidor. */
export async function purgarBorradoresCaducados(): Promise<void> {
  await purgarBorradores("historia");
  await purgarBorradores("post");
}

router.get("/community/borradores", async (req, res) => {
  const tipo = (req.query.tipo === "historia" ? "historia" : "post") as TipoBorrador;
  if (tipo === "historia" && !puedeVerHistorias(req.user as { role?: string; teamRole?: string } | undefined)) {
    res.status(403).json({ success: false, error: "No tienes acceso a esta sección" });
    return;
  }
  try {
    const rows = await db
      .select({
        id: communityContent.id,
        topic: communityContent.topic,
        subtype: communityContent.subtype,
        data: communityContent.data,
        imageUrl: communityContent.imageUrl,
        createdAt: communityContent.createdAt,
      })
      .from(communityContent)
      .where(and(eq(communityContent.kind, KIND_POR_TIPO[tipo]), ne(communityContent.subtype, "portada_reel")))
      .orderBy(desc(communityContent.createdAt))
      .limit(MAX_BORRADORES);

    const borradores = await Promise.all(
      rows.map(async (r) => {
        const d = (r.data ?? {}) as Record<string, any>;
        // La miniatura se calcula al vuelo solo si la fila es antigua y no la
        // trae guardada; las nuevas la guardan al generar.
        const thumb = typeof d.thumb === "string" && d.thumb ? d.thumb : await miniatura(r.imageUrl);
        return {
          id: r.id,
          titulo: r.topic,
          subtipo: r.subtype,
          thumb,
          piezas: Array.isArray(d.frames) ? d.frames.length : Array.isArray(d.imagenes) ? d.imagenes.length : 1,
          creado: r.createdAt.toISOString(),
          caducidad: avisoCaducidad(r.createdAt),
          dias_restantes: diasRestantes(r.createdAt),
        };
      }),
    );
    res.json({ success: true, data: { borradores, dias_retencion: DIAS_RETENCION } });
  } catch (err: any) {
    console.error("[Borradores] listar:", err);
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

router.get("/community/borradores/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ success: false, error: "id inválido" });
    return;
  }
  const [row] = await db.select().from(communityContent).where(eq(communityContent.id, id)).limit(1);
  if (!row || (row.kind !== "historia" && row.kind !== "descripcion")) {
    res.status(404).json({ success: false, error: "Borrador no encontrado" });
    return;
  }
  if (row.kind === "historia" && !puedeVerHistorias(req.user as { role?: string; teamRole?: string } | undefined)) {
    res.status(403).json({ success: false, error: "No tienes acceso a esta sección" });
    return;
  }
  const d = (row.data ?? {}) as Record<string, any>;
  // `thumb` fuera: pesa y quien abre el borrador ya tiene las imágenes reales.
  const { thumb: _omitido, ...datos } = d;
  res.json({
    success: true,
    data: { id: row.id, tipo: row.kind === "historia" ? "historia" : "post", creado: row.createdAt.toISOString(), ...datos },
  });
});

router.delete("/community/borradores/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ success: false, error: "id inválido" });
    return;
  }
  const [row] = await db
    .select({ kind: communityContent.kind })
    .from(communityContent)
    .where(eq(communityContent.id, id))
    .limit(1);
  if (row?.kind === "historia" && !puedeVerHistorias(req.user as { role?: string; teamRole?: string } | undefined)) {
    res.status(403).json({ success: false, error: "No tienes acceso a esta sección" });
    return;
  }
  await db.delete(communityContent).where(eq(communityContent.id, id));
  res.json({ success: true });
});

/* ==================== Contenido interactivo ============================= */
//
// Encuestas, quiz, retos: piezas con las que la gente PUEDE hacer algo, no
// solo leerlas. La ilustración la pone el modelo (sin una sola letra, como
// siempre) y el elemento interactivo lo dibujamos nosotros con SVG, porque el
// modelo de imagen no sabe escribir texto legible.

router.get("/community/formatos-interactivos", (_req, res) => {
  res.json({ success: true, data: listarFormatosInteractivos() });
});

const GenerarInteractivoBody = z.object({
  formato: z.string().min(1).max(40),
  tema: z.string().min(1).max(300),
  idea: z.string().max(2000).optional(),
  /** "9:16" historia, "1:1" post, "4:5" carrusel. */
  relacion: z.enum(["9:16", "1:1", "4:5"]).optional().default("9:16"),
  estilo_titular: z.string().max(40).optional(),
  direccion_id: z.string().max(40).optional(),
  ...CAMPOS_PERSONAJE,
  imagen_referencia_base64: z.string().max(12_000_000).optional(),
  /**
   * Fotos propias por ranura del formato ("antes", "despues", "marco"…).
   *
   * No se le pasan al modelo de imagen: se componen encima, en el hueco que
   * el formato reserva, para que salgan tal cual las subieron.
   */
  fotos: z.record(z.string().max(40), z.string().max(12_000_000)).optional(),
});

router.post("/community/interactivo/generar", async (req, res) => {
  try {
    const body = GenerarInteractivoBody.parse(req.body);
    const formato = obtenerFormatoInteractivo(body.formato);
    if (!formato) {
      res.status(400).json({ success: false, error: `No existe el formato "${body.formato}".` });
      return;
    }

    // 1) El texto. Cada formato pide SUS campos: por eso elegir uno u otro
    //    cambia de verdad el resultado, cosa que los "tipos de contenido"
    //    anteriores no hacían.
    const toneSuffix = await buildBrandToneSuffix(getReqUserId(req));
    const resp = await openaiShim.messages.create({
      model: OPENAI_TEXT_MODEL,
      max_tokens: 1200,
      system: REGLA_ESPANOL_NEUTRO + toneSuffix,
      messages: [{ role: "user", content: buildPromptInteractivo(formato, body.tema, body.idea) }],
    });
    const bloqueTxt = resp.content[0];
    let contenido = parseContenidoInteractivo(bloqueTxt?.type === "text" ? bloqueTxt.text : "", formato);

    // Una sola segunda pasada: el modelo falla la ESTRUCTURA más que el fondo,
    // y devolver una encuesta sin opciones sería una imagen que no se puede
    // responder — justo lo contrario de lo que promete el formato.
    if (!contenido) {
      console.warn(`[Interactivo] ${formato.id}: primera pasada inválida, reintentando`);
      const r2 = await openaiShim.messages.create({
        model: OPENAI_TEXT_MODEL,
        max_tokens: 1200,
        system: REGLA_ESPANOL_NEUTRO + toneSuffix,
        messages: [{
          role: "user",
          content: `${buildPromptInteractivo(formato, body.tema, body.idea)}\n\nTu intento anterior no traía todos los campos obligatorios. Devuélvelos TODOS, con el JSON exacto que se pide.`,
        }],
      });
      const b2 = r2.content[0];
      contenido = parseContenidoInteractivo(b2?.type === "text" ? b2.text : "", formato);
    }
    if (!contenido) {
      res.status(502).json({
        success: false,
        error: `La IA no logró escribir un "${formato.nombre}" completo para este tema. Prueba con un tema más concreto u otro formato.`,
      });
      return;
    }

    // Español neutro garantizado, no solo pedido en el prompt.
    const neutro = neutralizarProfundo(contenido as unknown as Record<string, unknown>) as unknown as typeof contenido;

    // 2) La ilustración: el set de la marca, sin texto.
    const referenciaPropia = (body.imagen_referencia_base64 ?? "").trim();
    const referenceBase64 = referenciaPropia || (await getFoxRefBase64());
    const setEstudio = resolverSetEstudio(body, referenciaPropia.length > 0);
    const layout = obtenerLayoutHistoria("clasico_superior") ?? layoutHistoriaPorDefecto();

    const frameGuion: FrameGuion = {
      numero: 1,
      paso: formato.id,
      layoutId: layout.id,
      copy_principal: titularDe(neutro, formato),
      sub_copy: "",
      dato: "",
      dato_label: "",
      cta: "",
      hashtags: "",
      prompt_visual: neutro.explicacion || body.tema,
    };

    const frame = await generarFrameHistoria({
      tipoHistoria: formato.nombre,
      concepto: body.tema,
      frameGuion,
      layout,
      set: setEstudio,
      // El texto secundario NO se compone aquí: el sitio de abajo lo ocupa el
      // bloque interactivo, y pintar los dos encima sería ilegible.
      textoEnImagen: true,
      referenceBase64,
      numero: 1,
      total: 1,
      estiloTitular: resolverEstiloTitulo(body.estilo_titular),
      // Sin esto, el titular se dibujaba sobre un lienzo 9:16 y el recorte
      // posterior al feed se lo llevaba por delante.
      relacion: body.relacion,
    });

    // 3) El elemento interactivo encima.
    const dims = FORMATO_DIMS[body.relacion];
    const base = frame.imagen.replace(/^data:[^;]+;base64,/, "");
    // Las ranuras vacías no son un error —las fotos son opcionales— pero una
    // foto rota sí, y se dice cuál antes de gastar la composición.
    const preparadas = await prepararFotos(body.fotos, formato.ranurasFoto ?? [], 1);
    if (!preparadas.ok) {
      res.status(400).json({ success: false, error: preparadas.error });
      return;
    }
    const conBloque = await componerInteractivo(base, neutro, formato, body.relacion, paletaDe(setEstudio.direccion), preparadas.fotos);

    const thumb = await miniatura(`data:image/png;base64,${conBloque}`);
    const [row] = await db.insert(communityContent).values({
      kind: "descripcion",
      subtype: `interactivo_${formato.id}`,
      topic: body.tema,
      data: {
        tema: body.tema,
        tipo_contenido: `interactivo_${formato.id}`,
        tipo_publicacion: "unica",
        texto_en_imagen: true,
        formato_interactivo: formato.id,
        contenido: neutro,
        set: {
          direccion_id: setEstudio.direccion.id,
          pose_id: setEstudio.pose?.id ?? null,
          utileria: setEstudio.utileria,
          estilo_extra: setEstudio.estiloExtra,
        },
        thumb,
        piezas: [{ numero: 1, rol: "unica", titulo: titularDe(neutro, formato), subtitulo: neutro.explicacion, imagen: await comprimirParaBorrador(`data:image/png;base64,${conBloque}`) }],
        descripciones: {},
      },
      imageUrl: `data:image/png;base64,${conBloque}`,
    }).returning();

    void purgarBorradores("post");

    res.json({
      success: true,
      data: {
        id: row!.id,
        fecha: row!.createdAt,
        formato: formato.id,
        formato_nombre: formato.nombre,
        sticker_ig: formato.stickerIg,
        tema: body.tema,
        relacion: body.relacion,
        ancho: dims.width,
        alto: dims.height,
        imagen: `data:image/png;base64,${conBloque}`,
        contenido: neutro,
      },
    });
  } catch (err: any) {
    console.error("[Interactivo] Error:", err);
    if (err?.message === "RATE_LIMIT" || isRateLimitErr(err)) {
      res.status(429).json({ success: false, error: "El servicio de imágenes está saturado. Espera un par de minutos." });
      return;
    }
    res.status(500).json({ success: false, error: err.message || "Error interno" });
  }
});

/**
 * Compone el bloque interactivo sobre la ilustración ya generada.
 *
 * La zona de abajo es la MISMA que las historias reservan para el texto, así
 * que el zorro nunca queda tapado: el modelo ya la dejó despejada.
 */
async function componerInteractivo(
  imagenBase64: string,
  contenido: ContenidoInteractivo,
  formato: FormatoInteractivo,
  relacion: "9:16" | "1:1" | "4:5",
  paleta: PaletaComposicion,
  fotos: FotosPorRanura = new Map(),
): Promise<string> {
  const { width, height } = FORMATO_DIMS[relacion];
  // La imagen ya llega con este tamaño: el frame se genera y se recorta una
  // sola vez, a la relación final. Esto es una red de seguridad, no un recorte
  // — antes SÍ recortaba aquí, y como el titular ya venía dibujado sobre un
  // lienzo 9:16, se lo llevaba por delante.
  const buf = await sharp(Buffer.from(imagenBase64, "base64"))
    .resize(width, height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  // La zona la decide render-interactivo: es la MISMA base con la que los
  // bloques se dimensionan. Calcularla aquí con otra proporción fue lo que hizo
  // que solo cuadrara en 9:16 y se cortara en el feed.
  const zona = zonaInteractiva({ width, height }, formato);
  const cuerpo = bloqueInteractivoSvg(formato.bloque, contenido, formato, { width, height }, zona, paleta, fotos);
  if (!cuerpo) return buf.toString("base64");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgDefs(paleta.scrim)}${cuerpo}</svg>`;
  const compuesta = await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  return compuesta.toString("base64");
}


export default router;
