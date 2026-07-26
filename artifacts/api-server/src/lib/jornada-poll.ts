import { db } from "@workspace/db";
import { users, workSessions } from "@workspace/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getChannelName, getVoiceState, discordConfigured, markPoll, workChannelIds } from "./discord";
import { planSessionActions, type OpenSession, type VoicePresence } from "./jornada";

/**
 * Sondeo de presencia: corre junto al scheduler, cada minuto.
 *
 * Pregunta a Discord quién está en un canal de voz y traduce esa foto a
 * sesiones de trabajo. Toda la decisión de qué abrir, confirmar o cerrar vive
 * en `planSessionActions` (puro y testeado); aquí solo se lee y se escribe.
 */
export async function pollDiscordSessions(now = new Date()): Promise<{ opened: number; closed: number; skipped: boolean }> {
  if (!discordConfigured()) return { opened: 0, closed: 0, skipped: true };

  const linked = await db
    .select({ id: users.id, discordUserId: users.discordUserId })
    .from(users)
    .where(isNotNull(users.discordUserId));

  if (linked.length === 0) {
    markPoll(true);
    return { opened: 0, closed: 0, skipped: false };
  }

  const openRows = await db
    .select()
    .from(workSessions)
    .where(and(isNull(workSessions.endedAt), eq(workSessions.source, "discord")));

  const openSessions: OpenSession[] = openRows.map(r => ({
    id: r.id,
    userId: r.userId,
    channelId: r.channelId,
    startedAt: new Date(r.startedAt),
    lastSeenAt: new Date(r.lastSeenAt),
  }));

  const allowed = workChannelIds();
  const presences: VoicePresence[] = [];

  for (const u of linked) {
    const state = await getVoiceState(u.discordUserId!);
    // null = no se pudo preguntar. Se omite: la tolerancia de `planSessionActions`
    // evita que un fallo de red cierre jornadas que siguen vivas.
    if (state === null) continue;
    const inWorkChannel = state.channelId && (allowed.length === 0 || allowed.includes(state.channelId));
    presences.push({
      userId: u.id,
      channelId: inWorkChannel ? state.channelId : null,
      channelName: inWorkChannel ? await getChannelName(state.channelId!) : "",
    });
  }

  const actions = planSessionActions(presences, openSessions, now);
  let opened = 0;
  let closed = 0;

  for (const action of actions) {
    if (action.kind === "open") {
      await db.insert(workSessions).values({
        userId: action.userId,
        source: "discord",
        channelId: action.channelId,
        channelName: action.channelName,
        startedAt: action.at,
        lastSeenAt: action.at,
      });
      opened += 1;
    } else if (action.kind === "touch") {
      await db
        .update(workSessions)
        .set({ lastSeenAt: action.at, channelId: action.channelId, channelName: action.channelName })
        .where(eq(workSessions.id, action.sessionId));
    } else {
      await db
        .update(workSessions)
        .set({ endedAt: action.endedAt, durationSeconds: action.durationSeconds })
        .where(eq(workSessions.id, action.sessionId));
      closed += 1;
    }
  }

  markPoll(true);
  return { opened, closed, skipped: false };
}
