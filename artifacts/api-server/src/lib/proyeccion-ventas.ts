// Proyección de ventas por mínimos cuadrados y tasa de variación.
//
// Lo que había (`weightedProjection`) calcula UN solo mes: suma las
// oportunidades abiertas por su probabilidad de etapa. Eso no es una
// proyección, es una foto del embudo de hoy — y además imputa al mes actual las
// oportunidades sin fecha de cierre, así que tira hacia arriba (está admitido
// en el comentario de la propia función).
//
// Aquí se mira la serie HISTÓRICA de lo realmente cerrado y se ajusta una
// recta. Son cosas distintas y conviven: el embudo dice qué puede caer este
// mes; la tendencia dice hacia dónde va el negocio.

/** Un mes cerrado de la serie. */
export interface PuntoMes {
  /** "YYYY-MM". */
  mes: string;
  /** Monto neto cerrado ese mes. */
  monto: number;
}

export interface Recta {
  /** Cuánto sube (o baja) por mes. */
  pendiente: number;
  /** Valor ajustado en el primer mes de la serie. */
  interseccion: number;
}

/**
 * Ajusta una recta por mínimos cuadrados sobre la serie.
 *
 * x = índice del mes (0, 1, 2…) en vez de la fecha, para que la aritmética no
 * dependa de meses de 28 o 31 días.
 */
export function ajustarRecta(serie: readonly PuntoMes[]): Recta | null {
  const n = serie.length;
  // Con un solo punto hay infinitas rectas: devolver una sería inventarse una
  // tendencia a partir de un mes suelto.
  if (n < 2) return null;

  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const y = Number(serie[i]!.monto) || 0;
    sx += i; sy += y; sxy += i * y; sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;

  const pendiente = (n * sxy - sx * sy) / denom;
  const interseccion = (sy - pendiente * sx) / n;
  return { pendiente, interseccion };
}

export interface Proyeccion {
  mes: string;
  monto: number;
}

/** Siguiente mes de un "YYYY-MM". */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  if (!a || !m) return mes;
  const siguiente = m === 12 ? 1 : m + 1;
  const ano = m === 12 ? a + 1 : a;
  return `${ano}-${String(siguiente).padStart(2, "0")}`;
}

/**
 * Proyecta los próximos `meses` a partir de la tendencia.
 *
 * Nunca proyecta negativo: una recta con pendiente muy a la baja acaba dando
 * ventas negativas, que no significan nada y en un gráfico se leen como un
 * error del sistema.
 */
export function proyectarVentas(serie: readonly PuntoMes[], meses = 3): Proyeccion[] {
  const recta = ajustarRecta(serie);
  if (!recta || serie.length === 0) return [];

  const salida: Proyeccion[] = [];
  let mes = serie[serie.length - 1]!.mes;
  for (let k = 1; k <= meses; k++) {
    mes = mesSiguiente(mes);
    const x = serie.length - 1 + k;
    salida.push({ mes, monto: Math.max(0, Math.round(recta.interseccion + recta.pendiente * x)) });
  }
  return salida;
}

/**
 * Coeficiente de determinación (R²): cuánto explica la recta a los datos.
 *
 * Va acompañando a la proyección porque una tendencia sobre datos dispersos es
 * una raya bonita sin ningún valor, y mostrarla sin decirlo invita a tomar
 * decisiones sobre ruido. 1 = la recta pasa por todos los puntos.
 */
export function bondadDelAjuste(serie: readonly PuntoMes[]): number | null {
  const recta = ajustarRecta(serie);
  if (!recta) return null;
  const n = serie.length;
  const media = serie.reduce((a, p) => a + (Number(p.monto) || 0), 0) / n;

  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const y = Number(serie[i]!.monto) || 0;
    const estimado = recta.interseccion + recta.pendiente * i;
    ssRes += (y - estimado) ** 2;
    ssTot += (y - media) ** 2;
  }
  // Serie plana: la recta la explica entera, pero no hay nada que explicar.
  if (ssTot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

/* ==================== Tasa de variación ================================= */

export interface Variacion {
  /** Proporción respecto al periodo anterior: 0.25 = +25 %. */
  tasa: number | null;
  /** Diferencia absoluta. */
  diferencia: number;
  anterior: number;
  actual: number;
}

/**
 * Tasa de variación entre dos periodos.
 *
 * Devuelve `tasa: null` cuando el periodo anterior fue 0. Dividir por cero da
 * Infinity, y un "+∞ %" en un panel no informa de nada: es mejor decir que no
 * se puede calcular y enseñar la diferencia absoluta.
 */
export function tasaDeVariacion(anterior: number, actual: number): Variacion {
  const a = Number(anterior) || 0;
  const b = Number(actual) || 0;
  return {
    tasa: a === 0 ? null : (b - a) / Math.abs(a),
    diferencia: b - a,
    anterior: a,
    actual: b,
  };
}

/** Variación del último mes de la serie respecto al anterior. */
export function variacionUltimoMes(serie: readonly PuntoMes[]): Variacion | null {
  if (serie.length < 2) return null;
  return tasaDeVariacion(serie[serie.length - 2]!.monto, serie[serie.length - 1]!.monto);
}

/**
 * Rellena los meses sin ventas con 0 entre el primero y el último.
 *
 * Sin esto un mes sin cerrar nada simplemente no aparece, y la recta se ajusta
 * como si ese mes no hubiera existido: la tendencia sale mejor de lo que fue.
 */
export function completarMeses(serie: readonly PuntoMes[]): PuntoMes[] {
  if (serie.length === 0) return [];
  const ordenada = [...serie].sort((a, b) => a.mes.localeCompare(b.mes));
  const salida: PuntoMes[] = [];
  let mes = ordenada[0]!.mes;
  const ultimo = ordenada[ordenada.length - 1]!.mes;
  const porMes = new Map(ordenada.map((p) => [p.mes, Number(p.monto) || 0]));

  // Tope de seguridad: una fecha corrupta no puede colgar el servidor.
  for (let i = 0; i < 600; i++) {
    salida.push({ mes, monto: porMes.get(mes) ?? 0 });
    if (mes === ultimo) break;
    mes = mesSiguiente(mes);
  }
  return salida;
}
