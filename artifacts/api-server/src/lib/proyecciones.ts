// Series de negocio y proyección genérica por mínimos cuadrados.
//
// La matemática de la recta ya vive en proyeccion-ventas.ts y se reutiliza tal
// cual; aquí solo se generaliza el "periodo" (mes o semana ISO) y se arman las
// series históricas desde las fuentes reales: contratos del tablero, pagos de
// la tabla de cobros, jornada de asistencia y fotos del cierre semanal.
// Deliberadamente no hay estacionalidad ni modelos: una recta y su R², que es
// lo que se puede explicar y defender en una reunión.

import {
  ajustarRecta,
  bondadDelAjuste,
  mesSiguiente,
  variacionUltimoMes,
  type PuntoMes,
  type Variacion,
} from "./proyeccion-ventas";
import { esVentaCerrada } from "./estado-contrato";
import { contractNet } from "./ventas";
import { sessionMinutes } from "../routes/jornada";
import { periodKey } from "./periods";

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

const MONTH_RE = /^\d{4}-\d{2}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;

/** Un periodo de la serie: "YYYY-MM" (mes) o "YYYY-Wnn" (semana ISO). */
export interface PuntoPeriodo {
  periodo: string;
  valor: number;
}

/* ========================= Semanas ISO-8601 ============================== */

/**
 * Cuántas semanas ISO tiene el año: 53 cuando el 1 de enero cae jueves, o
 * cuando el año es bisiesto y cae miércoles; 52 en el resto.
 */
export function semanasDelAno(ano: number): 52 | 53 {
  const dia = new Date(Date.UTC(ano, 0, 1)).getUTCDay(); // 0=domingo … 4=jueves
  const bisiesto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  return dia === 4 || (bisiesto && dia === 3) ? 53 : 52;
}

/**
 * Semana siguiente de una clave "YYYY-Wnn".
 *
 * No basta sumar 1 y dar la vuelta en 52: hay años de 53 semanas (2026 lo es)
 * y saltarse la W53 desplazaría toda la serie una semana.
 */
export function semanaSiguiente(clave: string): string {
  const m = clave.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return clave;
  const ano = Number(m[1]);
  const semana = Number(m[2]);
  if (semana < semanasDelAno(ano)) return `${ano}-W${String(semana + 1).padStart(2, "0")}`;
  return `${ano + 1}-W01`;
}

/* ===================== Serie genérica y proyección ======================= */

/**
 * Rellena con 0 los periodos sin datos entre el primero y el último — el mismo
 * criterio que `completarMeses`: un mes sin ventas existió, y omitirlo haría
 * que la recta saliera mejor de lo que fue.
 */
export function completarPeriodos(
  serie: readonly PuntoPeriodo[],
  siguiente: (p: string) => string,
): PuntoPeriodo[] {
  if (serie.length === 0) return [];
  const ordenada = [...serie].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const porPeriodo = new Map(ordenada.map((p) => [p.periodo, Number(p.valor) || 0]));
  const salida: PuntoPeriodo[] = [];
  let periodo = ordenada[0]!.periodo;
  const ultimo = ordenada[ordenada.length - 1]!.periodo;

  // Tope de seguridad: una clave corrupta no puede colgar el servidor.
  for (let i = 0; i < 600; i++) {
    salida.push({ periodo, valor: porPeriodo.get(periodo) ?? 0 });
    if (periodo === ultimo) break;
    const sig = siguiente(periodo);
    if (sig === periodo) break; // la clave no avanza: mejor cortar que ciclar
    periodo = sig;
  }
  return salida;
}

export interface AnalisisSerie {
  historico: PuntoPeriodo[];
  /** La recta evaluada en cada periodo histórico, para dibujarla tal cual. */
  ajuste: PuntoPeriodo[];
  /** Periodos futuros según la recta. Vacía si no hay tendencia calculable. */
  proyeccion: PuntoPeriodo[];
  /** Cuánto sube (o baja) por periodo. Null con menos de 2 puntos. */
  pendiente: number | null;
  /** R²: cuánto explican los datos a la recta, 0–1. */
  r2: number | null;
  /** Último periodo respecto del anterior. */
  variacion: Variacion | null;
}

