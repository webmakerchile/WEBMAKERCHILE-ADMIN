// Guion narrativo de una serie de historias.
//
// CAMBIO DE RAÍZ: antes el texto de cada frame se pedía al modelo por
// separado y EN PARALELO — cada frame solo sabía su rol y el tema, así que
// la serie no tenía hilo: eran N variaciones del mismo tema. Aquí el modelo
// escribe el GUION COMPLETO de una sola vez: mismo protagonista, mismas
// cifras, progresión real y sin repetirse.
//
// El guion también dirige la ILUSTRACIÓN de cada frame (`prompt_visual`), así
// que la imagen acompaña la narrativa en vez de ser una pose genérica por rol.

import type { FormatoHistoria, PasoNarrativo } from "./story-formats.js";
import { obtenerLayoutHistoria, layoutHistoriaPorDefecto } from "./story-formats.js";

/* ========================= Tipos ========================================= */

export interface FrameGuion {
  numero: number;
  /** Rol narrativo del paso (viene del arco del formato). */
  paso: string;
  layoutId: string;
  /** Titular del frame (lo compone el motor de tipografía de impacto). */
  copy_principal: string;
  /** Línea de contexto; "" si el layout no lleva sub-copy. */
  sub_copy: string;
  /** Cifra protagonista para el layout "dato_gigante" (ej. "40", "72%"). */
  dato: string;
  /** Qué mide esa cifra (ej. "pedidos perdidos al mes"). */
  dato_label: string;
  /** Invitación final: solo en el frame de cierre. "" en el resto. */
  cta: string;
  /** Hashtags: solo en el frame de cierre. "" en el resto. */
  hashtags: string;
  /** Dirección de la ilustración de ESTE frame (pose + objetos, sin texto). */
  prompt_visual: string;
}

export interface GuionHistoria {
  /** El hilo conductor en una frase (para depurar y para los reintentos). */
  hilo: string;
  /** Protagonista/sujeto que se mantiene en toda la serie ("" si no aplica). */
  protagonista: string;
  formatoId: string;
  frames: FrameGuion[];
}

/* ==================== Límites por tipo de bloque ========================= */

/** Los layouts sin sub-copy admiten titulares más largos. */
export const LIMITES_GUION = {
  titularCorto: 44,
  titularLargo: 58,
  subCopy: 88,
  cta: 28,
  dato: 7,
  datoLabel: 34,
  promptVisual: 220,
} as const;

function limiteTitular(layoutId: string): number {
  const layout = obtenerLayoutHistoria(layoutId);
  const llevaSub = layout?.subCopyCenterY !== null && layout?.bloques.includes("subcopy");
  return llevaSub ? LIMITES_GUION.titularCorto : LIMITES_GUION.titularLargo;
}

/* ==================== Reglas de naturalidad ============================== */

/** Frases que delatan la plantilla robótica. El prompt las prohíbe y el
 *  post-proceso las limpia si el modelo insiste. */
export const FRASES_PROHIBIDAS = [
  // Relleno de atención: pedir que sigan mirando delata que el guion no retiene.
  "sigue viendo", "sigue mirando", "mira esto", "toca para seguir", "toca para ver",
  "continúa viendo", "continua viendo", "sigue leyendo", "no te lo pierdas",
  "no te pierdas", "espera el siguiente", "en el siguiente", "próxima historia",
  "proxima historia", "desliza", "swipe", "atento a lo que viene",
  // Folleto de agencia.
  "lleva tu negocio al siguiente nivel", "potencia tu negocio", "impulsa tu negocio",
  "impulsa tu marca", "transforma tu negocio", "transforma tu presencia digital",
  "soluciones digitales a tu medida", "solución integral", "solucion integral",
  "en el mundo digital de hoy", "en la era digital", "no esperes más", "no esperes mas",
  // Aperturas de manual.
  "descubre cómo", "descubre como", "imagina que", "te cuento un caso",
  "un cliente nos escribió", "un cliente nos escribio", "y si te dijera que",
  // Vender con miedo.
  "estás perdiendo clientes ahora mismo", "estas perdiendo clientes ahora mismo",
  "tu competencia ya lo hace", "te vas a quedar atrás", "te vas a quedar atras",
  "antes de que sea tarde", "no dejes pasar",
  // Pedir interacción de plataforma.
  "haz clic", "link en bio", "dale like", "comparte esto", "guarda esto", "sígueme", "sigueme",
];

