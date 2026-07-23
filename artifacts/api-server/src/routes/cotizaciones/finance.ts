/**
 * Módulo financiero de cotizaciones.
 * TODOS los cálculos de dinero viven aquí, en el servidor.
 * El LLM jamás calcula IVA, totales, ni formatea montos.
 */

export const IVA_RATE = 0.19;

export const calcIva = (neto: number) => Math.round(neto * IVA_RATE);
export const calcTotal = (neto: number) => neto + calcIva(neto);

/** Formato chileno: $2.499.000 (punto de miles, sin decimales). */
export const clp = (n: number) => "$" + new Intl.NumberFormat("es-CL").format(n);

export interface HitoPago {
  porcentaje: number;
  momento: string;
}

export interface HitoPagoCalculado extends HitoPago {
  monto: number;
}

/**
 * División de pagos sobre el TOTAL CON IVA. El residuo por redondeo se asigna
 * al último hito para que la suma de los hitos sea EXACTAMENTE el total.
 */
export function splitPagos(totalConIva: number, esquema: HitoPago[]): HitoPagoCalculado[] {
  const montos = esquema.map((h) => Math.round((totalConIva * h.porcentaje) / 100));
  const diff = totalConIva - montos.reduce((a, b) => a + b, 0);
  montos[montos.length - 1] += diff;
  return esquema.map((h, i) => ({ ...h, monto: montos[i] }));
}

export interface ModuloCalculado {
  nombre: string;
  descripcion: string;
  neto: number;
  iva: number;
  total: number;
}

export interface FinanzasCotizacion {
  modulos: ModuloCalculado[];
  proyectoNeto: number;
  proyectoIva: number;
  proyectoTotal: number;
  mensualidad: { neto: number; iva: number; total: number } | null;
  pagos: HitoPagoCalculado[];
}

/**
 * Calcula todos los montos derivados de una cotización.
 * Lanza un Error claro si algún neto no es un entero positivo.
 */
export function calcularFinanzas(input: {
  modulos: { nombre: string; descripcion: string; neto: number }[];
  mensualidadNeto?: number | null;
  esquema: HitoPago[];
}): FinanzasCotizacion {
  for (const m of input.modulos) {
    if (!Number.isInteger(m.neto) || m.neto <= 0) {
      throw new Error(
        `El módulo "${m.nombre}" tiene un precio neto pendiente o inválido (${m.neto}). Ingresa el precio neto en CLP antes de generar el PDF.`
      );
    }
  }
  if (input.mensualidadNeto != null && (!Number.isInteger(input.mensualidadNeto) || input.mensualidadNeto <= 0)) {
    throw new Error(
      `La mensualidad tiene un precio neto pendiente o inválido (${input.mensualidadNeto}). Ingresa el precio neto en CLP antes de generar el PDF.`
    );
  }
  const sumaPct = input.esquema.reduce((a, h) => a + h.porcentaje, 0);
  if (sumaPct !== 100) {
    throw new Error(`Los porcentajes del esquema de pago suman ${sumaPct}%, deben sumar exactamente 100%.`);
  }

  const modulos = input.modulos.map((m) => ({
    ...m,
    iva: calcIva(m.neto),
    total: calcTotal(m.neto),
  }));
  const proyectoNeto = modulos.reduce((a, m) => a + m.neto, 0);
  const proyectoIva = calcIva(proyectoNeto);
  const proyectoTotal = proyectoNeto + proyectoIva;

  const mensualidad =
    input.mensualidadNeto != null
      ? {
          neto: input.mensualidadNeto,
          iva: calcIva(input.mensualidadNeto),
          total: calcTotal(input.mensualidadNeto),
        }
      : null;

  return {
    modulos,
    proyectoNeto,
    proyectoIva,
    proyectoTotal,
    mensualidad,
    pagos: splitPagos(proyectoTotal, input.esquema),
  };
}
