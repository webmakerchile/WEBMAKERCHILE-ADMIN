// "Escribir con IA" para Posts IA (carruseles y publicaciones únicas).
//
// Portadas ya tenía este botón y es lo que hace usable el generador: el
// compañero cuenta la idea a lo bruto y la IA la redacta y le propone el set
// (luz, pose, utilería, estilo) para que solo revise. Aquí falta ese paso, así
// que la única entrada era un "Tema del día" en frío.
//
// No se reutiliza el de Portadas porque su prompt pide un TÍTULO DE MINIATURA
// de 5-6 palabras para un video: un carrusel necesita un tema que dé para
// varias slides, y la pose la elige el rol de cada slide salvo que se fije.
//
// El parseo vive aquí, fuera de la ruta, para poder probarlo sin llamar al
// modelo: es la parte que se rompe (JSON con fences, ids inventados).

export const TEMA_MAX = 160;
export const IDEA_MAX = 600;
export const UTILERIA_MAX = 200;
export const ESTILO_MAX = 120;

export interface OpcionCatalogo {
  id: string;
  nombre: string;
  descripcion?: string;
}

export interface IdeaPostRedactada {
  tema: string;
  idea: string;
  utileria: string;
  estiloExtra: string;
  /** id validado contra el catálogo; "" si la IA no propuso uno válido. */
  direccionId: string;
  poseId: string;
  estiloTitularId: string;
}

export function buildRedactarIdeaPostPrompt(
  tema: string,
  ideaBruta: string,
  catalogos: {
    direcciones: OpcionCatalogo[];
    poses: OpcionCatalogo[];
    estilosTitular: OpcionCatalogo[];
  },
  opts?: { tipoContenido?: string; tipoPublicacion?: "unica" | "carrusel"; destino?: "post" | "historia" },
): string {
  const lista = (items: OpcionCatalogo[]) =>
    items.map((i) => `  - "${i.id}": ${i.nombre}${i.descripcion ? ` — ${i.descripcion}` : ""}`).join("\n");

  const esHistoria = opts?.destino === "historia";
  const esCarrusel = !esHistoria && opts?.tipoPublicacion === "carrusel";
  const pieza = esHistoria
    ? "una HISTORIA vertical 9:16 para Instagram/TikTok (se ve a pantalla completa unos segundos)"
    : esCarrusel
      ? "un CARRUSEL de Instagram (varias slides 1:1 cuadradas que se recorren deslizando)"
      : "una PUBLICACIÓN ÚNICA cuadrada para redes";

  return `Eres el redactor creativo de WebMaker (agencia digital para pymes y emprendedores de LATAM). Un compañero escribió a lo bruto la idea para ${pieza}${opts?.tipoContenido ? ` del tipo "${opts.tipoContenido}"` : ""}.

El estilo visual de la marca es fijo: un estudio fotográfico en penumbra iluminado por un foco, con el zorro Webi como protagonista y utilería física real apoyada en el set — nunca stickers, iconos ni símbolos flotantes.

Tu tarea: redactar mejor su idea CONSERVANDO el tema que él quiso contar (no inventes otro tema), y proponerle el set completo para que solo revise y ajuste.

Devuelve EXCLUSIVAMENTE JSON válido (sin markdown, sin backticks) con esta forma exacta:
{ "tema": "...", "idea": "...", "utileria": "...", "estiloExtra": "...", "direccionId": "...", "poseId": "...", "estiloTitularId": "..." }

Reglas:
- "tema": el tema de la pieza en una frase de máximo 14 palabras, en español neutro de LATAM (nada de "vale", "chaval", "ordenador", "móvil" ni voseo español). Sin emojis, sin comillas internas, sin punto final.${
    esCarrusel
      ? ' Tiene que dar para varias slides: si el compañero mencionó una cantidad ("5 señales", "3 errores"), consérvala en el tema.'
      : ""
  }
- "idea": 2 a 3 frases en español natural que describan la escena: la emoción o actitud del zorro, 1 a 3 objetos físicos reales de utilería, y el ambiente. Si hay una idea abstracta, va impresa en un objeto físico (una pizarra, una pantalla encendida, una caja), nunca como símbolo flotante.
- "utileria": los MISMOS 1 a 3 objetos físicos de "idea", como lista breve separada por comas (ej: "un notebook abierto, una taza de café humeante").
- "estiloExtra": una frase corta (máximo 12 palabras) con el tono o ambiente (ej: "tono cercano, ambiente de taller de barrio").
- "direccionId": el id EXACTO de UNA de estas iluminaciones del estudio, la que mejor calce con la emoción del tema:
${lista(catalogos.direcciones)}
- "poseId": el id EXACTO de UNA de estas poses del zorro, la que mejor calce con la emoción del tema:
${lista(catalogos.poses)}
- "estiloTitularId": el id EXACTO de UNO de estos estilos tipográficos del titular:
${lista(catalogos.estilosTitular)}

Material del compañero:
Tema (puede venir vacío): "${tema}"
Idea en bruto (puede venir vacía): "${ideaBruta}"`;
}

/**
 * Parseo defensivo del JSON del modelo.
 *
 * Los ids se validan contra el catálogo real: uno inventado se descarta en vez
 * de propagarse a la UI, donde el selector se quedaría en un estado imposible.
 */
export function parseIdeaPost(
  raw: string,
  permitidos: {
    direcciones: readonly string[];
    poses: readonly string[];
    estilosTitular: readonly string[];
  },
): IdeaPostRedactada | null {
  const limpio = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown = null;
  try {
    obj = JSON.parse(limpio);
  } catch {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const rec = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const tema = str(rec.tema);
  const idea = str(rec.idea);
  if (!tema && !idea) return null;

  const validado = (v: string, permitidas: readonly string[]) => (permitidas.includes(v) ? v : "");

  return {
    tema: tema.slice(0, TEMA_MAX),
    idea: idea.slice(0, IDEA_MAX),
    utileria: str(rec.utileria).slice(0, UTILERIA_MAX),
    estiloExtra: str(rec.estiloExtra).slice(0, ESTILO_MAX),
    direccionId: validado(str(rec.direccionId), permitidos.direcciones),
    poseId: validado(str(rec.poseId), permitidos.poses),
    estiloTitularId: validado(str(rec.estiloTitularId), permitidos.estilosTitular),
  };
}
