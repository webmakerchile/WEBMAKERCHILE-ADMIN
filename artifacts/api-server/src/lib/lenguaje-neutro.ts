// Español neutro latinoamericano para TODO el contenido generado.
//
// La regla vivía solo dentro del prompt, y un prompt es una petición, no una
// garantía: se coló "empalmadas" (España) en historias ya publicables. Aquí la
// regla se refuerza Y se añade una capa determinista que corrige el texto
// después de generarlo, igual que se hace con las frases de relleno.
//
// Criterio de marca: neutro pero no acartonado. Se admiten giros coloquiales
// mientras se entiendan de México a Chile; lo que no se admite es vocabulario
// atado a UN país — ni de España ni de ningún país de la región.

/* ==================== Regla para el prompt =============================== */

export const REGLA_ESPANOL_NEUTRO = `IDIOMA — REGLA OBLIGATORIA E INNEGOCIABLE:
- Escribe SIEMPRE en español NEUTRO LATINOAMERICANO: el que entiende igual alguien de México, Colombia, Perú, Argentina o Chile.
- Trata SIEMPRE al lector de "tú" (tuteo estándar): "tú vendes", "tu negocio", "tienes", "necesitas", "configura", "conecta".
- PROHIBIDO EL ESPAÑOL DE ESPAÑA. Nada de "empalmar/empalmadas", "ordenador", "móvil" (usa celular), "coche", "vale", "guay", "chaval", "currar", "molar", "flipar", "zumo", "aparcar", "piso" (por departamento), "tío/tía" (por amigo), "a por", "coger" (usa tomar), "gilipollas", "hostia", "joder". NUNCA uses "vosotros", "vuestro" ni el verbo en segunda del plural ("tenéis", "sabéis").
- PROHIBIDO el voseo argentino/uruguayo: nada de "vos", "tenés", "podés", "querés", "sabés", "hacés", "decís", "mirá", "fijate", "che". Los imperativos van sin voseo: "enfócate", "fíjate", "ve", "ven".
- PROHIBIDO el modismo atado a UN país: nada de "po", "cachái", "weón" (Chile), "órale", "padrísimo", "chamba" (México), "chévere", "parcero" (Colombia), "pana" (Venezuela).
- SÍ puedes ser coloquial y cálido si el giro se entiende en toda la región: "de una", "sin vueltas", "a la mano", "de entrada", "al final del día", "por las puras".
- Vocabulario universal: computadora o PC, celular o teléfono, dinero (no plata/lana/pasta), trabajo (no chamba/pega/curro), auto (no coche/carro si puedes evitarlo), departamento (no piso), enlazar o conectar (NUNCA empalmar).
- Acentos correctos siempre (estás, más, también, número, fácil, rápido, según).
`;

/* ==================== Capa determinista ================================== */

/**
 * Españolismos INEQUÍVOCOS y su equivalente neutro.
 *
 * Solo entran aquí los términos que en LATAM no tienen otro significado, para
 * que el reemplazo automático nunca cambie el sentido. Los ambiguos ("piso"
 * es superficie, "vale" es "vale la pena", "pasta" es comida) NO se tocan: se
 * quedan solo en la prohibición del prompt, donde el modelo tiene contexto
 * para decidir. Corregir de más sería peor que el problema.
 */
