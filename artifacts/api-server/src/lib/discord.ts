/**
 * Cliente mínimo de Discord para medir presencia en voz.
 *
 * No se usa un bot con conexión permanente (gateway): el servidor de la API ya
 * corre un ciclo cada minuto, y Discord expone el estado de voz por REST. Menos
 * piezas móviles, y si la integración se cae se nota en `/api/jornada/status`
 * en vez de fallar en silencio.
 *
 * Requiere en el servidor:
 *   DISCORD_BOT_TOKEN   token del bot (debe estar en el servidor de la agencia)
 *   DISCORD_GUILD_ID    id del servidor
 * Opcionales:
 *   DISCORD_WORK_CHANNEL_IDS  ids de canales que cuentan como jornada (coma)
 *   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_CALLBACK_URL  para vincular cuentas
 */

const API = "https://discord.com/api/v10";

export interface DiscordVoiceState {
  channelId: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
}

export interface DiscordHealth {
  configured: boolean;
  oauthConfigured: boolean;
  guildId: string;
  workChannelIds: string[];
  lastPollAt: string | null;
  lastPollOk: boolean;
  lastError: string | null;
  linkedUsers: number;
}

const health: {
  lastPollAt: Date | null;
  lastPollOk: boolean;
  lastError: string | null;
} = { lastPollAt: null, lastPollOk: false, lastError: null };

export function discordConfigured(): boolean {
  return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

export function discordOAuthConfigured(): boolean {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

/** Canales que cuentan como jornada. Vacío = cualquier canal de voz cuenta. */
export function workChannelIds(): string[] {
  return (process.env.DISCORD_WORK_CHANNEL_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function discordHealth(linkedUsers: number): DiscordHealth {
  return {
    configured: discordConfigured(),
    oauthConfigured: discordOAuthConfigured(),
    guildId: process.env.DISCORD_GUILD_ID || "",
    workChannelIds: workChannelIds(),
    lastPollAt: health.lastPollAt ? health.lastPollAt.toISOString() : null,
    lastPollOk: health.lastPollOk,
    lastError: health.lastError,
    linkedUsers,
  };
}

export function markPoll(ok: boolean, error?: string) {
  health.lastPollAt = new Date();
  health.lastPollOk = ok;
  health.lastError = ok ? null : (error ?? "error desconocido");
}

async function botFetch(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  });
}

/**
 * Estado de voz de una persona en el servidor de la agencia.
 * Devuelve `{ channelId: null }` cuando no está conectada (Discord responde 404).
 * Devuelve null cuando la consulta falló: no es lo mismo "no conectado" que
 * "no pude preguntar", y confundirlos cerraría jornadas que siguen vivas.
 */
export async function getVoiceState(discordUserId: string): Promise<DiscordVoiceState | null> {
  if (!discordConfigured()) return null;
  const guild = process.env.DISCORD_GUILD_ID;
  try {
    const res = await botFetch(`/guilds/${guild}/voice-states/${discordUserId}`);
    if (res.status === 404) return { channelId: null };
    if (!res.ok) {
      markPoll(false, `Discord respondió ${res.status} al consultar el estado de voz`);
      return null;
    }
    const data = await res.json() as { channel_id?: string | null; self_mute?: boolean; self_deaf?: boolean };
    return {
      channelId: data.channel_id ?? null,
      selfMute: data.self_mute,
      selfDeaf: data.self_deaf,
    };
  } catch (e) {
    markPoll(false, e instanceof Error ? e.message : "fallo de red con Discord");
    return null;
  }
}

const channelNameCache = new Map<string, string>();

export async function getChannelName(channelId: string): Promise<string> {
  if (!channelId) return "";
  const cached = channelNameCache.get(channelId);
  if (cached) return cached;
  try {
    const res = await botFetch(`/channels/${channelId}`);
    if (!res.ok) return "";
    const data = await res.json() as { name?: string };
    const name = data.name ?? "";
    if (name) channelNameCache.set(channelId, name);
    return name;
  } catch {
    return "";
  }
}

/* ---------- OAuth: vincular la cuenta del panel con la de Discord ---------- */

export function discordAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || "",
    redirect_uri: discordCallbackUrl(),
    response_type: "code",
    scope: "identify",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function discordCallbackUrl(): string {
  return process.env.DISCORD_CALLBACK_URL || "https://admin.webmakerlatam.com/api/discord/callback";
}

export async function exchangeCode(code: string): Promise<{ id: string; username: string } | null> {
  if (!discordOAuthConfigured()) return null;
  try {
    const tokenRes = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "",
        client_secret: process.env.DISCORD_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: discordCallbackUrl(),
      }),
    });
    if (!tokenRes.ok) return null;
    const token = await tokenRes.json() as { access_token?: string };
    if (!token.access_token) return null;

    const meRes = await fetch(`${API}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) return null;
    const me = await meRes.json() as { id: string; username: string; global_name?: string };
    return { id: me.id, username: me.global_name || me.username };
  } catch {
    return null;
  }
}
