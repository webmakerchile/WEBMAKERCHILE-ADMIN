/**
 * Barrido periódico de verificación de Discord durante la jornada:
 * cada ~2 min revisa, para cada sesión ABIERTA de un usuario emparejado,
 * si está en un canal de voz, y acumula checks/hits en la sesión. Con eso
 * el overview puede mostrar "% de la jornada en Discord" honesto.
 *
 * Además, ENTRADA AUTOMÁTICA: si un usuario emparejado está en un canal de
 * voz y NO tiene jornada abierta, el barrido se la abre solo — conectarse a
 * Discord basta para que las horas empiecen a contar, sin apretar botones.
 * Única excepción: si marcó salida hace poco (gracia de 30 min), se respeta
 * esa decisión y no se le reabre la jornada por seguir conectado un rato.
 */
import { db } from "@workspace/db";
import { hubWorkSessions, users } from "@workspace/db/schema";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { discordConfigured, reportToChannel, voiceStatus } from "./discord";
import { createNotification } from "./notifications";
import { saveDaySummary } from "./activity";
import { jornadaLink } from "./jornada-link";

const SWEEP_INTERVAL_MS = 2 * 60_000; // cada 2 min — bajo consumo para equipos pequeños
/** Sesiones pasadas del tope de 16 h ya no suman horas: tampoco se verifican. */
const SESSION_CAP_MS = 16 * 3_600_000;
/** Tras marcar salida, cuánto tiempo NO reabrimos aunque siga en voz. */
export const AUTO_RESTART_GRACE_MS = 30 * 60_000;

/**
 * ¿Corresponde abrirle jornada automáticamente? Regla pura y testeable:
 * está en voz, no tiene sesión abierta y no marcó salida hace poco.
 */
export function shouldAutoStart(input: {
  inVoice: boolean | null;
  hasOpenSession: boolean;
  lastCheckOutAt: Date | null;
  now: Date;
}): boolean {
  if (input.inVoice !== true) return false;
  if (input.hasOpenSession) return false;
  if (input.lastCheckOutAt && input.now.getTime() - input.lastCheckOutAt.getTime() < AUTO_RESTART_GRACE_MS) {
    return false;
  }
  return true;
}

/** Evita barridos solapados si Discord responde lento (setInterval no espera). */
let sweeping = false;

export async function sweepOnce(now: Date = new Date()): Promise<void> {
  if (!discordConfigured()) return;
  if (sweeping) return;
  sweeping = true;
  try {
    await runSweep(now);
  } finally {
    sweeping = false;
  }
}

async function runSweep(now: Date): Promise<void> {
  const open = await db
    .select({
      id: hubWorkSessions.id,
      userId: hubWorkSessions.userId,
      checkIn: hubWorkSessions.checkIn,
      discordUserId: users.discordUserId,
    })
    .from(hubWorkSessions)
    .innerJoin(users, eq(users.id, hubWorkSessions.userId))
    .where(isNull(hubWorkSessions.checkOut));

  // Sesiones "zombi": abiertas más allá del tope de 16 h (salida olvidada).
  // Se cierran solas EN el tope; si quedaran abiertas para siempre, además de
  // ensuciar el historial BLOQUEAN la entrada automática de los días
  // siguientes (autoStart ve "sesión abierta" y no vuelve a abrir).
  const expired = open.filter((s) => now.getTime() - new Date(s.checkIn).getTime() > SESSION_CAP_MS);
  for (const s of expired) {
    await autoCloseExpired(s.id, s.userId, new Date(s.checkIn)).catch((e) =>
      console.error("[DiscordSweep] cierre automático falló:", e),
    );
  }
  const active = open.filter((s) => now.getTime() - new Date(s.checkIn).getTime() <= SESSION_CAP_MS);

  for (const s of active) {
    if (!s.discordUserId) continue;
    const inVoice = await voiceStatus(s.discordUserId, { fresh: true });
    if (inVoice === null) continue; // no verificable: no cuenta como check
    await db
      .update(hubWorkSessions)
      .set({
        discordChecks: sql`${hubWorkSessions.discordChecks} + 1`,
        ...(inVoice
          ? { discordHits: sql`${hubWorkSessions.discordHits} + 1`, discordLastSeenAt: now }
          : {}),
      })
      .where(eq(hubWorkSessions.id, s.id));
  }

  // Solo las sesiones que siguen realmente abiertas bloquean la entrada
  // automática: las zombis recién cerradas ya no cuentan.
  await autoStartSessions(now, new Set(active.map((s) => s.userId)));
}

/** Minutos entre dos fechas con el mismo tope de 16 h que usa jornada. */
function cappedMinutes(a: Date, b: Date): number {
  return Math.min(Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)), SESSION_CAP_MS / 60000);
}

/**
 * Cierra una sesión zombi con salida = entrada + 16 h (el mismo tope con el
 * que jornada cuenta las horas, así el cierre no cambia ningún total) y deja
 * el día resumido igual que un check-out manual.
 */
