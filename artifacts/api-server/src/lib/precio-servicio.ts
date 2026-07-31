// Precios del catálogo: de texto libre a un número con el que se pueda operar.
//
// `price` es un string: "$100.000", "—", "o $25.000/mes · $290.000 pago único".
// Sirve para enseñarlo y para nada más — no se puede sumar, ni comparar, ni
// precargar en una cotización. Por eso el asistente terminaba ESTIMANDO los
// precios con IA aunque el catálogo real estuviera ahí al lado.
//
// Se añade un importe numérico junto al texto, sin quitarlo: el texto sigue
// siendo lo que se muestra (lleva matices como "/mes" o "desde") y el número es
// lo que se calcula. Los servicios que ya existen no hay que reescribirlos a
// mano: se les deduce el importe de su propio texto.

/** Importe deducido de un precio escrito a mano. */
export interface PrecioParseado {
  /** Pesos, sin decimales. Null cuando no hay una cifra clara. */
  monto: number | null;
  /** true si el texto sugiere que es un mínimo ("desde $100.000"). */
  desde: boolean;
  /** true si es recurrente ("/mes", "mensual"). */
  mensual: boolean;
}

const VACIO: PrecioParseado = { monto: null, desde: false, mensual: false };

/**
 * Saca el importe de un precio escrito a mano.
 *
 * Toma la PRIMERA cifra: en "o $25.000/mes · $290.000 pago único" la primera es
 * la que encabeza la oferta. Quedarse con la mayor haría que el catálogo
 * pareciera más caro de lo que se ofrece.
 */
export function parsearPrecio(texto: unknown): PrecioParseado {
  const s = String(texto ?? "").trim();
  if (!s) return VACIO;

  const bajo = s.toLowerCase();
  // "a cotizar", "—", "consultar": no es que valga cero, es que no hay precio.
  if (/cotizar|consultar|a convenir/.test(bajo)) return VACIO;

  // Se aceptan puntos y comas como separador de miles (formato chileno) pero
  // NO se interpretan como decimales: "100.000" son cien mil, no cien.
  const m = s.match(/(\d[\d.\s]*\d|\d)/);
  if (!m) return VACIO;

  const crudo = m[1]!.replace(/[.\s]/g, "");
  const monto = Number.parseInt(crudo, 10);
  if (!Number.isFinite(monto) || monto <= 0) return VACIO;

  return {
    monto,
    desde: /desde|a partir/.test(bajo),
    mensual: /\/\s*mes|mensual|al mes/.test(bajo),
  };
}

/** Formato de pesos chilenos, el mismo que usa el panel. */
export function formatearCLP(monto: number): string {
  return "$" + Math.round(monto).toLocaleString("es-CL");
}

export interface TierConImporte {
  plan: string;
  price: string;
  detail?: string;
  /** Importe numérico. Si no viene, se deduce del texto. */
  amount?: number | null;
}

/**
 * Completa el importe de cada plan a partir de su texto, si falta.
 *
 * Así los nueve servicios ya sembrados pasan a ser utilizables sin que nadie
 * tenga que reescribirlos. Un `amount` puesto a mano SIEMPRE manda sobre lo
 * deducido: el texto puede decir "desde $100.000" y el importe real ser otro.
 */
export function completarImportes<T extends TierConImporte>(tiers: readonly T[]): T[] {
  return tiers.map((t) => {
    if (typeof t.amount === "number" && Number.isFinite(t.amount)) return t;
    return { ...t, amount: parsearPrecio(t.price).monto };
  });
}

/**
 * Importe de un plan concreto de un servicio, para precargar la cotización.
 *
 * Devuelve null cuando no hay precio cierto. Devolver 0 sería peor: entraría
 * como una línea gratis en una cotización sin que nadie lo note.
 */
export function importeDePlan(
  tiers: readonly TierConImporte[],
  plan: string,
): number | null {
  const buscado = plan.trim().toLowerCase();
  const t = completarImportes(tiers).find((x) => x.plan.trim().toLowerCase() === buscado);
  return typeof t?.amount === "number" && t.amount > 0 ? t.amount : null;
}
