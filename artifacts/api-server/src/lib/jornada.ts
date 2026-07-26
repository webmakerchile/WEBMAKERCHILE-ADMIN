/**
 * Reglas de la jornada medida por presencia en Discord.
 *
 * El sondeo corre cada minuto y solo sabe una cosa por persona: si en ESTE
 * instante está en un canal de voz. Estas funciones traducen esa foto a
 * sesiones de trabajo, y son puras a propósito: el tiempo que se le paga a
 * alguien no se decide dentro de una consulta a la base de datos.
 */

export interface OpenSession {
  id: number;
  userId: number;
  channelId: string;
  startedAt: Date;
  lastSeenAt: Date;
}

/** Lo que devuelve el sondeo por persona. */
export interface VoicePresence {
  userId: number;
  /** null = no está en ningún canal de voz. */
  channelId: string | null;
  channelName?: string;
}

export type SessionAction =
  | { kind: "open"; userId: number; channelId: string; channelName: string; at: Date }
  | { kind: "touch"; sessionId: number; at: Date; channelId: string; channelName: string }
  | { kind: "close"; sessionId: number; endedAt: Date; durationSeconds: number };

/**
 * Minutos de tolerancia antes de cerrar una sesión: Discord se cae, alguien
 * cambia de canal o se le corta el internet un momento. Sin tolerancia, media
 * hora de trabajo se convertiría en seis sesiones picadas.
 */
export const DEFAULT_GRACE_MINUTES = 3;

/** Sesiones más largas que esto se cierran solas: alguien dejó el Discord abierto. */
export const MAX_SESSION_HOURS = 14;

export function sessionSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

/**
 * Decide qué hacer con cada persona a partir de la foto del sondeo.
 *
 * - conectada y sin sesión abierta → abrir
 * - conectada y con sesión abierta → confirmar presencia (y anotar el canal)
 * - desconectada más allá de la tolerancia → cerrar, contando hasta la última
 *   vez que se la vio, no hasta ahora
 * - sesión abierta demasiado larga → cerrar igual (Discord quedó abierto)
 */
export function planSessionActions(
  presences: VoicePresence[],
  openSessions: OpenSession[],
  now: Date,
  graceMinutes = DEFAULT_GRACE_MINUTES,
): SessionAction[] {
  const openByUser = new Map<number, OpenSession>();
  for (const s of openSessions) openByUser.set(s.userId, s);

  const actions: SessionAction[] = [];
  const seenUsers = new Set<number>();

  for (const p of presences) {
    seenUsers.add(p.userId);
    const open = openByUser.get(p.userId);

    if (p.channelId) {
      if (open) {
        actions.push({
          kind: "touch",
          sessionId: open.id,
          at: now,
          channelId: p.channelId,
          channelName: p.channelName ?? "",
        });
      } else {
        actions.push({
          kind: "open",
          userId: p.userId,
          channelId: p.channelId,
          channelName: p.channelName ?? "",
          at: now,
        });
      }
      continue;
    }

    // Desconectada: se cierra solo si ya pasó la tolerancia.
    if (open) {
      const idleMs = now.getTime() - open.lastSeenAt.getTime();
      if (idleMs >= graceMinutes * 60_000) {
        actions.push({
          kind: "close",
          sessionId: open.id,
          endedAt: open.lastSeenAt,
          durationSeconds: sessionSeconds(open.startedAt, open.lastSeenAt),
        });
      }
    }
  }

  // Sesiones abiertas de gente que el sondeo no pudo consultar (se desvinculó,
  // salió del servidor, falló su consulta): misma regla de tolerancia.
  for (const open of openSessions) {
    if (seenUsers.has(open.userId)) continue;
    const idleMs = now.getTime() - open.lastSeenAt.getTime();
    if (idleMs >= graceMinutes * 60_000) {
      actions.push({
        kind: "close",
        sessionId: open.id,
        endedAt: open.lastSeenAt,
        durationSeconds: sessionSeconds(open.startedAt, open.lastSeenAt),
      });
    }
  }

  // Tope duro: una sesión no puede durar más que una jornada humana.
  for (const open of openSessions) {
    const already = actions.some(a => a.kind === "close" && a.sessionId === open.id);
    if (already) continue;
    const runningMs = now.getTime() - open.startedAt.getTime();
    if (runningMs > MAX_SESSION_HOURS * 3_600_000) {
      actions.push({
        kind: "close",
        sessionId: open.id,
        endedAt: open.lastSeenAt,
        durationSeconds: sessionSeconds(open.startedAt, open.lastSeenAt),
      });
    }
  }

  return actions;
}

export interface CountableSession {
  startedAt: Date;
  endedAt: Date | null;
  lastSeenAt: Date;
  durationSeconds: number;
}

/**
 * Segundos de una sesión. Si sigue abierta cuenta hasta `now` (para el
 * cronómetro en vivo), pero nunca más allá de la última presencia confirmada
 * más la tolerancia: si el sondeo se cayó, el reloj no sigue corriendo solo.
 */
export function countSession(s: CountableSession, now: Date, graceMinutes = DEFAULT_GRACE_MINUTES): number {
  if (s.endedAt) return s.durationSeconds || sessionSeconds(s.startedAt, s.endedAt);
  const cap = new Date(s.lastSeenAt.getTime() + graceMinutes * 60_000);
  const end = now < cap ? now : cap;
  return sessionSeconds(s.startedAt, end);
}

/** Suma en segundos de las sesiones que caen dentro del rango [from, to). */
export function sumSessions(
  sessions: CountableSession[],
  from: Date,
  to: Date,
  now: Date,
  graceMinutes = DEFAULT_GRACE_MINUTES,
): number {
  return sessions
    .filter(s => s.startedAt >= from && s.startedAt < to)
    .reduce((total, s) => total + countSession(s, now, graceMinutes), 0);
}

/** Formatea segundos como "13h 57m" / "48m" / "0m". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
