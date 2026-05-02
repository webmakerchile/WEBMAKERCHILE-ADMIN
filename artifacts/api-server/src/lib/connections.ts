import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "./notifications";

export type ConnectionState =
  | "connected"
  | "expiring"
  | "expired"
  | "revoked"
  | "disconnected"
  | "unknown";

export type Network = "youtube" | "tiktok" | "instagram" | "linkedin" | "x" | "facebook";

export type ConnectionHealth = {
  network: Network;
  connected: boolean;
  state: ConnectionState;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  message: string;
  reconnectUrl: string | null;
  serverManaged: boolean;
  displayName?: string | null;
  picture?: string | null;
};

const EXPIRY_WARNING_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days remaining until `future`. We use `Math.ceil` for future
 * timestamps so something 12h away is reported as "1 día" rather than 0.
 * Past timestamps return a negative integer via Math.floor.
 */
function daysBetween(future: Date | null | undefined): number | null {
  if (!future) return null;
  const diff = new Date(future).getTime() - Date.now();
  if (diff < 0) return Math.floor(diff / ONE_DAY_MS);
  return Math.ceil(diff / ONE_DAY_MS);
}

function classifyByExpiry(
  hasToken: boolean,
  hasRefresh: boolean,
  expiresAt: Date | null | undefined,
): { state: ConnectionState; days: number | null; iso: string | null } {
  if (!hasToken) return { state: "disconnected", days: null, iso: null };
  if (!expiresAt) {
    // No expiration metadata; if there's a refresh token assume long-lived,
    // otherwise unknown (we can't tell when it'll die).
    return { state: hasRefresh ? "connected" : "unknown", days: null, iso: null };
  }
  const expiryMs = new Date(expiresAt).getTime();
  const iso = new Date(expiresAt).toISOString();
  // Use raw ms diff to avoid rounding masking a freshly-expired token.
  if (expiryMs <= Date.now()) {
    const days = daysBetween(expiresAt);
    return { state: hasRefresh ? "connected" : "expired", days, iso };
  }
  const days = daysBetween(expiresAt);
  if (days === null) return { state: "unknown", days: null, iso };
  if (days <= EXPIRY_WARNING_DAYS) return { state: "expiring", days, iso };
  return { state: "connected", days, iso };
}

const RECONNECT_URLS: Record<Network, string | null> = {
  youtube: "/api/auth/google",
  tiktok: "/api/tiktok/auth",
  instagram: null,
  linkedin: "/api/linkedin/auth",
  x: "/api/x/auth",
  facebook: "/api/facebook/auth",
};

const HUMAN_LABELS: Record<Network, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
};

function messageForState(network: Network, state: ConnectionState, days: number | null): string {
  const label = HUMAN_LABELS[network];
  switch (state) {
    case "connected":
      return `${label} conectado.`;
    case "expiring":
      return days != null
        ? `La sesión de ${label} caduca en ${days} día${days === 1 ? "" : "s"}. Reconecta pronto para evitar fallas al publicar.`
        : `La sesión de ${label} caduca pronto. Reconecta para evitar fallas al publicar.`;
    case "expired":
      return `La sesión de ${label} expiró. Reconecta tu cuenta para volver a publicar.`;
    case "revoked":
      return `Acceso a ${label} revocado por el proveedor. Reconecta tu cuenta.`;
    case "disconnected":
      return `${label} no está conectado.`;
    case "unknown":
    default:
      return `Estado de ${label} desconocido.`;
  }
}