export interface OpcionesAnalisis {
  /** Techo de la proyección (100 para porcentajes). Sin techo por defecto. */
  tope?: number;
  /** Decimales del redondeo: 0 para pesos, 1 para horas y porcentajes. */
  decimales?: number;
}

/**
 * Ajusta la recta, la evalúa sobre el histórico y proyecta `horizonte`
 * periodos hacia adelante. Nunca proyecta negativo (y respeta `tope` si se
 * da): una pendiente muy a la baja acaba en valores sin significado que en un
 * gráfico se leen como error del sistema.
 */
export function analizarSerie(
  serie: readonly PuntoPeriodo[],
  horizonte: number,
  siguiente: (p: string) => string,
  opciones: OpcionesAnalisis = {},
): AnalisisSerie {
  const decimales = opciones.decimales ?? 0;
  const factor = 10 ** decimales;
  const redondear = (v: number) => Math.round(v * factor) / factor;
  const acotar = (v: number) => {
    let x = Math.max(0, v);
    if (opciones.tope != null) x = Math.min(opciones.tope, x);
    return redondear(x);
  };

  const comoMeses: PuntoMes[] = serie.map((p) => ({ mes: p.periodo, monto: p.valor }));
  const recta = ajustarRecta(comoMeses);
  const historico = serie.map((p) => ({ periodo: p.periodo, valor: redondear(Number(p.valor) || 0) }));
  const variacion = variacionUltimoMes(comoMeses);

  if (!recta) {
    return { historico, ajuste: [], proyeccion: [], pendiente: null, r2: null, variacion };
  }

  const ajuste = serie.map((p, i) => ({
    periodo: p.periodo,
    valor: acotar(recta.interseccion + recta.pendiente * i),
  }));

  const proyeccion: PuntoPeriodo[] = [];
  let periodo = serie[serie.length - 1]!.periodo;
  for (let k = 1; k <= horizonte; k++) {
    periodo = siguiente(periodo);
    proyeccion.push({
      periodo,
      valor: acotar(recta.interseccion + recta.pendiente * (serie.length - 1 + k)),
    });
  }

  return {
    historico,
    ajuste,
    proyeccion,
    pendiente: redondear(recta.pendiente),
    r2: bondadDelAjuste(comoMeses),
    variacion,
  };
}

/* ========================= Series del negocio ============================ */

/**
 * Ventas cerradas por mes: neto de los contratos ganados, en el mes de emisión
 * (o de creación si no hay). La misma definición que usa la torre de Ventas —
 * si esto divergiera, dos paneles mostrarían dos historias distintas.
 */
export function serieVentasCerradas(contracts: readonly Rec[]): PuntoPeriodo[] {
  const porMes = new Map<string, number>();
  for (const c of contracts) {
    if (!esVentaCerrada(c)) continue;
    const mes = (str(c.issuedAt) || str(c.createdAt)).slice(0, 7);
    if (!MONTH_RE.test(mes)) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + contractNet(c));
  }
  return completarPeriodos(
    [...porMes.entries()].map(([periodo, valor]) => ({ periodo, valor })),
    mesSiguiente,
  );
}

/**
 * Ingresos cobrados por mes: abonos reales del libro de pagos, brutos (IVA
 * incluido), agrupados por la fecha del abono.
 */
export function serieCobros(pagos: readonly { fecha: string; monto: number }[]): PuntoPeriodo[] {
  const porMes = new Map<string, number>();
  for (const p of pagos) {
    const mes = str(p.fecha).slice(0, 7);
    if (!MONTH_RE.test(mes)) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(p.monto) || 0));
  }
  return completarPeriodos(
    [...porMes.entries()].map(([periodo, valor]) => ({ periodo, valor })),
    mesSiguiente,
  );
}