const BLOQUE_NATURALIDAD = `CÓMO ESCRIBIR (esto separa un guion bueno de una plantilla):

LO QUE NUNCA SE ESCRIBE
- PROHIBIDO pedirle al espectador que siga mirando: "sigue viendo", "toca para seguir", "desliza", "no te lo pierdas", "en el siguiente". Si un frame necesita un botón para retener, el guion está mal escrito: la curiosidad la genera lo que CUENTAS.
- PROHIBIDO el folleto de agencia: "lleva tu negocio al siguiente nivel", "potencia tu negocio", "transforma tu negocio", "soluciones a tu medida", "en la era digital".
- PROHIBIDO abrir con fórmulas de manual: "¿Sabías que...?", "¿Te imaginas...?", "¿Alguna vez te ha pasado?", "Imagina que", "Te cuento un caso", "Un cliente nos escribió".
- PROHIBIDO vender con miedo: "estás perdiendo clientes ahora mismo", "tu competencia ya lo hace", "antes de que sea tarde". El costo se cuenta con una cifra y el espectador saca su conclusión.
- PROHIBIDO el autoelogio: "increíble", "impresionante", "potente", "revolucionario", "de última generación", y "profesional" o "experto" aplicados a nosotros.
- PROHIBIDO preguntarle si se siente identificado ("¿te pasa?", "¿te suena?"): la identificación la produce el detalle, y preguntarla la destruye.
- Cero emojis, cero signos de exclamación, máximo UN signo de interrogación en toda la serie, cero MAYÚSCULAS SOSTENIDAS (el énfasis lo pone la tipografía).

LO QUE SÍ SE ESCRIBE
- UN DATO CONCRETO POR FRAME: algo que se pueda contar, mirar o tocar (una hora, una cantidad, un objeto del negocio, un día). Un frame de puros adjetivos está vacío.
- EL TITULAR NOMBRA ALGO VISIBLE: una persona, un objeto ("el horno", "la libreta de la caja") o una acción física. Prohibidos los sujetos abstractos: "la digitalización", "los procesos", "la presencia online".
- CIFRAS CONTADAS A MANO: 47 pedidos, 22 minutos, 2 horas y media. Prohibidas las de folleto: "100%", "10x", "el doble", "miles de", y cualquier estadística de mercado sin fuente.
- IDIOMA DEL CLIENTE, NO EL NUESTRO: usa los verbos de su oficio (hornear, atender, agendar, despachar, cerrar la caja) y evita los nuestros (implementar, integrar, escalar, digitalizar, optimizar). Evita también la jerga: CRM, ERP, POS, API, landing.
- "tu negocio" como máximo una vez en toda la serie; en vez de "clientes", di quiénes son: los del sábado, los que preguntan precio, los que escriben de noche.

RITMO (lo que hace que no parezca plantilla)
- UNA IDEA POR FRAME: titular de 9 palabras o menos, máximo una coma. Si necesitas dos ideas, ahí había dos frames.
- RITMO DESPAREJO A PROPÓSITO: al menos un frame lleva un titular de 3 a 5 palabras, mucho más corto que el resto. Titulares todos del mismo largo = plantilla.
- EL SUB-COPY AGREGA INFORMACIÓN NUEVA y no repite ninguna palabra clave del titular de su propio frame. Si al borrar el titular el sub-copy dice lo mismo, está mal: esa repetición es la firma número uno del texto de máquina.
- NINGÚN FRAME EMPIEZA CON LA MISMA PALABRA que otro de la serie, ni repite la estructura del anterior.
- TODO FRAME QUE NO SEA EL ÚLTIMO CIERRA CON ALGO SIN RESOLVER: un dato que no cuadra, una hora que sigue corriendo. Y ningún frame intermedio resuelve la serie.
- UN SOLO TIEMPO VERBAL POR SERIE. Prohibidos los condicionales de venta: "podrías", "te ayudaría", "imagina que pudieras".

`;

