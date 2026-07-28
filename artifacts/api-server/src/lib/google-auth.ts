// Credenciales de Google por usuario, con un fallo legible.
//
// googleapis acepta `setCredentials({ access_token: null })` sin quejarse y
// revienta MUCHO después, al hacer la petición, con este mensaje:
//
//   "No access, refresh token, API key or refresh handler callback is set."
//
// Ese texto llegaba tal cual a la pantalla del ejecutivo de ventas cuando su
// cuenta no tenía Google conectado. No dice qué pasó ni qué hacer, y aparecía a
// mitad de crear un contrato, así que parecía que el panel estaba roto.
//
// Aquí se comprueba ANTES y se responde con algo accionable.

import { google } from "googleapis";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export interface UsuarioConGoogle {
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
}

/** Mensaje único: la UI lo muestra tal cual, así que dice qué hacer. */
export const MENSAJE_SIN_GOOGLE =
  "Tu cuenta no tiene Google Drive conectado. Cierra sesión y vuelve a entrar con Google para autorizar el acceso a Drive. Mientras tanto puedes pegar el enlace de la carpeta a mano.";

/** true si el usuario tiene credenciales utilizables de Google. */
export function tieneGoogle(user: UsuarioConGoogle | null | undefined): boolean {
  return !!(user?.googleAccessToken || user?.googleRefreshToken);
}

/**
 * Cliente OAuth del usuario, o `null` si no tiene credenciales.
 *
 * Devolver null en vez de un cliente inservible obliga a decidir qué responder
 * en cada ruta, que es justo lo que faltaba.
 */
export function clienteGoogleDe(user: UsuarioConGoogle | null | undefined) {
  if (!tieneGoogle(user)) return null;
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user!.googleAccessToken ?? undefined,
    refresh_token: user!.googleRefreshToken ?? undefined,
  });
  return oauth2Client;
}

/**
 * Traduce un error de Google a algo que la persona pueda accionar.
 *
 * Se aplica en el catch de las rutas: si el token expiró o fue revocado, el
 * mensaje crudo tampoco sirve ("invalid_grant" no le dice nada a nadie).
 */
export function mensajeErrorGoogle(err: unknown): string {
  const crudo = (err as { message?: string })?.message ?? String(err);
  if (/No access, refresh token|invalid_grant|Invalid Credentials|unauthorized_client/i.test(crudo)) {
    return MENSAJE_SIN_GOOGLE;
  }
  if (/insufficient|forbidden|403/i.test(crudo)) {
    return "Google rechazó la operación por permisos. Vuelve a conectar tu cuenta autorizando el acceso a Drive.";
  }
  if (/quota|rate limit|429/i.test(crudo)) {
    return "Google está limitando las peticiones ahora mismo. Espera un momento y vuelve a intentarlo.";
  }
  return crudo;
}
