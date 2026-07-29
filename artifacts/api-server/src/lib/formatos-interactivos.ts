// Formatos interactivos: contenido con el que la gente PUEDE hacer algo.
//
// Los "tipos de contenido" que había (tutorial, tip, reflexión, comunidad,
// lanzamiento) no cambiaban nada del resultado: los cinco producían la misma
// pieza con otro texto. Elegir uno u otro daba igual, y lo que salía siempre
// era una frase que se lee y se pasa de largo.
//
// Aquí cada formato define TRES cosas, y por eso sí cambia el resultado:
//
//  1. Qué le pedimos a la IA (`campos`): una encuesta necesita pregunta y dos
//     opciones; un quiz necesita cuatro y saber cuál es la correcta. Son
//     estructuras distintas, no el mismo texto con otro nombre.
//  2. Cómo se DIBUJA el elemento interactivo (`bloque`): la tarjeta de la
//     encuesta, la lista de opciones, la caja de preguntas. Se compone con
//     SVG y fuentes reales, igual que los titulares — nunca se le pide al
//     modelo de imagen que escriba texto, porque no sabe.
//  3. Qué aspecto tiene (`vistaPrevia`): la forma exacta del layout, para que
//     el selector muestre una portada identificable de cada formato en vez de
//     un emoji.

export type CampoFormato =
  | "pregunta"
  | "opciones"
  | "correcta"
  | "afirmacion"
  | "veredicto"
  | "explicacion"
  | "items"
  | "izquierda"
  | "derecha"
  | "invitacion"
  | "dato"
  | "frase";

/** Forma del elemento interactivo que se compone sobre la ilustración. */
export type BloqueInteractivo =
  | "tarjeta_opciones"   // tarjeta blanca con opciones apiladas (encuesta / quiz)
  | "duelo"              // dos mitades enfrentadas (esto o aquello)
  | "veredicto"          // afirmación + sello VERDADERO/FALSO
  | "checklist"          // lista con casillas (test rápido / reto)
  | "caja_pregunta"      // campo de texto tipo sticker de preguntas
  | "hueco"              // frase con un espacio en blanco
  | "escala";            // barra de 1 a 5 con marcador

export interface FormatoInteractivo {
  id: string;
  nombre: string;
  /** Qué consigue, en términos de lo que hace la gente. */
  gancho: string;
  /** Para qué sirve, en una línea, en el selector. */
  descripcion: string;
  bloque: BloqueInteractivo;
  /** Campos que la IA tiene que escribir. El orden es el del prompt. */
  campos: CampoFormato[];
  /** Cuántas opciones pide, si el formato las usa. */
  opciones?: number;
  /**
   * Rótulos fijos de los dos lados de un duelo.
   *
   * En "Mito vs realidad" los lados NO son intercambiables, y sin rótulo la
   * pieza queda ambigua: se ven dos frases enfrentadas y nadie sabe cuál es
   * la que hay que creer. En "Esto o aquello" sí lo son, y rotularlos sobraría.
   */
  etiquetas?: readonly [string, string];
  /**
   * Los ítems son pasos en orden, no señales sueltas.
   *
   * Un reto se hace en secuencia, así que van numerados; un test rápido se
   * marca en cualquier orden, así que van con casilla.
   */
  ordenado?: boolean;
  /** Instrucción específica para el redactor. */
  guia: string;
  /** Llamada a la acción por defecto del formato. */
  cta: string;
  /**
   * Si Instagram tiene un sticker nativo equivalente, se dice: la pieza deja
   * el hueco y quien publica lo pega encima para que la respuesta sea real.
   */
  stickerIg: string | null;
}

