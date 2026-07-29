// Desglose de una jornada: en qué se fue el tiempo entre la entrada y la salida.
//
// El pase de lista mostraba "08:12 → 22:34" y al lado "6h 37m", y esos dos
// números no cuadran: entre medio hay 14 horas. Faltaban las pausas y, sobre
// todo, los huecos entre sesiones — si alguien marca salida a mediodía y vuelve
// a entrar a las cinco, ese hueco no aparecía en ninguna parte y la única
// lectura posible era "el contador está mal".
//
// Aquí el día se parte en tramos que CUBREN todo el rango sin huecos ni
// solapes, así que los totales siempre suman lo que abarca la jornada. Esa es
// la propiedad que hace que el desglose se pueda creer, y está en los tests.

import { minutosDePausas, type PausaCalculable, type SesionCalculable } from "./jornada-pausas.js";

/** Qué se estaba haciendo en un tramo. */
export type TipoTramo =
  | "trabajo"  // el reloj corría
  | "pausa"    // pausa declarada dentro de una sesión
  | "fuera";   // entre una salida y la siguiente entrada: no hay jornada abierta

export interface Tramo {
  tipo: TipoTramo;
  /** ISO del inicio. */
  desde: string;
  /** ISO del fin; null si el tramo sigue en curso ahora mismo. */
  hasta: string | null;
  minutos: number;
  /** Motivo declarado, solo en pausas. */
  motivo?: string;
}

export interface DesgloseJornada {
  tramos: Tramo[];
  /** Minutos con el reloj corriendo. Coincide con las horas que se pagan. */
  trabajado: number;
  pausado: number;
  /** Minutos entre sesiones: ni trabajados ni pausados, simplemente sin marcar. */
  fuera: number;
  /** De la primera entrada a la última salida. Es lo que muestra la franja. */
  abarcado: number;
  entrada: string | null;
  salida: string | null;
  /** Hay una sesión sin cerrar ahora mismo. */
  abierta: boolean;
}

/** Sesión con lo mínimo para desglosarla. */
export interface SesionDesglosable extends SesionCalculable {
  id: number;
}

/** Pausa con lo mínimo para desglosarla. */
export interface PausaDesglosable extends PausaCalculable {
  reason?: string;
}

const ms = (v: Date | string) => new Date(v).getTime();
const iso = (t: number) => new Date(t).toISOString();
const min = (desde: number, hasta: number) => Math.round((hasta - desde) / 60000);

/**
 * Tope por sesión, el MISMO que aplica la ruta.
 *
 * Va aquí duplicado a propósito y no importado desde las rutas: este módulo se
 * prueba sin base de datos, y hacerlo depender del router lo ataría a Express.
 */
export const MAX_SESION_MS = 16 * 60 * 60 * 1000;

/** Fin efectivo de una sesión, con el tope de 16 h que evita salidas olvidadas. */
function finDe(s: SesionCalculable, ahora: number): number {
  const inicio = ms(s.checkIn);
  const fin = s.checkOut ? ms(s.checkOut) : ahora;
  return Math.min(Math.max(fin, inicio), inicio + MAX_SESION_MS);
}

/** Pausas recortadas a la sesión y fusionadas, para no descontar dos veces. */
function pausasNormalizadas(
  pausas: PausaDesglosable[],
  inicio: number,
  fin: number,
  ahora: number,
): Array<{ desde: number; hasta: number; motivo: string }> {
  const crudas = pausas
    .map((p) => ({
      desde: Math.max(ms(p.startedAt), inicio),
      hasta: Math.min(p.endedAt ? ms(p.endedAt) : ahora, fin),
      motivo: (p.reason ?? "").trim(),
    }))
    .filter((p) => p.hasta > p.desde)
    .sort((a, b) => a.desde - b.desde);

  const fusionadas: Array<{ desde: number; hasta: number; motivo: string }> = [];
  for (const p of crudas) {
    const ultima = fusionadas[fusionadas.length - 1];
    if (ultima && p.desde <= ultima.hasta) {
      // Dos pausas solapadas (una la abrió la persona, otra quien supervisa)
      // son UN solo tramo: pintarlas como dos descontaría el tiempo dos veces.
      ultima.hasta = Math.max(ultima.hasta, p.hasta);
      if (p.motivo && !ultima.motivo) ultima.motivo = p.motivo;
    } else {
      fusionadas.push({ ...p });
    }
  }
  return fusionadas;
}

