// Cobranza: la parte pura.
//
// Aquí no hay base de datos ni tablero: solo las reglas con las que se decide
// cuánto vale un proyecto, cuánto se ha pagado y en qué estado va. Vive aparte
// porque equivocarse aquí no da error: da un saldo convincente con el número
// cambiado, y de estos números se cobra.

/**
 * Datos de la cuenta donde se depositan los pagos. Fijos en el servidor para
 * que el panel los muestre siempre iguales (y copiables) sin depender de que
 * alguien los recuerde bien.
 */
export const CUENTA_COBRO = {
  banco: "Mercado Pago",
  tipo: "Cuenta Vista",
  /** Tal cual se pega en el formulario del banco. */
  numero: "1041474795",
  /** Crudo, como llegó del banco; el formateado es solo para leer. */
  rut: "780429682",
  rutFormateado: "78.042.968-2",
} as const;

/** Texto listo para pegar en una transferencia (el "copiar todo" del panel). */
export function textoTransferencia(): string {
  return [
    `Banco: ${CUENTA_COBRO.banco}`,
    `Tipo de cuenta: ${CUENTA_COBRO.tipo}`,
    `N° de cuenta: ${CUENTA_COBRO.numero}`,
    `RUT: ${CUENTA_COBRO.rutFormateado}`,
  ].join("\n");
}

/**
 * Total con IVA a partir del neto, con UN redondeo al final. Es la misma
 * convención de `contractNet` (que ya entrega el neto redondeado): redondear
 * módulo a módulo y sumar puede diferir en pesos, y dos pantallas con totales
 * distintos para el mismo contrato es un problema de confianza, no de centavos.
 */
export function totalConIva(neto: number): number {
  if (!Number.isFinite(neto) || neto <= 0) return 0;
  return Math.round(neto) + Math.round(neto * 0.19);
}

export type EstadoPago = "pendiente" | "parcial" | "pagado";

/**
 * Estado de pago CALCULADO de los abonos contra el total. No reemplaza al
 * estado de cobro manual (pendiente/facturado/pagado/incobrable) del
 * contrato: ese es gestión, este es aritmética.
 *
 * Sin total conocido (contratos viejos sin documento ni valor) nunca se
 * declara "pagado": lo más que se puede afirmar es que hay abonos.
 */
export function estadoPagoDe(totalIva: number, pagado: number): EstadoPago {
  if (!Number.isFinite(pagado) || pagado <= 0) return "pendiente";
  if (!Number.isFinite(totalIva) || totalIva <= 0) return "parcial";
  return pagado >= totalIva ? "pagado" : "parcial";
}

/** Suma segura de montos de pagos (ignora basura sin reventar). */
export function sumaPagos(pagos: ReadonlyArray<{ monto: unknown }>): number {
  let s = 0;
  for (const p of pagos) {
    const m = Number(p?.monto);
    if (Number.isFinite(m) && m > 0) s += Math.round(m);
  }
  return s;
}

/** Tope de un pago: dentro de integer de Postgres y de la realidad. */
export const MAX_MONTO_PAGO = 2_000_000_000;
