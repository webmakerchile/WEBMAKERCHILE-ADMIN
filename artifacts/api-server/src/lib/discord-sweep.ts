/**
 * Barrido periódico de verificación de Discord durante la jornada:
 * cada ~10 min revisa, para cada sesión ABIERTA de un usuario emparejado,
 * si está en un canal de voz, y acumula checks/hits en la sesión. Con eso
 * el overview puede mostrar "% de la jornada en Discord" honesto.
 */
import { db } from "@workspace/db";
import { hubWorkSessions, users } from "@workspace/db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { discordConfigured, voiceStatus } from "./discord";

const SWEEP_INTERVAL_MS = 2 * 60_000; // cada 2 min — bajo consumo para equipos pequeños
/** Sesiones pasadas del tope de 16 h ya no suman horas: tampoco se verifican. */
const SESSION_CAP_MS = 16 * 3_600_000;

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
      checkIn: hubWorkSessions.checkIn,
      discordUserId: users.discordUserId,
    })
    .from(hubWorkSessions)
    .innerJoin(users, eq(users.id, hubWorkSessions.userId))
    .where(isNull(hubWorkSessions.checkOut));

  for (const s of open) {
    if (!s.discordUserId) continue;
    if (now.getTime() - new Date(s.checkIn).getTime() > SESSION_CAP_MS) continue;
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