const ESPANOLISMOS: Array<[RegExp, string]> = [
  // El que motivó todo esto: "empalmar" en LATAM es unir tubos o cables.
  [/\bempalmad(o|a)s\b/gi, "enlazad$1s"],
  [/\bempalmad(o|a)\b/gi, "enlazad$1"],
  [/\bempalmamos\b/gi, "enlazamos"],
  [/\bempalman\b/gi, "enlazan"],
  [/\bempalma\b/gi, "enlaza"],
  [/\bempalmes?\b/gi, "enlace"],
  [/\bempalmar\b/gi, "enlazar"],
  // Tecnología y objetos. OJO con el género: el reemplazo NO puede romper la
  // concordancia con el artículo o el adjetivo que ya escribió el modelo
  // ("el ordenador" -> "el computadora" sería peor que el españolismo). Por eso
  // se elige siempre un equivalente del MISMO género, y los términos sin
  // equivalente del mismo género se dejan solo en la prohibición del prompt.
  [/\bordenadores\b/gi, "computadores"],
  [/\bordenador\b/gi, "computador"],
  [/\bmóviles\b/gi, "celulares"],
  // "móvil" como adjetivo es correcto ("diseño móvil"): solo se cambia cuando
  // viene con artículo, que es cuando significa teléfono.
  [/\b(el|un|tu|su|mi|del|al)\s+móvil\b/gi, "$1 celular"],
  [/\bcoches\b/gi, "autos"],
  [/\bcoche\b/gi, "auto"],
  [/\bzumos?\b/gi, "jugo"],
  // Acciones y personas.
  [/\baparcar\b/gi, "estacionar"],
  [/\bchavalas?\b/gi, "joven"],
  [/\bchavales\b/gi, "jóvenes"],
  [/\bchaval\b/gi, "joven"],
  [/\bcurrar\b/gi, "trabajar"],
  [/\bcurro\b/gi, "trabajo"],
  [/\bmolan\b/gi, "gustan"],
  [/\bmola\b/gi, "gusta"],
  [/\bmolar\b/gi, "gustar"],
  [/\bflipante\b/gi, "sorprendente"],
  [/\bflipar\b/gi, "sorprenderse"],
  [/\bguay\b/gi, "genial"],
  [/\bcutres?\b/gi, "de mala calidad"],
  // Segunda persona del plural: en LATAM no existe.
  [/\bvosotros\b/gi, "ustedes"],
  [/\bvosotras\b/gi, "ustedes"],
  [/\bvuestr(o|a)s\b/gi, "sus"],
  [/\bvuestr(o|a)\b/gi, "su"],
  // Giros.
  [/\ba por\b/gi, "por"],
];

/** Palabras que delatan España pero NO se reemplazan solas (son ambiguas en
 *  LATAM): se detectan para pedirle al modelo que reescriba con contexto. */
const ESPANOLISMOS_AMBIGUOS = [
  "vale", "venga", "tío", "tía", "pasta", "piso", "movida", "majo", "chulo",
  "coger", "apetece", "apetecer", "liarse", "follón", "curra", "chollo",
];

/** Conserva la capitalización del original al sustituir. */
function conservarCaja(original: string, reemplazo: string): string {
  if (original === original.toUpperCase() && original.length > 1) return reemplazo.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return reemplazo[0]!.toUpperCase() + reemplazo.slice(1);
  }
  return reemplazo;
}

/**
 * Reemplaza los españolismos inequívocos por su equivalente neutro.
 *
 * Determinista y sin llamadas al modelo: el prompt pide el idioma correcto,
 * pero esta capa es la que lo garantiza. Se aplica a TODO el copy que llega al
 * usuario, venga de donde venga.
 */
export function neutralizarEspanolismos(texto: string): string {
  let out = texto;
  for (const [patron, reemplazo] of ESPANOLISMOS) {
    out = out.replace(patron, (match, ...grupos) => {
      // Reconstruir el reemplazo con los grupos capturados ($1, $2…).
      const resuelto = reemplazo.replace(/\$(\d)/g, (_, n) => String(grupos[Number(n) - 1] ?? ""));
      return conservarCaja(match, resuelto);
    });
  }
  return out;
}

/**
 * Devuelve los españolismos ambiguos que aparecen en el texto, para pedirle al
 * modelo una segunda pasada. No se corrigen solos porque en LATAM significan
 * otra cosa ("piso" es el suelo, "vale la pena" es correcto).
 */
export function detectarEspanolismos(texto: string): string[] {
  const encontrados: string[] = [];
  for (const palabra of ESPANOLISMOS_AMBIGUOS) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${palabra}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(texto)) encontrados.push(palabra);
  }
  return encontrados;
}

/**
 * Aplica la neutralización a todas las cadenas de una estructura anidada.
 *
 * Las descripciones por red llegan como un objeto de forma libre que el modelo
 * arma (instagram.post_completo, linkedin.hashtags, …); recorrerlo entero
 * evita tener que enumerar cada campo y olvidarse de uno.
 */
export function neutralizarProfundo<T>(valor: T): T {
  if (typeof valor === "string") return neutralizarEspanolismos(valor) as unknown as T;
  if (Array.isArray(valor)) return valor.map(v => neutralizarProfundo(v)) as unknown as T;
  if (valor && typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = neutralizarProfundo(v);
    }
    return out as unknown as T;
  }
  return valor;
}