export interface SesionJornada {
  userId: number;
  workDate: string;
  checkIn: Date | string;
  checkOut: Date | string | null;
}

/**
 * Horas de jornada por mes (1 decimal), bucketeadas por `workDate` — el día
 * local de Santiago que fijó el check-in, igual que el resto de asistencia.
 *
 * Sin asignaciones: todas las horas del equipo. Con asignaciones (se eligió un
 * proyecto): las horas de cada persona × su % de dedicación — el mismo reparto
 * que usa la rentabilidad de la Torre, para que las dos pantallas cuadren.
 */
export function serieHorasMensuales(
  sesiones: readonly SesionJornada[],
  asignaciones: readonly { userId: number; allocationPct: number }[] | null,
  ahora: Date = new Date(),
): PuntoPeriodo[] {
  const pctPorUsuario = asignaciones
    ? new Map(asignaciones.map((a) => [a.userId, Math.max(0, Number(a.allocationPct) || 0) / 100]))
    : null;

  const minutosPorMes = new Map<string, number>();
  for (const s of sesiones) {
    const mes = str(s.workDate).slice(0, 7);
    if (!MONTH_RE.test(mes)) continue;
    const factor = pctPorUsuario ? (pctPorUsuario.get(s.userId) ?? 0) : 1;
    if (factor === 0) continue;
    minutosPorMes.set(mes, (minutosPorMes.get(mes) ?? 0) + sessionMinutes(s, ahora) * factor);
  }

  return completarPeriodos(
    [...minutosPorMes.entries()].map(([periodo, min]) => ({
      periodo,
      valor: Math.round((min / 60) * 10) / 10,
    })),
    mesSiguiente,
  );
}

/**
 * Cumplimiento semanal del equipo (%) desde las fotos del cierre de sprint:
 * listas / comprometidas de TODAS las personas de cada semana.
 *
 * Solo semanas con cierre y con tareas comprometidas, y sin rellenar huecos:
 * una semana sin fila no es "0 %", es que el cierre aún no existía — meterle
 * ceros inventaría una caída que nunca pasó.
 */
export function serieCumplimiento(
  cierres: readonly { weekKey: string; total: number; done: number }[],
): PuntoPeriodo[] {
  const porSemana = new Map<string, { total: number; done: number }>();
  for (const c of cierres) {
    if (!WEEK_RE.test(str(c.weekKey))) continue;
    const acumulado = porSemana.get(c.weekKey) ?? { total: 0, done: 0 };
    acumulado.total += Math.max(0, Number(c.total) || 0);
    acumulado.done += Math.max(0, Number(c.done) || 0);
    porSemana.set(c.weekKey, acumulado);
  }
  return [...porSemana.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([periodo, v]) => ({ periodo, valor: Math.round(((100 * v.done) / v.total) * 10) / 10 }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/**
 * Producción por mes: tareas del Kanban que llegaron a "Listo", contadas en
 * el mes en que se completaron (hora de Santiago) — el mismo `completedAt`
 * que ya escribe el tablero al cerrar una tarea, no una fuente nueva. Si una
 * tarea se reabre, el servidor limpia ese campo solo, así que el conteo
 * siempre refleja lo que sigue entregado hoy, no picos que luego se deshacen.
 */
export function serieProduccion(
  tareas: readonly { completedAt: Date | string | null }[],
): PuntoPeriodo[] {
  const porMes = new Map<string, number>();
  for (const t of tareas) {
    if (!t.completedAt) continue;
    const fecha = t.completedAt instanceof Date ? t.completedAt : new Date(t.completedAt);
    if (Number.isNaN(fecha.getTime())) continue;
    const mes = periodKey("mensual", fecha);
    porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
  }
  return completarPeriodos(
    [...porMes.entries()].map(([periodo, valor]) => ({ periodo, valor })),
    mesSiguiente,
  );
}