export const FORMATOS_INTERACTIVOS: FormatoInteractivo[] = [
  {
    id: "encuesta",
    nombre: "Encuesta",
    gancho: "Dos opciones y un toque: la respuesta más fácil que existe",
    descripcion: "Una pregunta cerrada con dos opciones. Lo que más responde la gente.",
    bloque: "tarjeta_opciones",
    campos: ["pregunta", "opciones"],
    opciones: 2,
    guia: "La pregunta va en SEGUNDA persona y se responde sin pensar (sí/no, esto/aquello). Tiene que dividir a la audiencia: si el 95% va a responder lo mismo, no sirve. Las dos opciones, máximo 3 palabras cada una.",
    cta: "Responde y te digo qué hacer con tu resultado",
    stickerIg: "Encuesta",
  },
  {
    id: "quiz",
    nombre: "Quiz",
    gancho: "Una pregunta con truco y la respuesta que sorprende",
    descripcion: "Pregunta con 3 opciones y una correcta. Enseña algo en 5 segundos.",
    bloque: "tarjeta_opciones",
    campos: ["pregunta", "opciones", "correcta", "explicacion"],
    opciones: 3,
    guia: "La respuesta correcta tiene que sorprender: si es la obvia, no hay quiz. Las otras dos opciones son creíbles, no de relleno. La explicación son máximo 2 frases y es lo que la persona se lleva.",
    cta: "¿Le achuntaste? La respuesta va en el siguiente",
    stickerIg: "Quiz",
  },
  {
    id: "verdadero_falso",
    nombre: "Verdadero o Falso",
    gancho: "Una creencia común puesta a prueba",
    descripcion: "Una afirmación que mucha gente cree, y el veredicto con su porqué.",
    bloque: "veredicto",
    campos: ["afirmacion", "veredicto", "explicacion"],
    guia: "La afirmación es algo que un dueño de negocio DICE de verdad ('con Instagram me basta'). El veredicto es VERDADERO o FALSO, sin medias tintas, y la explicación lo justifica en 2 frases con un dato o un caso.",
    cta: "¿Lo creías? Cuéntame",
    stickerIg: "Quiz",
  },
  {
    id: "esto_o_aquello",
    nombre: "Esto o aquello",
    gancho: "Dos caminos, elige uno",
    descripcion: "Dos alternativas enfrentadas cara a cara. Genera debate en comentarios.",
    bloque: "duelo",
    campos: ["pregunta", "izquierda", "derecha"],
    guia: "Las dos alternativas tienen que ser DEFENDIBLES: si una es claramente mejor no hay debate. Máximo 4 palabras cada lado. Que sea una decisión real de un negocio, no una trivialidad.",
    cta: "¿Cuál eliges tú?",
    stickerIg: "Encuesta",
  },
  {
    id: "caja_preguntas",
    nombre: "Caja de preguntas",
    gancho: "Que te pregunten lo que quieran",
    descripcion: "Abre el turno de preguntas sobre un tema concreto.",
    bloque: "caja_pregunta",
    campos: ["invitacion", "explicacion"],
    guia: "La invitación acota el tema — 'pregúntame lo que quieras' a secas no recibe nada. Tiene que dar permiso a preguntar algo que da vergüenza preguntar ('sí, también las preguntas básicas').",
    cta: "Escríbeme tu pregunta",
    stickerIg: "Preguntas",
  },
  {
    id: "test_rapido",
    nombre: "Test rápido",
    gancho: "Cuenta cuántas te pasan a ti",
    descripcion: "Lista de señales para marcar. El resultado se lo da la propia persona.",
    bloque: "checklist",
    campos: ["pregunta", "items", "explicacion"],
    opciones: 4,
    guia: "Cada señal se reconoce al instante y describe algo que PASA, no una opinión ('respondes mensajes después de las 10 pm'). La explicación dice qué significa marcar varias.",
    cta: "¿Cuántas marcaste?",
    stickerIg: null,
  },
  {
    id: "reto",
    nombre: "Reto",
    gancho: "Algo que se puede hacer hoy mismo",
    descripcion: "Un desafío corto y concreto, con pasos que caben en un día.",
    bloque: "checklist",
    campos: ["pregunta", "items", "explicacion"],
    opciones: 3,
    ordenado: true,
    guia: "Los pasos son ACCIONES de menos de 15 minutos cada una, en imperativo, que se pueden hacer sin contratar a nadie, y van EN ORDEN: el segundo se hace después del primero. Nada de 'define tu estrategia'.",
    cta: "Hazlo hoy y cuéntame cómo te fue",
    stickerIg: null,
  },
  {
    id: "mitos",
    nombre: "Mito vs realidad",
    gancho: "Lo que todos repiten, y lo que pasa de verdad",
    descripcion: "Enfrenta una creencia extendida con lo que ocurre en la práctica.",
    bloque: "duelo",
    campos: ["pregunta", "izquierda", "derecha", "explicacion"],
    etiquetas: ["MITO", "REALIDAD"],
    guia: "A la izquierda el mito tal como se dice en la calle; a la derecha la realidad, concreta y con una cifra o un caso si se puede. Nada de 'depende'.",
    cta: "¿Cuál habías escuchado?",
    stickerIg: null,
  },
  {
    id: "completa_frase",
    nombre: "Completa la frase",
    gancho: "Deja el hueco y que lo llenen",
    descripcion: "Una frase con un espacio en blanco que cada quien completa.",
    bloque: "hueco",
    campos: ["frase", "explicacion"],
    guia: "La frase tiene que tener UN solo hueco, al final, y admitir muchas respuestas distintas. Que hable de la experiencia de tener un negocio, no de la agencia.",
    cta: "Complétala en los comentarios",
    stickerIg: "Preguntas",
  },
  {
    id: "adivina_dato",
    nombre: "Adivina el dato",
    gancho: "Una cifra que nadie acierta",
    descripcion: "Pregunta por un número real del rubro y revela cuánto es.",
    bloque: "escala",
    campos: ["pregunta", "dato", "explicacion"],
    guia: "El dato es un número REAL y verificable del rubro; si no tienes uno cierto, no inventes: cambia de formato. La gracia está en que la cifra real sorprenda.",
    cta: "¿Te acercaste?",
    stickerIg: "Deslizador",
  },
];

