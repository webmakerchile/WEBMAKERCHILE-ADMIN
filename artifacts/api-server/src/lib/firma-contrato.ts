// Firma de cotizaciones y contratos por enlace de aceptación.
//
// No es firma electrónica avanzada y no se presenta como tal: es un enlace
// único por documento, y al aceptarlo se registra QUIÉN dijo que sí, CUÁNDO y
// DESDE DÓNDE. Eso es lo que convierte un "sí" de WhatsApp en algo que se
// puede mostrar meses después.
//
// La lógica vive aquí, separada de las rutas, porque un fallo en la validación
// del enlace no rompe una pantalla: deja firmar a quien no debía, o da por
// firmado algo que no lo está.

import crypto from "crypto";

/** Estados posibles de un enlace de firma. */
export type EstadoFirma = "pendiente" | "firmado" | "anulado";

export interface EnlaceFirma {
  token: string;
  estado: EstadoFirma;
  /** ISO. Null = no caduca. */
  expiresAt: string | null;
  signedAt: string | null;
}

/**
 * Token del enlace.
 *
 * 32 bytes en base64url: quien recibe el enlace puede aceptar sin identificarse,
 * así que adivinarlo equivaldría a firmar en nombre de otro. Con un id
 * secuencial o un uuid v4 corto esto sería un problema real.
 */
export function generarToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Un token con la forma que genera `generarToken`. */
export function tokenValido(token: unknown): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

export type MotivoRechazo = "no_existe" | "caducado" | "ya_firmado" | "anulado";

/** Por qué NO se puede firmar este enlace, o null si sí se puede. */
export function motivoNoFirmable(
  enlace: EnlaceFirma | null | undefined,
  ahora: Date = new Date(),
): MotivoRechazo | null {
  if (!enlace) return "no_existe";
  if (enlace.estado === "anulado") return "anulado";
  // Se mira el estado Y la fecha: un enlace puede estar firmado sin que su
  // estado se haya actualizado si algo falló a medias.
  if (enlace.estado === "firmado" || enlace.signedAt) return "ya_firmado";
  if (enlace.expiresAt && new Date(enlace.expiresAt).getTime() <= ahora.getTime()) return "caducado";
  return null;
}

/** Texto para quien lo va a leer, que es el CLIENTE y no el equipo. */
export const TEXTO_RECHAZO: Record<MotivoRechazo, string> = {
  no_existe: "Este enlace no es válido. Pídele al equipo de WebMakerLatam que te envíe uno nuevo.",
  caducado: "Este enlace caducó. Escríbele al equipo de WebMakerLatam para que te envíe uno vigente.",
  ya_firmado: "Este documento ya fue aceptado. No hace falta que hagas nada más.",
  anulado: "Este enlace fue anulado. Escríbele al equipo de WebMakerLatam para que te envíe el documento actualizado.",
};

/** Días que dura un enlace si no se dice otra cosa. */
export const DIAS_VIGENCIA = 30;

/** Fecha de caducidad a partir de hoy. */
export function caducidad(dias: number = DIAS_VIGENCIA, desde: Date = new Date()): Date {
  const d = Number.isFinite(dias) && dias > 0 ? Math.min(Math.floor(dias), 365) : DIAS_VIGENCIA;
  return new Date(desde.getTime() + d * 86400000);
}

/**
 * IP de quien acepta, mirando la cabecera del proxy.
 *
 * La app va detrás de un proxy, así que `req.ip` es la del proxy y registrarla
 * no distinguiría a un cliente de otro — justamente lo único que este registro
 * tiene que probar. Se toma la PRIMERA de `x-forwarded-for`, que es la del
 * cliente original; las siguientes son proxies intermedios.
 */
export function ipDeLaPeticion(cabeceras: Record<string, unknown>, respaldo?: string): string {
  const xff = cabeceras["x-forwarded-for"];
  const crudo = Array.isArray(xff) ? xff[0] : xff;
  const primera = String(crudo ?? "").split(",")[0]?.trim();
  return primera || String(cabeceras["x-real-ip"] ?? "") || respaldo || "";
}

/** Nombre de quien firma, saneado para guardarlo y mostrarlo. */
export function limpiarNombreFirmante(valor: unknown): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * ¿Es aceptable como identificación de quien firma?
 *
 * Se exige un nombre porque el registro sin él no prueba nada: "alguien desde
 * esta IP dijo que sí" no sirve para enseñárselo a nadie.
 */
export function nombreFirmanteValido(valor: unknown): boolean {
  return limpiarNombreFirmante(valor).length >= 3;
}

/** URL pública del enlace, a partir de la base del panel. */
export function urlDeFirma(base: string, token: string): string {
  const limpia = base.replace(/\/+$/, "");
  return `${limpia}/api/firma/${token}`;
}
