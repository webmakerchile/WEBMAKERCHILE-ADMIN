/**
 * Cliente mínimo de la API de Discord (bot) para la verificación de asistencia.
 *
 * Modo de verificación elegido: CANAL DE VOZ. Un integrante "está en Discord"
 * si su voice state en el servidor tiene un channel_id. Se usa solo REST
 * (endpoints bot-only), sin gateway ni intents privilegiados de presencia.
 *
 * Degrada con gracia: sin DISCORD_BOT_TOKEN (o con la red caída) todo devuelve
 * null / reason y la asistencia sigue funcionando con la autodeclaración.
 */

const API = "https://discord.com/api/v10";
/** Permiso "View Channels" — lo único que necesita el bot. */
const INVITE_PERMISSIONS = "1024";
const FETCH_TIMEOUT_MS = 4_000;

export interface DiscordGuildMember {
  id: string;
  /** Nombre a mostrar: apodo del servidor → nombre global → username. */
  name: string;
  username: string;
  avatarUrl: string | null;
}

export function discordConfigured(): boolean {
  return !!process.env["DISCORD_BOT_TOKEN"]?.trim();
}

async function dFetch(path: string): Promise<{ status: number; json: unknown } | null> {
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim();
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* cuerpo vacío (p. ej. 204) */
    }
    return { status: res.status, json };
  } catch {
    return null; // timeout / red caída: nunca romper la asistencia por Discord
  }
}

/* ------------------------------- Caches ---------------------------------- */

type Cached<T> = { at: number; value: T };
let appCache: Cached<{ id: string; name: string } | null> | null = null;
let guildCache: Cached<{ id: string; name: string | null } | null> | null = null;
let membersCache: Cached<ListMembersResult> | null = null;
const voiceCache = new Map<string, Cached<boolean | null>>();

const APP_TTL_MS = 10 * 60_000;
const GUILD_HIT_TTL_MS = 10 * 60_000;
/** Si aún no hay servidor (bot recién creado), reintentar pronto. */
const GUILD_MISS_TTL_MS = 45_000;
const MEMBERS_TTL_MS = 60_000;
const VOICE_TTL_MS = 45_000;

/**
 * Envía un mensaje de texto a un canal de Discord configurado en
 * DISCORD_REPORT_CHANNEL_ID. Fire-and-forget: nunca bloquea ni lanza excepciones.
 */
export async function reportToChannel(message: string): Promise<void> {
  const channelId = process.env["DISCORD_REPORT_CHANNEL_ID"]?.trim();
  if (!channelId || !discordConfigured()) return;
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim();
  if (!token) return;
  try {
    await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // No interrumpir la asistencia por un fallo de reporte
  }
}

/* ------------------------- Mensajes directos (DM) ------------------------ */

/** Canal DM por usuario, para no recrearlo en cada notificación. */
const dmChannelCache = new Map<string, Cached<string | null>>();
const DM_CHANNEL_TTL_MS = 60 * 60_000;

/**
 * Envía un mensaje directo a un usuario de Discord.
 * Devuelve true si Discord aceptó el mensaje; false en cualquier otro caso
 * (bot sin token, usuario con DMs cerrados, red caída). Nunca lanza.
 */
export async function sendDirectMessage(discordUserId: string, content: string): Promise<boolean> {
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim();
  if (!token || !discordUserId) return false;
  try {
    let channelId: string | null = null;
    const hit = dmChannelCache.get(discordUserId);
    if (hit && Date.now() - hit.at < DM_CHANNEL_TTL_MS) {
      channelId = hit.value;
    } else {
      const cRes = await fetch(`${API}/users/@me/channels`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: discordUserId }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const cJson = (await cRes.json().catch(() => null)) as { id?: string } | null;
      channelId = cRes.ok && cJson?.id ? cJson.id : null;
      // Solo cachear éxitos: un fallo transitorio (timeout/5xx) no debe
      // silenciar los DMs de esta persona durante todo el TTL.
      if (channelId) dmChannelCache.set(discordUserId, { at: Date.now(), value: channelId });
    }
    if (!channelId) return false;

    const mRes = await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!mRes.ok && (mRes.status === 403 || mRes.status === 404)) {
      // Canal inválido o DMs cerrados: descartar el canal cacheado para que
      // el próximo aviso intente recrearlo en vez de esperar el TTL.
      dmChannelCache.delete(discordUserId);
    }
    return mRes.ok;
  } catch {
    return false; // DMs cerrados / red caída: la notificación del panel es la fuente de verdad
  }
}

/** Solo para tests. */
export function _resetDiscordCache(): void {
  dmChannelCache.clear();
  appCache = null;
  guildCache = null;
  membersCache = null;
  voiceCache.clear();
}

/* ------------------------------- Lecturas -------------------------------- */

/** Aplicación del bot (id + nombre). null = token ausente o inválido. */
export async function getBotApp(): Promise<{ id: string; name: string } | null> {
  if (appCache && Date.now() - appCache.at < APP_TTL_MS && appCache.value) return appCache.value;
  const r = await dFetch("/oauth2/applications/@me");
  const j = r?.json as { id?: string; name?: string } | null;
  const value = r?.status === 200 && j?.id ? { id: j.id, name: j.name ?? "Bot" } : null;
  appCache = { at: Date.now(), value };
  return value;
}

