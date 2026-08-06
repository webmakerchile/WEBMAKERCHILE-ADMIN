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

/* ==================== Motivo (qué se firma) ============================= */

/**
 * Qué se está firmando. Mismo enlace público, misma mecánica de firma
 * (dibujo/imagen/texto) y misma tabla para los tres — "aprobacion_proyecto" y
 * "cierre_proyecto" son los dos momentos nuevos del ciclo de vida de un
 * proyecto, y no cambian en nada cómo se firma un contrato.
 */
export const MOTIVOS_FIRMA = ["contrato", "aprobacion_proyecto", "cierre_proyecto"] as const;
export type MotivoFirma = (typeof MOTIVOS_FIRMA)[number];

/* ==================== Firma digital ==================================== */

export const METODOS_FIRMA = ["dibujo", "imagen", "texto"] as const;
export type MetodoFirma = (typeof METODOS_FIRMA)[number];

export const METODO_FIRMA_LABEL: Record<MetodoFirma, string> = {
  dibujo: "Dibujada a mano",
  imagen: "Imagen subida",
  texto: "Escrita a máquina",
};

/**
 * Tope del data URI de la firma (~1,5 MB de imagen real).
 *
 * La página ya reduce la imagen antes de mandarla, así que llegar aquí con más
 * es señal de que alguien saltó el formulario — no un cliente con mala suerte.
 */
export const MAX_FIRMA_DATA = 2_000_000;

/**
 * PNG o JPEG en data URI, con un cuerpo mínimo: un canvas vacío exportado pesa
 * menos que esto, y una "firma" en blanco no es una firma.
 */
const FIRMA_DATA_URI_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]{200,}$/;

export interface FirmaCapturada {
  kind: MetodoFirma;
  /** Data URI (dibujo/imagen) o el texto tecleado (texto). */
  data: string;
}

/**
 * Valida la firma tal como llegó del navegador, antes de guardarla.
 *
 * Devuelve error en texto para el CLIENTE: quien firma no tiene panel ni
 * consola, lo único que puede hacer con "payload inválido" es rendirse.
 */
export function validarFirma(
  kind: unknown,
  data: unknown,
): { ok: true; firma: FirmaCapturada } | { ok: false; error: string } {
  if (kind === "texto") {
    const t = String(data ?? "").replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 120) {
      return { ok: false, error: "Escribe tu firma: al menos 2 letras." };
    }
    return { ok: true, firma: { kind, data: t } };
  }
  if (kind === "dibujo" || kind === "imagen") {
    const d = typeof data === "string" ? data : "";
    // El largo se mira antes que el formato: no tiene sentido pasarle una
    // expresión regular a algo que de entrada no cabe.
    if (d.length > MAX_FIRMA_DATA) {
      return { ok: false, error: "La imagen de la firma pesa demasiado. Prueba con una más liviana." };
    }
    if (!FIRMA_DATA_URI_RE.test(d)) {
      return {
        ok: false,
        error: kind === "dibujo"
          ? "El dibujo llegó vacío. Dibuja tu firma en el recuadro y vuelve a confirmar."
          : "La imagen no es válida. Sube tu firma en PNG o JPG.",
      };
    }
    return { ok: true, firma: { kind, data: d } };
  }
  return { ok: false, error: "Elige cómo firmar: dibujarla, subir una imagen o escribirla." };
}