/**
 * Parte el día en tramos consecutivos que cubren toda la jornada.
 *
 * `pausasPorSesion` se indexa por el id de la sesión. Las sesiones pueden venir
 * en cualquier orden: se ordenan aquí, porque un desglose que dependiera del
 * orden de la consulta sería una bomba de tiempo.
 */
export function desglosarJornada(
  sesiones: SesionDesglosable[],
  pausasPorSesion: Map<number, PausaDesglosable[]>,
  ahora: Date = new Date(),
): DesgloseJornada {
  const t = ahora.getTime();
  const ordenadas = [...sesiones].sort((a, b) => ms(a.checkIn) - ms(b.checkIn));
  if (ordenadas.length === 0) {
    return { tramos: [], trabajado: 0, pausado: 0, fuera: 0, abarcado: 0, entrada: null, salida: null, abierta: false };
  }

  const tramos: Tramo[] = [];
  let trabajadoMs = 0, pausadoMs = 0, fueraMs = 0;
  let finAnterior: number | null = null;

  for (const s of ordenadas) {
    const inicio = ms(s.checkIn);
    const fin = finDe(s, t);

    // Hueco desde la salida anterior: la persona no estaba marcada. Si las
    // sesiones se solapan (dato corrupto) el hueco es negativo y se ignora.
    if (finAnterior !== null && inicio > finAnterior) {
      tramos.push({ tipo: "fuera", desde: iso(finAnterior), hasta: iso(inicio), minutos: min(finAnterior, inicio) });
      fueraMs += inicio - finAnterior;
    }

    const pausas = pausasNormalizadas(pausasPorSesion.get(s.id) ?? [], inicio, fin, t);
    const abiertaEstaSesion = !s.checkOut;
    let cursor = inicio;

    const empujarTrabajo = (desde: number, hasta: number, enCurso: boolean) => {
      if (hasta <= desde) return;
      tramos.push({ tipo: "trabajo", desde: iso(desde), hasta: enCurso ? null : iso(hasta), minutos: min(desde, hasta) });
      trabajadoMs += hasta - desde;
    };

    for (const p of pausas) {
      empujarTrabajo(cursor, p.desde, false);
      const enCurso = abiertaEstaSesion && p.hasta >= t;
      tramos.push({
        tipo: "pausa",
        desde: iso(p.desde),
        hasta: enCurso ? null : iso(p.hasta),
        minutos: min(p.desde, p.hasta),
        ...(p.motivo ? { motivo: p.motivo } : {}),
      });
      pausadoMs += p.hasta - p.desde;
      cursor = p.hasta;
    }
    empujarTrabajo(cursor, fin, abiertaEstaSesion);

    finAnterior = Math.max(finAnterior ?? fin, fin);
  }

  const entrada = ms(ordenadas[0]!.checkIn);
  const salida = finAnterior!;
  const ultima = ordenadas[ordenadas.length - 1]!;

  return {
    tramos,
    trabajado: Math.round(trabajadoMs / 60000),
    pausado: Math.round(pausadoMs / 60000),
    fuera: Math.round(fueraMs / 60000),
    abarcado: min(entrada, salida),
    entrada: iso(entrada),
    salida: ultima.checkOut ? iso(salida) : null,
    abierta: ordenadas.some((s) => !s.checkOut),
  };
}

/**
 * Comprueba que el desglose cuadra con lo que ya calculaban las rutas.
 *
 * Existe para que el desglose no pueda contar una historia distinta del número
 * grande que se muestra al lado: si divergen, el que está mal es el desglose y
 * hay que verlo en los tests, no en la pantalla de alguien.
 */
export function minutosNetosDelDesglose(
  sesiones: SesionDesglosable[],
  pausasPorSesion: Map<number, PausaDesglosable[]>,
  ahora: Date = new Date(),
): number {
  return sesiones.reduce((acc, s) => {
    const inicio = ms(s.checkIn);
    const fin = finDe(s, ahora.getTime());
    const brutos = Math.round((fin - inicio) / 60000);
    return acc + Math.max(0, brutos - minutosDePausas(s, pausasPorSesion.get(s.id) ?? [], ahora));
  }, 0);
}
