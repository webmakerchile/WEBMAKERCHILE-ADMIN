/**
 * Ventanas de tiempo para las metas, en hora local de Chile.
 *
 * Una meta "de esta semana" tiene que significar lo mismo para quien la asigna
 * y para quien la cumple. Calcular la ventana en UTC haría que a las 21:00 de
 * un domingo ya fuera "la semana siguiente" para el servidor y no para el
 * equipo, así que todo se resuelve en America/Santiago.
 */

export const PERIODS = ["diaria", "semanal", "mensual"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  diaria: "Hoy",
  semanal: "Esta semana",
  mensual: "Este mes",
};

const TZ = "America/Santiago";

/** Fecha local (año, mes, día) del instante dado. */
function localParts(now: Date): { year: number; month: number; day: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const partes = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dias: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    year: Number(partes.year),
    month: Number(partes.month),
    day: Number(partes.day),
    dow: dias[partes.weekday as string] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Número de semana ISO: la semana 1 es la que contiene el primer jueves del
 * año. Es el estándar que usa la gente al decir "semana 31".
 */
function isoWeek(year: number, month: number, day: number): { year: number; week: number } {
  const fecha = new Date(Date.UTC(year, month - 1, day));
  const dow = (fecha.getUTCDay() + 6) % 7; // 0 = lunes
  fecha.setUTCDate(fecha.getUTCDate() - dow + 3); // jueves de esa semana
  const jueves = fecha.getTime();
  const primerJueves = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 4));
  const dowPrimero = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - dowPrimero + 3);
  const semana = 1 + Math.round((jueves - primerJueves.getTime()) / (7 * 86_400_000));
  return { year: fecha.getUTCFullYear(), week: semana };
}

/** Clave de la ventana a la que pertenece `now` para ese período. */
export function periodKey(period: Period, now: Date = new Date()): string {
  const { year, month, day } = localParts(now);
  if (period === "diaria") return `${year}-${pad(month)}-${pad(day)}`;
  if (period === "mensual") return `${year}-${pad(month)}`;
  const { year: y, week } = isoWeek(year, month, day);
  return `${y}-W${pad(week)}`;
}

/** Las tres claves vigentes ahora mismo: lo que alguien debería estar viendo. */
export function currentKeys(now: Date = new Date()): Record<Period, string> {
  return {
    diaria: periodKey("diaria", now),
    semanal: periodKey("semanal", now),
    mensual: periodKey("mensual", now),
  };
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

/**
 * ¿Esta clave ya quedó atrás? Se usa para marcar metas vencidas sin tocar la
 * base: comparar texto ordenable alcanza para día y mes; la semana necesita
 * comparar año y número.
 */
export function isPastKey(period: Period, key: string, now: Date = new Date()): boolean {
  const actual = periodKey(period, now);
  if (period === "semanal") {
    const [ay, aw] = actual.split("-W").map(Number);
    const [ky, kw] = key.split("-W").map(Number);
    if (!Number.isFinite(ky) || !Number.isFinite(kw)) return false;
    return ky < ay || (ky === ay && kw < aw);
  }
  return key < actual;
}
