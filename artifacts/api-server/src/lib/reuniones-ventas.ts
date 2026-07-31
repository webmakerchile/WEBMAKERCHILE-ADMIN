// Reuniones del flujo de ventas y su desenlace.
//
// El embudo real de la empresa es una secuencia de reuniones: un discovery
// para entender al cliente, una reunión de propuesta y los seguimientos que
// hagan falta. Cada reunión completada termina en un desenlace explícito —
// siguiente reunión, acepta ya, acepta a futuro o perdido — porque una
// reunión "completada" sin desenlace es exactamente donde se pierden los
// casos: nadie vuelve a llamar y nadie se entera.
//
// Esto vive aparte y es puro (sin DB, sin tablero): de estas clasificaciones
// salen el embudo del resumen y los recordatorios del scheduler, y lo puro
// se prueba sin montar nada.

import { desenlaceDe, motivoValido, type MotivoPerdida } from "./estado-contrato";

type Rec = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Tipos de reunión del flujo: discovery → propuesta → seguimiento(s). */
export const TIPOS_REUNION = ["discovery", "propuesta", "seguimiento"] as const;
export type TipoReunion = (typeof TIPOS_REUNION)[number];

export function isTipoReunion(v: unknown): v is TipoReunion {
  return typeof v === "string" && (TIPOS_REUNION as readonly string[]).includes(v);
}

/** Desenlaces posibles al completar una reunión de venta. */
export const DESENLACES_REUNION = ["siguiente_reunion", "acepta_inmediato", "acepta_futuro", "perdido"] as const;
export type DesenlaceReunion = (typeof DESENLACES_REUNION)[number];

/** Por qué un cliente que dijo que sí todavía no parte. */
export const MOTIVOS_FUTURO = ["fondos", "inversionista", "planificacion_pagos", "otro"] as const;
export type MotivoFuturo = (typeof MOTIVOS_FUTURO)[number];

export function isMotivoFuturo(v: unknown): v is MotivoFuturo {
  return typeof v === "string" && (MOTIVOS_FUTURO as readonly string[]).includes(v);
}

/** Qué reunión viene después: tras el discovery se presenta propuesta;
 *  después, todo son seguimientos hasta cerrar. */
export function siguienteTipo(tipo: unknown): TipoReunion {
  return tipo === "discovery" ? "propuesta" : "seguimiento";
}

/** ¿Es una reunión del flujo de ventas? (vinculada a oportunidad y tipada) */
export function esReunionVentas(m: Rec): boolean {
  return str(m?.contractId) !== "" && isTipoReunion(m?.tipo);
}

/** Reuniones de una oportunidad, en orden cronológico. */
export function reunionesDeOportunidad(meetings: unknown, contractId: string): Rec[] {
  if (!Array.isArray(meetings) || contractId === "") return [];
  return (meetings as Rec[])
    .filter((m) => m && typeof m === "object" && str(m.contractId) === contractId)
    .sort((a, b) => str(a.date).localeCompare(str(b.date)) || ((Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)));
}

/* ================================ Embudo ================================= */

export interface EmbudoVentas {
  /** Borradores en etapa temprana (prospecto/contactado): se está en reuniones. */
  enReuniones: number;
  /** Borradores con propuesta sobre la mesa (propuesta/negociación/cierre). */
  propuestaEnviada: number;
  /** Aceptaron pero posponen el arranque (tienen fecha estimada de retomar). */
  aFuturo: number;
  ganados: number;
  perdidos: number;
}

/**
 * Recuento del embudo para el resumen de ventas. Sin montos a propósito:
 * es un conteo de casos, y así lo puede ver cualquiera que vea la torre.
 */
export function embudoVentas(contracts: unknown): EmbudoVentas {
  const out: EmbudoVentas = { enReuniones: 0, propuestaEnviada: 0, aFuturo: 0, ganados: 0, perdidos: 0 };
  if (!Array.isArray(contracts)) return out;
  for (const c of contracts as Rec[]) {
    if (!c || typeof c !== "object") continue;
    const d = desenlaceDe(c);
    if (d === "ganado") { out.ganados++; continue; }
    if (d === "perdido") { out.perdidos++; continue; }
    // En el embudo solo cuentan los borradores de verdad; un estado
    // desconocido no infla ninguna columna.
    if (str(c.status) !== "borrador") continue;
    if (str(c.futuroFecha) !== "") { out.aFuturo++; continue; }
    const stage = str(c.pipelineStage);
    if (stage === "propuesta" || stage === "negociacion" || stage === "cierre") out.propuestaEnviada++;
    else out.enReuniones++;
  }
  return out;
}

/* ========================= Historiales consultables ====================== */

export interface CasoFuturo {
  id: string;
  title: string;
  client: string;
  futuroFecha: string;
  futuroMotivo: MotivoFuturo | "";
  futuroNota: string;
  salesOwnerId: number | null;
}

/** Casos "a futuro" vivos, ordenados por fecha estimada de retomar. */
export function casosFuturo(contracts: unknown): CasoFuturo[] {
  if (!Array.isArray(contracts)) return [];
  return (contracts as Rec[])
    .filter((c) => c && typeof c === "object" && str(c.status) === "borrador" && str(c.futuroFecha) !== "")
    .map((c) => {
      const ownerRaw = Number(c.salesOwnerId);
      return {
        id: str(c.id),
        title: str(c.title),
        client: str(c.client),
        futuroFecha: str(c.futuroFecha),
        // Un motivo que no está en la lista no se inventa: se deja vacío.
        futuroMotivo: isMotivoFuturo(c.futuroMotivo) ? c.futuroMotivo : ("" as const),
        futuroNota: str(c.futuroNota),
        salesOwnerId: Number.isInteger(ownerRaw) && ownerRaw > 0 ? ownerRaw : null,
      };
    })
    .sort((a, b) => a.futuroFecha.localeCompare(b.futuroFecha));
}

export interface CasoPerdido {
  id: string;
  title: string;
  client: string;
  motivo: MotivoPerdida | "sin_indicar";
  /** Cuándo se registró la pérdida (ms). */
  fecha: number;
}

/** Historial de perdidos, del más reciente al más antiguo. */
export function casosPerdidos(contracts: unknown): CasoPerdido[] {
  if (!Array.isArray(contracts)) return [];
  return (contracts as Rec[])
    .filter((c) => c && typeof c === "object" && desenlaceDe(c) === "perdido")
    .map((c) => ({
      id: str(c.id),
      title: str(c.title),
      client: str(c.client),
      motivo: motivoValido(c.motivoPerdida) ?? ("sin_indicar" as const),
      fecha: Number(c.updatedAt) || Number(c.createdAt) || 0,
    }))
    .sort((a, b) => b.fecha - a.fecha);
}