const BLOQUE_HONESTIDAD = `HONESTIDAD (regla bloqueante):
- Si el usuario NO entregó un caso real verificado, el protagonista es un ESCENARIO ILUSTRATIVO. En ese caso está PROHIBIDO escribir "caso de éxito", "testimonio", "cliente real" o "resultados reales", y PROHIBIDO atribuirle cifras de resultado a WebMakerLatam ("le subimos las ventas un 300%").
- PROHIBIDO nombrar negocios, marcas o personas reales que existan.
- Las cifras del relato describen la situación del escenario (lo que se perdía, cuánto tardaba), nunca una promesa de resultado para quien mira.

`;const BLOQUE_CIERRE = `EL CIERRE (solo el último frame):
- El campo "cta" SOLO existe en el último frame. En todos los demás va vacío ("").
- Máximo 25 caracteres, un solo verbo, sin signos de exclamación, y sin repetir ninguna palabra que ya esté en el titular o el sub-copy de ese mismo frame.
- El cierre NUNCA introduce información nueva: remata lo que ya se contó.
- VETADOS como texto de cierre: "Hablemos por WhatsApp", "Escríbenos al WhatsApp", "Agenda hoy", "Contáctanos", "Más información", "Cotiza gratis", "Sígueme", "Dale like", "Comparte", "Guarda esto". WhatsApp solo se nombra si el tema de la historia es literalmente WhatsApp.
- Los "hashtags" van SOLO en el último frame (3 a 5, uno de marca). En el resto, cadena vacía ("").

`;

/** Modos de cierre: rotan para que la serie no termine siempre igual. */
export interface ModoCierre {
  id: string;
  peso: number;
  instruccion: string;
}

export const MODOS_CIERRE: ModoCierre[] = [
  {
    id: "puerta_abierta",
    peso: 3,
    instruccion: 'MODO DE CIERRE "puerta abierta": invita sin exigir, como quien deja la puerta entornada. Ejemplos de forma (no los copies literal): "Te muestro cómo quedó", "Lo mismo para lo tuyo", "Cuando quieras lo vemos".',
  },
  {
    id: "auto_revision",
    peso: 2,
    instruccion: 'MODO DE CIERRE "auto revisión": pídele algo a SU propio negocio, no a nosotros. Ejemplos de forma: "Revisa tu bandeja de hoy", "Cuenta los de esta semana", "Mira la hora del último".',
  },
  {
    id: "pregunta_espejo",
    peso: 2,
    instruccion: 'MODO DE CIERRE "pregunta espejo": una pregunta concreta y contestable sobre su negocio (no "¿te suena?"). Ejemplos de forma: "¿A qué hora dejaste de contestar?", "¿Cuántos quedaron sin abrir?".',
  },
  {
    id: "recurso",
    peso: 2,
    instruccion: 'MODO DE CIERRE "recurso": entrega algo antes de pedir nada. Ejemplos de forma: "Te reviso la web gratis", "Te calculo cuánto pierdes", "Pide el diagnóstico".',
  },
  {
    id: "sin_invitacion",
    peso: 3,
    instruccion: 'MODO DE CIERRE "sin invitación": el último titular es el remate y NO se pide nada. Devuelve "cta" como cadena VACÍA. Una serie que no pide nada es lo que hace creíbles a las que sí piden.',
  },
  {
    id: "directo",
    peso: 1,
    instruccion: 'MODO DE CIERRE "directo": el único que nombra el canal. Ejemplos de forma: "Escríbenos y lo vemos", "Cotiza tu caso", "Hablemos".',
  },
];

const MEMORIA_CIERRES = 3;
const ultimosCierres: string[] = [];

/** Elige el modo de cierre con rotación anti-repetición y pesos. */
export function resolverModoCierre(tipoHistoria?: string): ModoCierre {
  // Motivacional y comunidad rematan sin pedir nada por defecto.
  if ((tipoHistoria === "motivacional" || tipoHistoria === "comunidad") && Math.random() < 0.6) {
    const silencio = MODOS_CIERRE.find(m => m.id === "sin_invitacion")!;
    registrarCierre(silencio.id);
    return silencio;
  }
  const disponibles = MODOS_CIERRE.filter(m => !ultimosCierres.includes(m.id));
  const pool = disponibles.length > 0 ? disponibles : MODOS_CIERRE;
  const total = pool.reduce((acc, m) => acc + m.peso, 0);
  let r = Math.random() * total;
  for (const m of pool) {
    r -= m.peso;
    if (r <= 0) {
      registrarCierre(m.id);
      return m;
    }
  }
  const ultimo = pool[pool.length - 1]!;
  registrarCierre(ultimo.id);
  return ultimo;
}

