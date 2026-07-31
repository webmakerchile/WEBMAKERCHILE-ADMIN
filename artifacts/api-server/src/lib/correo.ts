// Envío de correos del sistema, vía Resend (conexión de Replit).
//
// Una sola puerta de salida para todo el correo. La regla de la casa: enviar
// NUNCA lanza — devuelve un resultado que quien llama guarda donde el equipo
// lo vaya a ver (el panel). Un correo que falla en silencio es una
// confirmación que el cliente esperó y nunca llegó, y nadie se enteró.

import { ReplitConnectors } from "@replit/connectors-sdk";

/** Buzón del equipo de ventas: recibe copia de cada firma. */
export const CORREO_EQUIPO = "webmakerventas@gmail.com";

export interface AdjuntoCorreo {
  filename: string;
  /** Contenido en base64 pelado (sin el prefijo data:). */
  content: string;
}

export interface CorreoSaliente {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: AdjuntoCorreo[];
}

export type ResultadoCorreo =
  | { ok: true }
  | { ok: false; motivo: "sin_configurar" | "fallido"; detalle: string };

/**
 * Remitente de los envíos.
 *
 * `RESEND_FROM` manda si está definido. Si no, se busca un dominio verificado
 * en la cuenta de Resend y se usa ventas@ese-dominio; sin dominio verificado
 * queda el remitente de pruebas de Resend — que solo entrega al dueño de la
 * cuenta, así que los envíos a clientes fallarán DE FORMA VISIBLE hasta que
 * se verifique el dominio. Se cachea 10 minutos: verificar el dominio no
 * exige reiniciar nada.
 */
let remitenteCache: { valor: string; hasta: number } | null = null;

async function remitente(): Promise<string> {
  if (process.env.RESEND_FROM) return process.env.RESEND_FROM;
  if (remitenteCache && remitenteCache.hasta > Date.now()) return remitenteCache.valor;
  let valor = "WebMaker Latam <onboarding@resend.dev>";
  try {
    const { status, body } = await llamarResend("/domains", { method: "GET" });
    if (status >= 200 && status < 300) {
      const data = (body as { data?: Array<{ name?: string; status?: string }> })?.data;
      const verificado = data?.find((d) => d.status === "verified")?.name;
      if (verificado) valor = `WebMaker Latam <ventas@${verificado}>`;
    }
  } catch {
    // Sin acceso a los dominios se usa el remitente de pruebas; si tampoco se
    // puede enviar, el error de verdad lo reporta enviarCorreo.
  }
  remitenteCache = { valor, hasta: Date.now() + 10 * 60_000 };
  return valor;
}

/** Normaliza la respuesta del proxy de conexiones a { status, body }. */
async function llamarResend(
  path: string,
  init: { method: string; body?: string },
): Promise<{ status: number; body: unknown }> {
  const res: unknown = await new ReplitConnectors().proxy("resend", path, {
    method: init.method,
    ...(init.body ? { headers: { "Content-Type": "application/json" }, body: init.body } : {}),
  });
  if (res && typeof (res as Response).json === "function") {
    const r = res as Response;
    let body: unknown = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  }
  // Por si alguna versión del SDK devolviera el JSON ya parseado.
  return { status: 200, body: res };
}

function mensajeDe(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string" && b.message) return b.message;
    if (typeof b.error === "string" && b.error) return b.error;
  }
  return "";
}

/**
 * Envía un correo. No lanza jamás: el resultado se guarda junto a lo que
 * motivó el envío (p. ej. la firma) para que el panel lo muestre.
 */
export async function enviarCorreo(correo: CorreoSaliente): Promise<ResultadoCorreo> {
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    return {
      ok: false,
      motivo: "sin_configurar",
      detalle: "El servicio de correo (Resend) no está conectado en este entorno.",
    };
  }
  try {
    const { status, body } = await llamarResend("/emails", {
      method: "POST",
      body: JSON.stringify({
        from: await remitente(),
        to: [correo.to],
        subject: correo.subject,
        html: correo.html,
        ...(correo.text ? { text: correo.text } : {}),
        ...(correo.attachments?.length ? { attachments: correo.attachments } : {}),
      }),
    });
    if (status >= 200 && status < 300) return { ok: true };
    const detalle = (mensajeDe(body) || `Resend respondió ${status}`).slice(0, 300);
    // 401/403 = credencial o conexión, no un envío puntual que salió mal.
    return { ok: false, motivo: status === 401 || status === 403 ? "sin_configurar" : "fallido", detalle };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    const sinConexion = /not connected|no connection|connectors?/i.test(m);
    return { ok: false, motivo: sinConexion ? "sin_configurar" : "fallido", detalle: m.slice(0, 300) };
  }
}