export async function getConnectionsHealth(user: any): Promise<ConnectionHealth[]> {
  const out: ConnectionHealth[] = [];

  // YouTube (Google) - tokens auto-refresh as long as we have a refresh token.
  // Without a refresh token the access token will silently die ~1h after issuance,
  // so surface that as "unknown" (we don't know when) rather than a misleading
  // "expiring in null días" warning.
  {
    const hasToken = !!user.googleAccessToken;
    const hasRefresh = !!user.googleRefreshToken;
    const state: ConnectionState = !hasToken
      ? "disconnected"
      : hasRefresh
      ? "connected"
      : "unknown";
    const message = !hasToken
      ? messageForState("youtube", "disconnected", null)
      : hasRefresh
      ? messageForState("youtube", "connected", null)
      : "La sesión de YouTube no tiene refresh token; podría caducar pronto. Reconecta para evitar fallas.";
    out.push({
      network: "youtube",
      connected: state === "connected" || state === "expiring" || state === "unknown",
      state,
      expiresAt: null,
      daysUntilExpiry: null,
      message,
      reconnectUrl: RECONNECT_URLS.youtube,
      serverManaged: false,
    });
  }

  // TikTok
  {
    const hasToken = !!user.tiktokAccessToken;
    const { state, days, iso } = classifyByExpiry(hasToken, !!user.tiktokRefreshToken, user.tiktokTokenExpiresAt);
    out.push({
      network: "tiktok",
      connected: state === "connected" || state === "expiring",
      state,
      expiresAt: iso,
      daysUntilExpiry: days,
      message: messageForState("tiktok", state, days),
      reconnectUrl: RECONNECT_URLS.tiktok,
      serverManaged: false,
      displayName: user.tiktokDisplayName,
    });
  }

  // LinkedIn
  {
    const hasToken = !!user.linkedinAccessToken;
    const { state, days, iso } = classifyByExpiry(hasToken, false, user.linkedinTokenExpiresAt);
    out.push({
      network: "linkedin",
      connected: state === "connected" || state === "expiring",
      state,
      expiresAt: iso,
      daysUntilExpiry: days,
      message: messageForState("linkedin", state, days),
      reconnectUrl: RECONNECT_URLS.linkedin,
      serverManaged: false,
      displayName: user.linkedinName,
      picture: user.linkedinPicture,
    });
  }

  // X
  {
    const hasToken = !!user.xAccessToken;
    const { state, days, iso } = classifyByExpiry(hasToken, !!user.xRefreshToken, user.xTokenExpiresAt);
    out.push({
      network: "x",
      connected: state === "connected" || state === "expiring",
      state,
      expiresAt: iso,
      daysUntilExpiry: days,
      message: messageForState("x", state, days),
      reconnectUrl: RECONNECT_URLS.x,
      serverManaged: false,
      displayName: user.xUsername ? `@${user.xUsername}` : null,
    });
  }

  // Facebook (server-managed System User token preferred, fallback to user OAuth)
  {
    const serverPage = (process.env.FACEBOOK_PAGE_ID || "").trim();
    const serverToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
    if (serverPage && serverToken) {
      out.push({
        network: "facebook",
        connected: true,
        state: "connected",
        expiresAt: null,
        daysUntilExpiry: null,
        message: "Facebook conectado (System User del servidor).",
        reconnectUrl: null,
        serverManaged: true,
      });
    } else {
      const hasToken = !!user.facebookPageAccessToken || !!user.facebookUserAccessToken;
      const { state, days, iso } = classifyByExpiry(hasToken, false, user.facebookTokenExpiresAt);
      out.push({
        network: "facebook",
        connected: state === "connected" || state === "expiring",
        state,
        expiresAt: iso,
        daysUntilExpiry: days,
        message: messageForState("facebook", state, days),
        reconnectUrl: RECONNECT_URLS.facebook,
        serverManaged: false,
        displayName: user.facebookPageName,
        picture: user.facebookPagePicture,
      });
    }
  }

  // Instagram (server-managed via INSTAGRAM_ACCESS_TOKEN)
  {
    const igToken = (process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
    const igUser = (process.env.INSTAGRAM_USER_ID || "").trim();
    const present = !!(igToken && igUser);
    out.push({
      network: "instagram",
      connected: present,
      state: present ? "connected" : "disconnected",
      expiresAt: null,
      daysUntilExpiry: null,
      message: present
        ? "Instagram conectado (token de servidor)."
        : "Instagram no configurado en el servidor.",
      reconnectUrl: null,
      serverManaged: true,
    });
  }

  return out;
}

/**
 * In-memory dedup so we don't spam notifications about the same network
 * within a single process lifetime more than once per ~24h.
 */
const lastWarnedAt = new Map<string, number>();

export async function notifyExpiringConnections(userId: number, health: ConnectionHealth[]): Promise<void> {
  const now = Date.now();
  for (const h of health) {
    if (h.state !== "expiring" && h.state !== "expired") continue;
    const key = `${userId}:${h.network}:${h.state}`;
    const last = lastWarnedAt.get(key) || 0;
    if (now - last < ONE_DAY_MS) continue;
    lastWarnedAt.set(key, now);
    try {
      await createNotification({
        userId,
        type: "system",
        title:
          h.state === "expired"
            ? `Conexión expirada: ${HUMAN_LABELS[h.network]}`
            : `Conexión por expirar: ${HUMAN_LABELS[h.network]}`,
        body: h.message,
        link: "/cuentas",
      });
    } catch (err: any) {
      console.error(`[Connections] Failed to notify ${h.network}:`, err?.message || err);
    }
  }
}

/**
 * Loads the first admin user (single-tenant fallback used by scheduler) and
 * fires "expiring soon" notifications. Safe to call from scheduler tick.
 */
export async function checkConnectionsForAdmin(): Promise<void> {
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (!admin) return;
  const health = await getConnectionsHealth(admin);
  await notifyExpiringConnections(admin.id, health);
}