function registrarCierre(id: string): void {
  ultimosCierres.push(id);
  if (ultimosCierres.length > MEMORIA_CIERRES) ultimosCierres.shift();
}

const PRUEBA_FINAL = `PRUEBA FINAL ANTES DE DEVOLVER EL JSON:
1. Lee los titulares seguidos, sin los sub-copy. ¿Se entiende una historia con principio, conflicto y final?
2. ¿Se pueden intercambiar dos frames de orden sin que se note?
Si la respuesta a la primera es NO, o a la segunda es SÍ, reescribe el guion completo — no parches un frame.
`;

/* ==================== Prompt del guion/* ==================== Prompt del guion =================================== */

export interface OpcionesGuion {
  tipoHistoria: string;
  concepto: string;
  formato: FormatoHistoria;
  arco: PasoNarrativo[];
  toneSuffix?: string;
  /** Ajuste libre del usuario (por ejemplo desde un reintento). */
  ajuste?: string | null;
  catalogoServicios: string;
  reglaIdioma: string;
  /** Modo de cierre elegido por el servidor (rotación anti-repetición). */
  modoCierre?: ModoCierre;
}

export function buildGuionSystemPrompt(opts: OpcionesGuion): string {
  return `Eres guionista de contenido de WebMakerLatam, una agencia digital que ayuda a emprendedores, pymes y empresas de Latinoamérica a crecer con tecnología. Escribes SERIES DE HISTORIAS verticales (stories) que la gente ve completas porque están bien contadas.

${opts.catalogoServicios}

${opts.reglaIdioma}

AUDIENCIA: dueños de negocio que NO son técnicos. Háblales de su negocio (clientes, tiempo, ventas, tranquilidad), nunca de tecnología por dentro.

${opts.formato.instruccionGuion}

${BLOQUE_NATURALIDAD}

${BLOQUE_HONESTIDAD}

${BLOQUE_CIERRE}${opts.modoCierre ? `${opts.modoCierre.instruccion}\n\n` : ""}

COHERENCIA DE LA SERIE (lo más importante):
- Escribes TODOS los frames de una vez: son UNA historia partida en capítulos, no ${opts.arco.length} publicaciones sueltas.
- Define un hilo conductor y respétalo: mismo protagonista, mismo negocio, mismas cifras y mismo tiempo verbal en toda la serie.
- Cada frame debe entenderse solo (la gente entra en cualquier punto), pero verlos en orden tiene que sumar algo que por separado no está.
- Prohibido que dos frames digan lo mismo con otras palabras.

LA IMAGEN DE CADA FRAME:
- "prompt_visual" dirige la ilustración de ESE frame: describe en UNA frase la pose y expresión de Webi (el zorro naranja de la marca) y como máximo 2 objetos de apoyo concretos del relato.
- La imagen debe avanzar con la historia: la pose del frame de tensión no puede ser la misma que la del cierre.
- JAMÁS pidas texto, letras ni números dentro de la ilustración.

${PRUEBA_FINAL}`;
}