export function obtenerFormatoInteractivo(id: string | null | undefined): FormatoInteractivo | null {
  if (!id) return null;
  return FORMATOS_INTERACTIVOS.find((f) => f.id === id) ?? null;
}

/** Catálogo para la UI, sin la guía interna del redactor. */
export function listarFormatosInteractivos() {
  return FORMATOS_INTERACTIVOS.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    gancho: f.gancho,
    descripcion: f.descripcion,
    bloque: f.bloque,
    opciones: f.opciones ?? 0,
    // El selector dibuja la portada con estos mismos datos, así que tienen que
    // viajar: si no, la portada de "Mito vs realidad" saldría sin sus rótulos
    // y sería idéntica a la de "Esto o aquello".
    etiquetas: f.etiquetas ? [...f.etiquetas] : null,
    ordenado: f.ordenado === true,
    marcaCorrecta: f.campos.includes("correcta"),
    stickerIg: f.stickerIg,
  }));
}

/* ==================== Lo que escribe la IA ============================== */

export interface ContenidoInteractivo {
  /** Titular corto que va arriba, sobre la ilustración. */
  titular: string;
  pregunta: string;
  opciones: string[];
  /** Índice de la opción correcta en `opciones`; -1 si el formato no la usa. */
  correcta: number;
  afirmacion: string;
  /** "VERDADERO" | "FALSO" */
  veredicto: string;
  explicacion: string;
  items: string[];
  izquierda: string;
  derecha: string;
  invitacion: string;
  dato: string;
  frase: string;
  cta: string;
}

const vacio = (): ContenidoInteractivo => ({
  titular: "", pregunta: "", opciones: [], correcta: -1, afirmacion: "",
  veredicto: "", explicacion: "", items: [], izquierda: "", derecha: "",
  invitacion: "", dato: "", frase: "", cta: "",
});

const txt = (v: unknown, max: number): string =>
  (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);

const lista = (v: unknown, max: number, maxItem: number): string[] =>
  Array.isArray(v) ? v.map((x) => txt(x, maxItem)).filter(Boolean).slice(0, max) : [];

/**
 * Parsea y SANEA lo que devolvió el modelo para un formato concreto.
 *
 * Devuelve null si falta lo esencial de ese formato. Una encuesta sin opciones
 * no es una encuesta a medias: es una imagen con una pregunta que no se puede
 * responder, y dejarla pasar en verde es peor que fallar.
 */