async function autoCloseExpired(sessionId: number, userId: number, checkIn: Date): Promise<void> {
  const checkOut = new Date(checkIn.getTime() + SESSION_CAP_MS);
  const [session] = await db
    .update(hubWorkSessions)
    .set({ checkOut })
    .where(and(eq(hubWorkSessions.id, sessionId), isNull(hubWorkSessions.checkOut)))
    .returning();
  if (!session) return; // carrera con un check-out manual: nada que hacer

  // Resumen del día (mismo criterio que el check-out manual: acumulado de la fecha).
  try {
    const daySessions = await db
      .select()
      .from(hubWorkSessions)
      .where(and(eq(hubWorkSessions.userId, userId), eq(hubWorkSessions.workDate, session.workDate)));
    const total = daySessions
      .filter((x) => x.checkOut)
      .reduce((acc, x) => acc + cappedMinutes(new Date(x.checkIn), new Date(x.checkOut!)), 0);
    await saveDaySummary(userId, session.workDate, { minutes: total });
  } catch (err) {
    console.error("[DiscordSweep] resumen tras cierre automático falló:", err);
  }

  const [u] = await db.select({ name: users.name, email: users.email, teamRole: users.teamRole }).from(users).where(eq(users.id, userId)).limit(1);
  const displayName = u?.name || u?.email || `usuario ${userId}`;
  createNotification({
    userId,
    type: "system",
    title: "Jornada cerrada automáticamente ⏱️",
    body: "Tu jornada quedó abierta más de 16 horas (salida olvidada), así que la cerramos en el tope de 16 h. Si te conectas a Discord, se abre una nueva sola.",
    link: jornadaLink(u?.teamRole),
  }).catch(() => {});
  reportToChannel(`⏱️ **${displayName}** olvidó marcar salida: jornada cerrada automáticamente en el tope de 16 h`).catch(() => {});
}

/** Día local YYYY-MM-DD en America/Santiago (mismo criterio que jornada). */
function localDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/**
 * Entrada automática: usuarios emparejados y aprobados, sin jornada abierta,
 * detectados en un canal de voz → se les abre la sesión (marcada como
 * automática), se les avisa y se reporta al canal, igual que una entrada
 * manual.
 */
async function autoStartSessions(now: Date, openUserIds: Set<number>): Promise<void> {
  const linked = await db
    .select({ id: users.id, name: users.name, email: users.email, teamRole: users.teamRole, discordUserId: users.discordUserId })
    .from(users)
    .where(and(isNotNull(users.discordUserId), eq(users.approvalStatus, "approved")));

  for (const u of linked) {
    if (!u.discordUserId || openUserIds.has(u.id)) continue;

    // Gracia tras la última salida: no reabrir enseguida si acaba de cerrar.
    const [last] = await db
      .select({ checkOut: hubWorkSessions.checkOut })
      .from(hubWorkSessions)
      .where(and(eq(hubWorkSessions.userId, u.id), isNotNull(hubWorkSessions.checkOut)))
      .orderBy(desc(hubWorkSessions.checkOut))
      .limit(1);
    const lastCheckOutAt = last?.checkOut ? new Date(last.checkOut) : null;
    if (
      lastCheckOutAt &&
      now.getTime() - lastCheckOutAt.getTime() < AUTO_RESTART_GRACE_MS
    ) {
      continue; // ni siquiera consultamos Discord: respeta la salida reciente
    }

    const inVoice = await voiceStatus(u.discordUserId, { fresh: true });
    if (!shouldAutoStart({ inVoice, hasOpenSession: false, lastCheckOutAt, now })) continue;

    try {
      await db.insert(hubWorkSessions).values({
        userId: u.id,
        workDate: localDate(now),
        onDiscord: true,
        discordCheckin: true,
        discordChecks: 1,
        discordHits: 1,
        discordLastSeenAt: now,
        autoStarted: true,
      });
    } catch (err) {
      // Carrera con un check-in manual: el índice único parcial manda y no es
      // un error real. Cualquier otra falla sí se registra para no ocultarla.
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23505") console.error("[DiscordSweep] auto check-in falló:", err);
      continue;
    }

    const displayName = u.name || u.email;
    const hora = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
    createNotification({
      userId: u.id,
      type: "system",
      title: "Jornada iniciada automáticamente 🎧",
      body: `Te detectamos en el canal de voz de Discord a las ${hora}; tus horas ya están contando. Marca tu salida al terminar.`,
      link: jornadaLink(u.teamRole),
    }).catch(() => {});
    reportToChannel(`🎧 **${displayName}** inició **jornada automática** a las ${hora} (detectado en voz)`).catch(() => {});
  }
}

export function startDiscordSweep(): void {
  if (process.env["NODE_ENV"] === "test") return;
  setInterval(() => {
    sweepOnce().catch((e) => console.error("[DiscordSweep]", e));
  }, SWEEP_INTERVAL_MS);
  // Primer barrido al minuto de levantar el server.
  setTimeout(() => {
    sweepOnce().catch((e) => console.error("[DiscordSweep]", e));
  }, 60_000);
  console.log("[DiscordSweep] verificación de voz programada cada 2 min");
}