export function buildGuionUserPrompt(opts: OpcionesGuion): string {
  const pasos = opts.arco
    .map((p, i) => `  Frame ${i + 1} — rol "${p.paso}": ${p.objetivo}${necesitaDato(p.layoutId) ? ' [ESTE FRAME LLEVA UNA CIFRA PROTAGONISTA: rellena "dato" y "dato_label"]' : ""}${sinSubCopy(p.layoutId) ? ' [este frame NO lleva sub_copy: deja "" y pon toda la fuerza en el titular]' : ""}`)
    .join("\n");

  const n = opts.arco.length;
  return `TIPO de historia: ${opts.tipoHistoria}
TEMA: "${opts.concepto}"
FORMATO NARRATIVO: ${opts.formato.nombre} — ${opts.formato.descripcionUi}

ARCO DE ${n} FRAME${n > 1 ? "S" : ""} (respeta el rol de cada uno, en orden):
${pasos}
${opts.ajuste ? `\nAJUSTE PEDIDO POR EL USUARIO (prioridad alta): ${opts.ajuste}\n` : ""}
LÍMITES DE LONGITUD (cuéntalos, se cortan sin piedad si te pasas):
- copy_principal: máximo ${LIMITES_GUION.titularCorto} caracteres (hasta ${LIMITES_GUION.titularLargo} en los frames sin sub_copy).
- sub_copy: máximo ${LIMITES_GUION.subCopy} caracteres.
- cta: máximo ${LIMITES_GUION.cta} caracteres, solo en el último frame.
- dato: máximo ${LIMITES_GUION.dato} caracteres (ej: "40", "72%", "3 h"). dato_label: máximo ${LIMITES_GUION.datoLabel}.

Devuelve SOLO este JSON, sin markdown ni explicaciones:
{
  "hilo": "el hilo conductor de la serie en una frase",
  "protagonista": "quién protagoniza (o cadena vacía si no aplica)",
  "frames": [
    {
      "numero": 1,
      "copy_principal": "...",
      "sub_copy": "...",
      "dato": "",
      "dato_label": "",
      "cta": "",
      "hashtags": "",
      "prompt_visual": "..."
    }
  ]
}
El array "frames" debe tener EXACTAMENTE ${n} elemento${n > 1 ? "s" : ""}, en orden.`;
}

function necesitaDato(layoutId: string): boolean {
  return Boolean(obtenerLayoutHistoria(layoutId)?.bloques.includes("dato_gigante"));
}

function sinSubCopy(layoutId: string): boolean {
  const l = obtenerLayoutHistoria(layoutId);
  if (!l) return false;
  return l.subCopyCenterY === null || !l.bloques.includes("subcopy");
}

/* ==================== Parseo y saneado =================================== */