/** URL de invitación del bot al servidor (solo permiso "View Channels"). */
export function inviteUrl(appId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot&permissions=${INVITE_PERMISSIONS}`;
}

/**
 * Servidor donde vive el equipo. Prioridad: env DISCORD_GUILD_ID; si no está,
 * el único servidor donde esté el bot (si está en varios, se exige la env).
 */
export async function resolveGuild(): Promise<{ id: string; name: string | null } | null> {
  const envId = process.env["DISCORD_GUILD_ID"]?.trim();
  const ttl = guildCache?.value ? GUILD_HIT_TTL_MS : GUILD_MISS_TTL_MS;
  if (guildCache && Date.now() - guildCache.at < ttl) return guildCache.value;

  let value: { id: string; name: string | null } | null = null;
  const r = await dFetch("/users/@me/guilds");
  const fetched = r?.status === 200 && Array.isArray(r.json);
  const guilds = fetched ? (r!.json as { id: string; name?: string }[]) : [];
  if (envId) {
    const hit = guilds.find((g) => g.id === envId);
    if (hit) {
      value = { id: envId, name: hit.name ?? null };
    } else if (!fetched) {
      // Red caída / token temporalmente no consultable: confiar en la env.
      value = { id: envId, name: null };
    } else {
      // La env apunta a un servidor donde el bot NO está: no verificable.
      console.warn("[Discord] DISCORD_GUILD_ID no coincide con ningún servidor del bot");
    }
  } else if (guilds.length === 1) {
    value = { id: guilds[0]!.id, name: guilds[0]!.name ?? null };
  } else if (guilds.length > 1) {
    console.warn("[Discord] El bot está en varios servidores; define DISCORD_GUILD_ID");
  }
  guildCache = { at: Date.now(), value };
  return value;
}

export type ListMembersResult =
  | { ok: true; members: DiscordGuildMember[] }
  | { ok: false; reason: "unconfigured" | "noguild" | "intent" | "error" };

/**
 * Miembros humanos del servidor (para el emparejamiento). reason "intent" =
 * falta activar "Server Members Intent" en el portal de desarrolladores.
 */
export async function listGuildMembers(): Promise<ListMembersResult> {
  if (!discordConfigured()) return { ok: false, reason: "unconfigured" };
  if (membersCache && Date.now() - membersCache.at < MEMBERS_TTL_MS) return membersCache.value;

  const guild = await resolveGuild();
  if (!guild) return { ok: false, reason: "noguild" };

  type RawMember = {
    nick?: string | null;
    user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  };
  const rows: RawMember[] = [];
  let after: string | undefined;
  let value: ListMembersResult | null = null;
  // Paginación por si el servidor supera los 1000 miembros (tope: 5 páginas).
  for (let page = 0; page < 5; page++) {
    const r = await dFetch(`/guilds/${guild.id}/members?limit=1000${after ? `&after=${after}` : ""}`);
    if (r?.status === 403) {
      value = { ok: false, reason: "intent" };
      break;
    }
    if (r?.status !== 200 || !Array.isArray(r.json)) {
      if (page === 0) value = { ok: false, reason: "error" };
      break; // páginas posteriores fallidas: nos quedamos con lo acumulado
    }
    const batch = r.json as RawMember[];
    rows.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1]?.user?.id;
    if (!after) break;
  }
  if (!value) {
    value = {
      ok: true,
      members: rows
        .filter((m) => m.user && !m.user.bot)
        .map((m) => ({
          id: m.user!.id,
          name: m.nick || m.user!.global_name || m.user!.username,
          username: m.user!.username,
          avatarUrl: m.user!.avatar
            ? `https://cdn.discordapp.com/avatars/${m.user!.id}/${m.user!.avatar}.png?size=64`
            : null,
        })),
    };
  }
  membersCache = { at: Date.now(), value };
  return value;
}

/**
 * ¿Está el usuario en un canal de voz del servidor AHORA?
 * true/false = verificado; null = no se pudo verificar (sin bot/servidor/red).
 * Cache de 45 s por usuario; `fresh` fuerza consulta nueva (check-in y barrido).
 */
export async function voiceStatus(
  discordUserId: string,
  opts: { fresh?: boolean } = {},
): Promise<boolean | null> {
  if (!discordConfigured()) return null;
  const hit = voiceCache.get(discordUserId);
  if (!opts.fresh && hit && Date.now() - hit.at < VOICE_TTL_MS) return hit.value;

  const guild = await resolveGuild();
  if (!guild) return null;

  const r = await dFetch(`/guilds/${guild.id}/voice-states/${discordUserId}`);
  let value: boolean | null = null;
  if (r?.status === 200) {
    value = !!(r.json as { channel_id?: string | null } | null)?.channel_id;
  } else if (r?.status === 404) {
    // Solo los 404 "de usuario" significan "no está en voz":
    // 10065 Unknown Voice State · 10007 Unknown Member · 10013 Unknown User.
    // Otros (p. ej. 10004 Unknown Guild) = NO verificable → null, no false.
    const code = (r.json as { code?: number } | null)?.code;
    value = code === 10065 || code === 10007 || code === 10013 ? false : null;
  }
  voiceCache.set(discordUserId, { at: Date.now(), value });
  return value;
}