export function parseContenidoInteractivo(
  raw: string,
  formato: FormatoInteractivo,
): ContenidoInteractivo | null {
  const limpio = String(raw).trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown = null;
  try {
    obj = JSON.parse(limpio);
  } catch {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { obj = JSON.parse(m[0]); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;

  const c = vacio();
  c.titular = txt(r.titular, 70);
  c.pregunta = txt(r.pregunta, 120);
  c.afirmacion = txt(r.afirmacion, 140);
  c.explicacion = txt(r.explicacion, 240);
  c.izquierda = txt(r.izquierda, 40);
  c.derecha = txt(r.derecha, 40);
  c.invitacion = txt(r.invitacion, 120);
  c.dato = txt(r.dato, 24);
  c.frase = txt(r.frase, 120);
  c.cta = txt(r.cta, 60) || formato.cta;

  const veredicto = txt(r.veredicto, 12).toUpperCase();
  c.veredicto = veredicto.startsWith("V") ? "VERDADERO" : veredicto.startsWith("F") ? "FALSO" : "";

  c.opciones = lista(r.opciones, formato.opciones ?? 4, 44);
  c.items = lista(r.items, formato.opciones ?? 5, 80);

  const correcta = Number(r.correcta);
  c.correcta = Number.isInteger(correcta) && correcta >= 0 && correcta < c.opciones.length ? correcta : -1;

  return contenidoCompleto(c, formato) ? c : null;
}

/** ¿Tiene lo mínimo para que la pieza se pueda responder? */
export function contenidoCompleto(c: ContenidoInteractivo, formato: FormatoInteractivo): boolean {
  for (const campo of formato.campos) {
    switch (campo) {
      case "pregunta": if (!c.pregunta) return false; break;
      case "opciones": if (c.opciones.length < Math.max(2, formato.opciones ?? 2)) return false; break;
      case "correcta": if (c.correcta < 0) return false; break;
      case "afirmacion": if (!c.afirmacion) return false; break;
      case "veredicto": if (!c.veredicto) return false; break;
      case "explicacion": if (!c.explicacion) return false; break;
      case "items": if (c.items.length < Math.max(2, formato.opciones ?? 3)) return false; break;
      case "izquierda": if (!c.izquierda) return false; break;
      case "derecha": if (!c.derecha) return false; break;
      case "invitacion": if (!c.invitacion) return false; break;
      case "dato": if (!c.dato) return false; break;
      case "frase": if (!c.frase) return false; break;
    }
  }
  return true;
}

/** El titular que se pinta arriba, con respaldo si la IA no lo escribió. */
export function titularDe(c: ContenidoInteractivo, formato: FormatoInteractivo): string {
  // La afirmación NO es un titular alternativo: es lo que el sello está
  // juzgando, y el bloque solo dibuja la palabra VERDADERO o FALSO. Si el
  // modelo escribe además un titular y se prefiriera ese, la afirmación no
  // aparecería en ninguna parte y quedaría un sello sin nada que sellar.
  if (formato.bloque === "veredicto") return c.afirmacion || c.titular;
  if (c.titular) return c.titular;
  if (formato.bloque === "caja_pregunta") return c.invitacion;
  if (formato.bloque === "hueco") return "Completa la frase";
  return c.pregunta;
}

/* ==================== Prompt del redactor =============================== */

const EJEMPLO_CAMPO: Record<CampoFormato, string> = {
  pregunta: '"pregunta": "la pregunta, máximo 12 palabras"',
  opciones: '"opciones": ["opción 1", "opción 2"]',
  correcta: '"correcta": 0,  // índice (empezando en 0) de la opción correcta',
  afirmacion: '"afirmacion": "la creencia puesta a prueba"',
  veredicto: '"veredicto": "VERDADERO" o "FALSO"',
  explicacion: '"explicacion": "máximo 2 frases con el porqué"',
  items: '"items": ["señal 1", "señal 2", "señal 3"]',
  izquierda: '"izquierda": "opción de la izquierda, máx 4 palabras"',
  derecha: '"derecha": "opción de la derecha, máx 4 palabras"',
  invitacion: '"invitacion": "sobre qué pueden preguntar"',
  dato: '"dato": "la cifra real, corta (ej: 73%)"',
  frase: '"frase": "la frase con un ___ al final"',
};

/**
 * Prompt para escribir el contenido de un formato interactivo.
 *
 * Se le pide EXACTAMENTE los campos de ese formato. Un prompt genérico
 * devolvía siempre lo mismo, que es la razón por la que elegir "tutorial" o
 * "reflexión" antes no cambiaba nada.
 */
export function buildPromptInteractivo(
  formato: FormatoInteractivo,
  tema: string,
  idea?: string,
): string {
  const campos = [...formato.campos, "explicacion" as CampoFormato]
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((c) => `  ${EJEMPLO_CAMPO[c]}`)
    .join(",\n");

  return `Eres el community manager de WebMakerLatam, una agencia digital para pymes y emprendedores de LATAM. Escribes para dueños de negocio que NO son técnicos.

Vas a escribir una pieza del formato "${formato.nombre}": ${formato.gancho}.

TEMA: "${tema}"
${idea ? `CONTEXTO que dio el equipo: "${idea}"\n` : ""}
CÓMO SE ESCRIBE ESTE FORMATO:
${formato.guia}

REGLAS QUE NO SE NEGOCIAN:
- Español NEUTRO de LATAM. Nada de "vale", "chaval", "ordenador", "móvil", "coger" ni voseo español.
- Habla de BENEFICIOS DE NEGOCIO (vender más, ahorrar tiempo, atender sin estar), nunca de tecnología por la tecnología.
- Cero emojis dentro de los textos: la pieza los dibuja aparte.
- Nada de "desliza", "link en bio", "dale like" ni fórmulas de manual tipo "¿Sabías que...?".
- Si el formato pide una cifra, tiene que ser REAL. Si no tienes una cierta, escribe una que sea verificable y de conocimiento común, nunca inventada con decimales falsos.
- La pieza tiene que poder RESPONDERSE mirándola: si alguien no sabe qué hacer al verla, está mal escrita.

Devuelve EXCLUSIVAMENTE este JSON, sin markdown ni backticks:
{
  "titular": "el gancho que va arriba, máximo 8 palabras, en mayúsculas o normal",
${campos},
  "cta": "la invitación final, máximo 8 palabras"
}`;
}