function limpiar(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Palabras que no pueden quedar al final de un texto recortado: si el corte
 *  cae justo después de una de ellas, la frase queda colgando ("y", "de"…). */
const PALABRAS_COLGANTES = new Set([
  "y", "e", "o", "u", "ni", "que", "de", "del", "a", "al", "en", "con", "por",
  "para", "sin", "sobre", "tras", "el", "la", "los", "las", "un", "una", "unos",
  "unas", "lo", "su", "sus", "mi", "mis", "tu", "tus", "se", "le", "les", "me",
  "te", "nos", "es", "son", "fue", "era", "pero", "porque", "como", "cuando",
  "donde", "más", "mas", "muy", "ya", "no", "si", "sí", "desde", "hasta", "entre",
]);

/** Puntuación que no debe quedar suelta al principio o al final. */
function podarPuntuacion(texto: string): string {
  return texto
    .replace(/^[\s.,;:!?¡¿…—–\-·•)\]}]+/u, "")
    .replace(/[\s,;:—–\-·•(\[{]+$/u, "")
    .trim();
}

/**
 * Recorta un texto a `limite` caracteres SIN partir palabras.
 *
 * El recorte anterior era `texto.slice(0, limite)`, que cortaba a media letra
 * y dejaba titulares como "…el teléfono en si" — literalmente el "texto
 * cortado" que se veía en las historias. Aquí se corta en el último espacio
 * que quepa y se podan las palabras colgantes y la puntuación suelta.
 *
 * Si el texto es UNA sola palabra más larga que el límite se devuelve entera:
 * el motor de tipografía la achica hasta que quepa, y media palabra nunca es
 * mejor que una palabra chica.
 */
export function recortarLimpio(texto: string, limite: number): string {
  const t = limpiar(texto);
  if (t.length <= limite) return podarPuntuacion(t);

  const corte = t.lastIndexOf(" ", limite);
  if (corte <= 0) {
    // Una sola palabra. Si es de largo verosímil se devuelve ENTERA (el motor
    // de tipografía la achica hasta que quepa; media palabra nunca es mejor).
    // Muy por encima del límite ya no es una palabra sino basura, y ahí sí
    // conviene cortar antes que dejar un titular microscópico.
    return podarPuntuacion(t.length <= limite * 1.6 ? t : t.slice(0, limite));
  }

  let palabras = t.slice(0, corte).split(" ").filter(Boolean);
  while (
    palabras.length > 1 &&
    PALABRAS_COLGANTES.has(palabras[palabras.length - 1]!.toLowerCase().replace(/[^\p{L}]/gu, ""))
  ) {
    palabras.pop();
  }
  const recortado = podarPuntuacion(palabras.join(" "));
  // Si podar dejó casi nada, es preferible el corte por palabra sin podar.
  return recortado.length >= Math.min(8, limite) ? recortado : podarPuntuacion(t.slice(0, corte));
}

/** Quita las frases de relleno robótico si el modelo las coló igual. */
export function limpiarFrasesProhibidas(texto: string): string {
  let out = texto;
  for (const frase of FRASES_PROHIBIDAS) {
    const esc = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Límites Unicode: \b falla con acentos ("escribió" termina en carácter
    // que JS no considera de palabra), así que la frase quedaba sin limpiar.
    const re = new RegExp(
      `\\s*[.,;:—-]?\\s*(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])[.!¡]*`,
      "giu",
    );
    out = out.replace(re, " ");
  }
  out = podarPuntuacion(out.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1"));
  // Quitar la muletilla puede dejar la frase empezando en minúscula
  // ("Mira esto: ana perdía…"): se restituye la mayúscula inicial.
  if (out && texto.trim()[0] === texto.trim()[0]?.toUpperCase()) {
    out = out[0]!.toUpperCase() + out.slice(1);
  }
  return out;
}

/** Deja el "dato" como una cifra dibujable: si el modelo escribió palabras
 *  ("cuarenta") no hay cifra que mostrar y vale más no pintar el bloque que
 *  pintar "cuarent" recortado. Acepta 40, 72%, 1.250, 3 h, $2.500, 2x. */
export function sanearDato(valor: string): string {
  const v = limpiar(valor).replace(/\s+/g, " ");
  if (!v || !/\d/.test(v)) return "";
  const m = v.match(/^[$€]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?(?:%|x|h|k|K|M|min|hrs?|hs?)?$/u);
  return m ? v.slice(0, LIMITES_GUION.dato) : "";
}

/** Normaliza los hashtags: máximo 5, todos con #, sin duplicados ni basura. */
export function sanearHashtags(valor: string): string {
  const vistos = new Set<string>();
  const tags: string[] = [];
  for (const token of limpiar(valor).split(/[\s,]+/)) {
    const limpio = token.replace(/[^\p{L}\p{N}#_]/gu, "").replace(/^#+/, "");
    if (limpio.length < 2) continue;
    const clave = limpio.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    tags.push(`#${limpio}`);
    if (tags.length === 5) break;
  }
  return tags.join(" ");
}

/**
 * Parsea el JSON del guion de forma defensiva y lo alinea con el arco:
 * exactamente un frame por paso, límites aplicados, CTA/hashtags solo en el
 * cierre y frases robóticas eliminadas. Devuelve null si no hay nada usable.
 */
export function parseGuion(
  raw: string,
  arco: PasoNarrativo[],
  formatoId: string,
): GuionHistoria | null {
  const cleaned = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const rec = obj as Record<string, unknown>;
  const framesRaw = Array.isArray(rec.frames) ? rec.frames : [];
  if (framesRaw.length === 0) return null;

  const ultimo = arco.length - 1;
  const frames: FrameGuion[] = arco.map((paso, i) => {
    const f = (framesRaw[i] ?? framesRaw[framesRaw.length - 1] ?? {}) as Record<string, unknown>;
    const esCierre = i === ultimo;
    const layout = obtenerLayoutHistoria(paso.layoutId) ?? layoutHistoriaPorDefecto();

    // Recorte SIEMPRE por palabra: cortar a media letra era lo que producía los
    // "textos cortados" que se veían en las historias generadas.
    const titular = recortarLimpio(
      limpiarFrasesProhibidas(limpiar(f.copy_principal)),
      limiteTitular(paso.layoutId),
    );
    const sub = sinSubCopy(paso.layoutId)
      ? ""
      : recortarLimpio(limpiarFrasesProhibidas(limpiar(f.sub_copy)), LIMITES_GUION.subCopy);
    const dato = necesitaDato(paso.layoutId) ? sanearDato(limpiar(f.dato)) : "";

    return {
      numero: i + 1,
      paso: paso.paso,
      layoutId: layout.id,
      copy_principal: titular,
      sub_copy: sub,
      dato,
      // Sin cifra válida no hay etiqueta que explicar.
      dato_label: dato ? recortarLimpio(limpiar(f.dato_label), LIMITES_GUION.datoLabel) : "",
      // CTA y hashtags SOLO en el cierre: es lo que mataba la naturalidad.
      cta: esCierre ? recortarLimpio(limpiarFrasesProhibidas(limpiar(f.cta)), LIMITES_GUION.cta) : "",
      hashtags: esCierre ? sanearHashtags(limpiar(f.hashtags)) : "",
      prompt_visual: recortarLimpio(limpiar(f.prompt_visual), LIMITES_GUION.promptVisual),
    };
  });

  // Sin titulares no hay guion utilizable.
  if (!frames.some(f => f.copy_principal)) return null;

  return {
    hilo: limpiar(rec.hilo),
    protagonista: limpiar(rec.protagonista),
    formatoId,
    frames,
  };
}

/**
 * Aplica a un frame ya construido las MISMAS reglas que a uno recién parseado.
 *
 * Hace falta porque un frame puede llegar por otra puerta —el reintento de un
 * frame suelto, un borrador guardado, el texto que el usuario editó a mano— y
 * esos caminos se saltaban el saneado: sin esto, un titular largo escrito en la
 * UI llegaba al renderizador sin recortar y una cifra en palabras se dibujaba
 * partida.
 */
export function sanearFrameGuion(frame: FrameGuion): FrameGuion {
  const layout = obtenerLayoutHistoria(frame.layoutId) ?? layoutHistoriaPorDefecto();
  const llevaDato = layout.bloques.includes("dato_gigante");
  const dato = llevaDato ? sanearDato(frame.dato) : "";
  return {
    ...frame,
    layoutId: layout.id,
    copy_principal: recortarLimpio(
      limpiarFrasesProhibidas(limpiar(frame.copy_principal)),
      limiteTitular(layout.id),
    ),
    sub_copy: sinSubCopy(layout.id)
      ? ""
      : recortarLimpio(limpiarFrasesProhibidas(limpiar(frame.sub_copy)), LIMITES_GUION.subCopy),
    dato,
    dato_label: dato ? recortarLimpio(limpiar(frame.dato_label), LIMITES_GUION.datoLabel) : "",
    cta: recortarLimpio(limpiarFrasesProhibidas(limpiar(frame.cta)), LIMITES_GUION.cta),
    hashtags: sanearHashtags(frame.hashtags),
    prompt_visual: recortarLimpio(limpiar(frame.prompt_visual), LIMITES_GUION.promptVisual),
  };
}

/** Problemas de calidad que justifican pedirle al modelo una segunda pasada. */
export function revisarGuion(guion: GuionHistoria, arco: PasoNarrativo[]): string[] {
  const issues: string[] = [];
  const titulares = guion.frames.map(f => f.copy_principal.toLowerCase().trim());

  for (const [i, f] of guion.frames.entries()) {
    if (!f.copy_principal) issues.push(`el frame ${i + 1} se quedó sin titular`);
    if (necesitaDato(f.layoutId) && !f.dato) {
      issues.push(
        `el frame ${i + 1} necesita una cifra protagonista en "dato" escrita con NÚMEROS (40, 72%, 3 h) y llegó vacía o en palabras`,
      );
    }
    if (!sinSubCopy(f.layoutId) && !f.sub_copy) {
      issues.push(`el frame ${i + 1} necesita sub_copy y llegó vacío`);
    }
    if (!f.prompt_visual) issues.push(`el frame ${i + 1} no trae prompt_visual`);
  }

  // Titulares repetidos = la serie no avanza.
  const vistos = new Set<string>();
  for (const [i, t] of titulares.entries()) {
    if (!t) continue;
    if (vistos.has(t)) issues.push(`el titular del frame ${i + 1} repite uno anterior`);
    vistos.add(t);
  }

  const cierre = guion.frames[arco.length - 1];
  if (cierre && !cierre.cta) issues.push("el frame de cierre se quedó sin invitación (cta)");
  return issues;
}
