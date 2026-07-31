// Ganado, perdido, o todavía en el embudo.
//
// El tablero tenía cuatro estados —borrador, activo, vencido, cancelado— y
// "cancelado" servía para dos cosas que no tienen nada que ver:
//
//   · cotizamos y el cliente se fue con otro     → nunca hubo venta
//   · el cliente firmó y meses después lo cortó  → sí hubo venta, en su mes
//
// Con los dos en el mismo cajón salen dos cifras equivocadas y ninguna avisa.
// La serie histórica solo contaba "activo", así que un contrato firmado y luego
// cancelado desaparecía del mes en que de verdad se vendió: los meses pasados
// encogen y la tendencia se calcula sobre una historia que no ocurrió. Y la
// tasa de conversión directamente no se puede calcular, porque no se sabe
// cuántas cotizaciones se perdieron.
//
// De ahí el estado nuevo `perdido`. Esto vive aparte y es puro porque de la
// clasificación depende toda la proyección, y equivocarse no da error: da un
// gráfico convincente con los números cambiados.

export type EstadoContrato = "borrador" | "activo" | "vencido" | "cancelado" | "perdido";

export const ESTADOS_CONTRATO: readonly EstadoContrato[] = [
  "borrador", "activo", "vencido", "cancelado", "perdido",
];

/** Qué fue de esta oportunidad, a efectos de medir. */
export type Desenlace = "embudo" | "ganado" | "perdido";

interface ContratoClasificable {
  status?: unknown;
  /** Fecha de firma. Es la prueba de que hubo venta. */
  signedAt?: unknown;
}

const texto = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** ¿Tiene fecha de firma utilizable? */
export function estaFirmado(c: ContratoClasificable): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(String(c?.signedAt ?? "").trim());
}

/**
 * Desenlace de un contrato.
 *
 * El caso delicado son los `cancelado` que ya existen: se guardaron antes de
 * que hubiera un estado "perdido", así que llevan mezclados los dos
 * significados y no hay un campo que lo aclare. Se decide por la firma, que es
 * el único dato que lo distingue de verdad: si llegó a firmarse, hubo venta y
 * cuenta en su mes; si nunca se firmó, era una cotización que no prosperó.
 *
 * No es adivinar: es la definición de haber vendido algo.
 */
export function desenlaceDe(c: ContratoClasificable): Desenlace {
  switch (texto(c?.status)) {
    case "borrador":
      return "embudo";
    case "perdido":
      return "perdido";
    case "activo":
    case "vencido":
      return "ganado";
    case "cancelado":
      return estaFirmado(c) ? "ganado" : "perdido";
    default:
      // Un estado que no conocemos no se cuenta como venta. Contarlo inflaría
      // la historia con lo primero que alguien escriba mal.
      return "embudo";
  }
}

/** ¿Cuenta en la serie histórica de ventas cerradas? */
export function esVentaCerrada(c: ContratoClasificable): boolean {
  return desenlaceDe(c) === "ganado";
}

export interface TasaConversion {
  ganados: number;
  perdidos: number;
  /** Porcentaje 0-100, o null si todavía no se cerró nada. */
  tasa: number | null;
}

/**
 * Cuántas de las oportunidades cerradas se ganaron.
 *
 * Las que siguen en el embudo NO entran en el denominador: incluirlas hundiría
 * la tasa al empezar el mes y la subiría sola al cerrarse, sin que nadie
 * hubiera vendido mejor.
 */
export function tasaDeConversion(contratos: readonly ContratoClasificable[]): TasaConversion {
  let ganados = 0;
  let perdidos = 0;
  for (const c of contratos) {
    const d = desenlaceDe(c);
    if (d === "ganado") ganados++;
    else if (d === "perdido") perdidos++;
  }
  const cerrados = ganados + perdidos;
  return { ganados, perdidos, tasa: cerrados === 0 ? null : Math.round((ganados / cerrados) * 100) };
}

/** Motivos de pérdida, para que "perdido" diga algo más que un color. */
export const MOTIVOS_PERDIDA = [
  "precio",
  "plazo",
  "competencia",
  "sin_respuesta",
  "no_era_el_momento",
  "otro",
] as const;

export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number];

export function motivoValido(v: unknown): MotivoPerdida | null {
  const s = texto(v).replace(/\s+/g, "_");
  return (MOTIVOS_PERDIDA as readonly string[]).includes(s) ? (s as MotivoPerdida) : null;
}

/** Recuento por motivo, de mayor a menor: en qué se está perdiendo. */
export function perdidasPorMotivo(
  contratos: readonly (ContratoClasificable & { motivoPerdida?: unknown })[],
): Array<{ motivo: MotivoPerdida | "sin_indicar"; total: number }> {
  const cuenta = new Map<string, number>();
  for (const c of contratos) {
    if (desenlaceDe(c) !== "perdido") continue;
    const m = motivoValido(c.motivoPerdida) ?? "sin_indicar";
    cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([motivo, total]) => ({ motivo: motivo as MotivoPerdida | "sin_indicar", total }))
    .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo));
}
