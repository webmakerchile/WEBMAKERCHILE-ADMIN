import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubDayLogs, hubWorkBreaks, hubWorkSessions, users } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { normalizeRole } from "@workspace/roles";
import {
  reportToChannel,
  discordConfigured,
  getBotApp,
  inviteUrl,
  listGuildMembers,
  resolveGuild,
  voiceStatus,
} from "../lib/discord";
import { saveDaySummary } from "../lib/activity";
import { minutosDePausas, minutosNetos, formatearDuracion } from "../lib/jornada-pausas";

/**
 * Jornada / asistencia del equipo.
 * - Self-service (todas las áreas aprobadas): check-in / check-out y checklist
 *   diario "qué hice hoy". Por eso este router se monta FUERA del gate de área
 *   de /hub (que solo permite ceo/ejecutivo/rrhh).
 * - Supervisión (overview del equipo e historial de terceros): gateada por rol
 *   dentro de cada ruta (ceo/ejecutivo/rrhh/superadmin).
 */
const router: IRouter = Router();

/* ============================ Helpers de fecha ============================ */

/** Zona horaria de la empresa (Chile). Todo el bucketing por día usa esta TZ. */
export const JORNADA_TZ = "America/Santiago";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida formato Y fecha calendario real (rechaza 2026-13-01, 2026-02-30, etc.). */
export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Fecha local YYYY-MM-DD en la TZ de la empresa. */
export function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: JORNADA_TZ });
}

/** Suma n días a una fecha YYYY-MM-DD (estable ante DST usando mediodía UTC). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene la fecha dada (semana lunes→domingo). */
export function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return addDays(dateStr, -((d.getUTCDay() + 6) % 7));
}

/** Tope por sesión (16 h) para que una salida olvidada no infle las horas. */
export const MAX_SESSION_MIN = 16 * 60;

/** Minutos de una sesión; las abiertas cuentan hasta `now`, con tope de 16 h. */
export function sessionMinutes(
  s: { checkIn: Date | string; checkOut: Date | string | null },
  now: Date = new Date(),
): number {
  const start = new Date(s.checkIn).getTime();
  const end = s.checkOut ? new Date(s.checkOut).getTime() : now.getTime();
  return Math.min(Math.max(0, Math.round((end - start) / 60000)), MAX_SESSION_MIN);
}

/* ============================== Permisos ================================= */

type Me = { id: number; role?: string; teamRole?: string; name?: string | null; email?: string };
const me = (req: Request) => req.user as Me;

/**
 * Quién supervisa la asistencia del equipo: dirección, ventas y RRHH.
 * Se resuelve con el rol normalizado — así da igual si en la base quedó
 * guardado un valor del vocabulario viejo de áreas.
 */
function canOversee(req: Request): boolean {
  const u = me(req);
  const role = normalizeRole(u.teamRole, u.role === "superadmin");
  return role === "ceo" || role === "ventas" || role === "rrhh";
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/* ============================== Pausas =================================== */

/** Sesión abierta de un usuario, o null. */
async function sesionAbiertaDe(userId: number) {
  const [open] = await db.select().from(hubWorkSessions)
    .where(and(eq(hubWorkSessions.userId, userId), isNull(hubWorkSessions.checkOut)))
    .orderBy(desc(hubWorkSessions.checkIn))
    .limit(1);
  return open ?? null;
}

/** Pausas de un conjunto de sesiones, agrupadas por sesión. */
async function pausasDeSesiones(sessionIds: number[]) {
  const porSesion = new Map<number, (typeof hubWorkBreaks.$inferSelect)[]>();
  if (sessionIds.length === 0) return porSesion;
  const filas = await db.select().from(hubWorkBreaks)
    .where(inArray(hubWorkBreaks.sessionId, sessionIds))
    .orderBy(asc(hubWorkBreaks.startedAt));
  for (const f of filas) {
    const lista = porSesion.get(f.sessionId) ?? [];
    lista.push(f);
    porSesion.set(f.sessionId, lista);
  }
  return porSesion;
}

/**
 * Minutos netos de un conjunto de sesiones: brutos menos pausas.
 *
 * Todo cálculo de horas debe pasar por aquí. Sumar los brutos y restar las
 * pausas al final daría otro número, porque el tope de 16 h por sesión se
 * aplica ANTES del descuento.
 */
function minutosNetosDeSesiones(
  sesiones: (typeof hubWorkSessions.$inferSelect)[],
  pausasPorSesion: Map<number, PausaFila[]>,
  now: Date,
): number {
  return sesiones.reduce((acc, s) => {
    const brutos = sessionMinutes(s, now);
    const pausados = minutosDePausas(s, pausasPorSesion.get(s.id) ?? [], now);
    return acc + minutosNetos(brutos, pausados);
  }, 0);
}

type PausaFila = typeof hubWorkBreaks.$inferSelect;

const pausaSchema = z.object({
  motivo: z.string().trim().max(120).optional().default(""),
  /** Solo para quien supervisa: pausar la jornada de otra persona. */
  userId: z.number().int().positive().optional(),
});

/**
 * Resuelve sobre QUIÉN se actúa y si está permitido.
 *
 * Cualquiera puede pausar la suya. Pausar la de otra persona queda reservado a
 * dirección, ventas y RRHH, que es exactamente quienes miden al equipo.
 */
function objetivoPausa(req: Request, pedido?: number): { userId: number; ajena: boolean } | null {
  const user = me(req);
  if (!pedido || pedido === user.id) return { userId: user.id, ajena: false };
  if (!canOversee(req)) return null;
  return { userId: pedido, ajena: true };
}

/** POST /jornada/pausa — abre una pausa (propia, o de otra persona si supervisas). */
router.post("/jornada/pausa", async (req: Request, res: Response) => {
  const parsed = pausaSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  const objetivo = objetivoPausa(req, parsed.data.userId);
  if (!objetivo) {
    res.status(403).json({ error: "Solo dirección, ventas y RRHH pueden pausar la jornada de otra persona" });
    return;
  }
  try {
    const open = await sesionAbiertaDe(objetivo.userId);
    if (!open) {
      res.status(409).json({ error: "No hay una jornada abierta que pausar" });
      return;
    }
    const [yaAbierta] = await db.select({ id: hubWorkBreaks.id }).from(hubWorkBreaks)
      .where(and(eq(hubWorkBreaks.sessionId, open.id), isNull(hubWorkBreaks.endedAt)))
      .limit(1);
    if (yaAbierta) {
      res.status(409).json({ error: "La jornada ya está en pausa" });
      return;
    }
    const [pausa] = await db.insert(hubWorkBreaks).values({
      sessionId: open.id,
      userId: objetivo.userId,
      reason: parsed.data.motivo,
      createdBy: me(req).id,
    }).returning();
    res.status(201).json({ pausa });

    const [uRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, objetivo.userId)).limit(1);
    const quien = uRow?.name || `usuario ${objetivo.userId}`;
    const motivo = parsed.data.motivo ? ` (${parsed.data.motivo})` : "";
    reportToChannel(`⏸️ **${quien}** puso su jornada en **pausa**${motivo}`).catch(() => {});
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "La jornada ya está en pausa" });
      return;
    }
    console.error("[jornada/pausa POST]", err);
    res.status(500).json({ error: "Error al pausar la jornada" });
  }
});

/** POST /jornada/reanudar — cierra la pausa abierta y el reloj vuelve a correr. */
router.post("/jornada/reanudar", async (req: Request, res: Response) => {
  const parsed = pausaSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  const objetivo = objetivoPausa(req, parsed.data.userId);
  if (!objetivo) {
    res.status(403).json({ error: "Solo dirección, ventas y RRHH pueden reanudar la jornada de otra persona" });
    return;
  }
  try {
    const open = await sesionAbiertaDe(objetivo.userId);
    if (!open) {
      res.status(409).json({ error: "No hay una jornada abierta" });
      return;
    }
    const [pausaAbierta] = await db.select().from(hubWorkBreaks)
      .where(and(eq(hubWorkBreaks.sessionId, open.id), isNull(hubWorkBreaks.endedAt)))
      .orderBy(desc(hubWorkBreaks.startedAt))
      .limit(1);
    if (!pausaAbierta) {
      res.status(409).json({ error: "La jornada no está en pausa" });
      return;
    }
    const now = new Date();
    const [pausa] = await db.update(hubWorkBreaks)
      .set({ endedAt: now })
      .where(eq(hubWorkBreaks.id, pausaAbierta.id))
      .returning();
    const minutos = minutosDePausas(open, [pausa!], now);
    res.json({ pausa, minutos });

    const [uRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, objetivo.userId)).limit(1);
    const quien = uRow?.name || `usuario ${objetivo.userId}`;
    reportToChannel(`▶️ **${quien}** **reanudó** su jornada tras ${formatearDuracion(minutos)} de pausa`).catch(() => {});
  } catch (err) {
    console.error("[jornada/reanudar POST]", err);
    res.status(500).json({ error: "Error al reanudar la jornada" });
  }
});

/* ========================= Mi jornada (self-service) ===================== */

/** GET /jornada/me — estado propio: sesión abierta, hoy, semana y checklist de hoy. */
router.get("/jornada/me", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const today = localDate();
    const weekStart = weekStartOf(today);
    const weekEnd = addDays(weekStart, 6);

    const [sessions, openRows, logs, meRows] = await Promise.all([
      db.select().from(hubWorkSessions)
        .where(and(
          eq(hubWorkSessions.userId, user.id),
          gte(hubWorkSessions.workDate, weekStart),
          lte(hubWorkSessions.workDate, weekEnd),
        ))
        .orderBy(asc(hubWorkSessions.checkIn)),
      db.select().from(hubWorkSessions)
        .where(and(eq(hubWorkSessions.userId, user.id), isNull(hubWorkSessions.checkOut)))
        .orderBy(desc(hubWorkSessions.checkIn))
        .limit(1),
      db.select().from(hubDayLogs)
        .where(and(eq(hubDayLogs.userId, user.id), eq(hubDayLogs.logDate, today)))
        .orderBy(asc(hubDayLogs.createdAt)),
      db.select({ discordUserId: users.discordUserId }).from(users)
        .where(eq(users.id, user.id))
        .limit(1),
    ]);

    const now = new Date();
    const open = openRows[0] ?? null;
    // Las horas que se reportan son NETAS: el tiempo en pausa no es tiempo
    // trabajado, y hasta ahora se contaba igual.
    const pausasPorSesion = await pausasDeSesiones(sessions.map((s) => s.id));
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const delDia = sessions.filter((s) => s.workDate === date);
      return {
        date,
        minutes: minutosNetosDeSesiones(delDia, pausasPorSesion, now),
        pausedMinutes: delDia.reduce(
          (acc, s) => acc + minutosDePausas(s, pausasPorSesion.get(s.id) ?? [], now),
          0,
        ),
      };
    });
    const pausaActiva = open
      ? (pausasPorSesion.get(open.id) ?? []).find((p) => !p.endedAt) ?? null
      : null;

    res.json({
      date: today,
      open: open
        ? { id: open.id, workDate: open.workDate, checkIn: open.checkIn, onDiscord: open.onDiscord, discordCheckin: open.discordCheckin ?? null, autoStarted: open.autoStarted, stale: open.workDate !== today }
        : null,
      pausa: pausaActiva
        ? { id: pausaActiva.id, startedAt: pausaActiva.startedAt, motivo: pausaActiva.reason, ajena: pausaActiva.createdBy !== user.id }
        : null,
      discordLinked: !!meRows[0]?.discordUserId,
      todayMinutes: days.find((d) => d.date === today)?.minutes ?? 0,
      todayPausedMinutes: days.find((d) => d.date === today)?.pausedMinutes ?? 0,
      todaySessions: sessions
        .filter((s) => s.workDate === today)
        .map((s) => {
          const pausados = minutosDePausas(s, pausasPorSesion.get(s.id) ?? [], now);
          return {
            id: s.id, checkIn: s.checkIn, checkOut: s.checkOut, onDiscord: s.onDiscord,
            minutes: minutosNetos(sessionMinutes(s, now), pausados),
            pausedMinutes: pausados,
          };
        }),
      week: { start: weekStart, days, total: days.reduce((a, d) => a + d.minutes, 0) },
      logs: logs.map((l) => ({ id: l.id, text: l.text, done: l.done, createdAt: l.createdAt })),
    });
  } catch (err) {
    console.error("[jornada/me GET]", err);
    res.status(500).json({ error: "Error obteniendo tu jornada" });
  }
});

const checkInSchema = z.object({ onDiscord: z.boolean().optional().default(false) });

/** POST /jornada/check-in — marca la llegada (pasa lista). 409 si ya hay una abierta. */
router.post("/jornada/check-in", async (req: Request, res: Response) => {
  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  try {
    const user = me(req);
    const open = await db.select({ id: hubWorkSessions.id }).from(hubWorkSessions)
      .where(and(eq(hubWorkSessions.userId, user.id), isNull(hubWorkSessions.checkOut)))
      .limit(1);
    if (open.length > 0) {
      res.status(409).json({ error: "Ya tienes una jornada abierta" });
      return;
    }
    // Verificación automática de voz (si el usuario está emparejado y hay bot).
    const [u] = await db.select({ discordUserId: users.discordUserId, name: users.name }).from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    let verified: boolean | null = null;
    if (u?.discordUserId && discordConfigured()) {
      verified = await voiceStatus(u.discordUserId, { fresh: true });
    }
    const values: typeof hubWorkSessions.$inferInsert = {
      userId: user.id,
      workDate: localDate(),
      // La autodeclaración se conserva; una verificación positiva también la marca.
      onDiscord: parsed.data.onDiscord || verified === true,
    };
    if (verified !== null) {
      values.discordCheckin = verified;
      values.discordChecks = 1;
      if (verified) {
        values.discordHits = 1;
        values.discordLastSeenAt = new Date();
      }
    }
    const [session] = await db.insert(hubWorkSessions).values(values).returning();
    res.status(201).json({ session, discordVerified: verified });
    // Reporte al canal de Discord (fire-and-forget).
    const displayName = u?.name || user.email;
    const hora = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
    const dcIcon = verified === true ? " 🎧" : "";
    reportToChannel(`✅ **${displayName}** marcó **entrada** a las ${hora}${dcIcon}`).catch(() => {});
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Ya tienes una jornada abierta" });
      return;
    }
    console.error("[jornada/check-in POST]", err);
    res.status(500).json({ error: "Error al marcar la entrada" });
  }
});

/** POST /jornada/check-out — cierra la jornada abierta. 409 si no hay ninguna. */
router.post("/jornada/check-out", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const [open] = await db.select().from(hubWorkSessions)
      .where(and(eq(hubWorkSessions.userId, user.id), isNull(hubWorkSessions.checkOut)))
      .orderBy(desc(hubWorkSessions.checkIn))
      .limit(1);
    if (!open) {
      res.status(409).json({ error: "No tienes una jornada abierta" });
      return;
    }
    const now = new Date();
    const [session] = await db.update(hubWorkSessions)
      .set({ checkOut: now })
      .where(eq(hubWorkSessions.id, open.id))
      .returning();
    const mins = session ? sessionMinutes(session) : 0;
    // Resumen automático de la jornada: computado desde la bitácora de
    // actividad + checklist del día, persistido (re-ejecutable si hay varios
    // check-outs) y devuelto al cliente para mostrarlo al cerrar.
    const workDate = session?.workDate ?? localDate(now);
    let daySummary: Awaited<ReturnType<typeof saveDaySummary>> | null = null;
    try {
      // Minutos TOTALES del día (todas las sesiones cerradas de esa fecha),
      // no solo la sesión recién cerrada: con varios check-outs el resumen
      // se recalcula y siempre refleja el acumulado.
      const daySessions = await db.select().from(hubWorkSessions)
        .where(and(eq(hubWorkSessions.userId, user.id), eq(hubWorkSessions.workDate, workDate)));
      const totalMins = daySessions
        .filter((s) => s.checkOut)
        .reduce((acc, s) => acc + sessionMinutes(s, now), 0);
      daySummary = await saveDaySummary(user.id, workDate, { minutes: totalMins });
    } catch (err) {
      console.error("[jornada/check-out] resumen falló", err);
    }
    res.json({ session, minutes: mins, summary: daySummary });
    // Reporte al canal de Discord (fire-and-forget).
    const [uRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1);
    const displayName = uRow?.name || user.email;
    const hora = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    const duracion = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
    reportToChannel(`⏹️ **${displayName}** marcó **salida** a las ${hora} — jornada de ${duracion}`).catch(() => {});
  } catch (err) {
    console.error("[jornada/check-out POST]", err);
    res.status(500).json({ error: "Error al marcar la salida" });
  }
});

/* ===================== Checklist diario (self-service) =================== */

const logCreateSchema = z.object({ text: z.string().trim().min(1).max(300) });

/** POST /jornada/logs — agrega un ítem al checklist de HOY del propio usuario. */
router.post("/jornada/logs", async (req: Request, res: Response) => {
  const parsed = logCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Texto requerido (máx. 300 caracteres)" });
    return;
  }
  try {
    const user = me(req);
    const [item] = await db.insert(hubDayLogs)
      .values({ userId: user.id, logDate: localDate(), text: parsed.data.text })
      .returning();
    res.status(201).json({ item });
  } catch (err) {
    console.error("[jornada/logs POST]", err);
    res.status(500).json({ error: "Error al agregar el ítem" });
  }
});

const logPatchSchema = z
  .object({
    text: z.string().trim().min(1).max(300).optional(),
    done: z.boolean().optional(),
  })
  .refine((d) => d.text !== undefined || d.done !== undefined, { message: "Nada que actualizar" });

/** PATCH /jornada/logs/:id — edita/marca un ítem propio (cualquier fecha). */
router.patch("/jornada/logs/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const parsed = logPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  try {
    const user = me(req);
    const [item] = await db.select().from(hubDayLogs).where(eq(hubDayLogs.id, id)).limit(1);
    if (!item || item.userId !== user.id) {
      res.status(404).json({ error: "Ítem no encontrado" });
      return;
    }
    const patch: Partial<{ text: string; done: boolean }> = {};
    if (parsed.data.text !== undefined) patch.text = parsed.data.text;
    if (parsed.data.done !== undefined) patch.done = parsed.data.done;
    const [updated] = await db.update(hubDayLogs).set(patch).where(eq(hubDayLogs.id, id)).returning();
    res.json({ item: updated });
  } catch (err) {
    console.error("[jornada/logs PATCH]", err);
    res.status(500).json({ error: "Error al actualizar el ítem" });
  }
});

/** DELETE /jornada/logs/:id — elimina un ítem propio. */
router.delete("/jornada/logs/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  try {
    const user = me(req);
    const [item] = await db.select().from(hubDayLogs).where(eq(hubDayLogs.id, id)).limit(1);
    if (!item || item.userId !== user.id) {
      res.status(404).json({ error: "Ítem no encontrado" });
      return;
    }
    await db.delete(hubDayLogs).where(eq(hubDayLogs.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("[jornada/logs DELETE]", err);
    res.status(500).json({ error: "Error al eliminar el ítem" });
  }
});

/* ===================== Supervisión (ceo/ejecutivo/rrhh) ================== */

/**
 * GET /jornada/overview?date=YYYY-MM-DD — pase de lista del día + matriz
 * semanal (lunes→domingo) de todos los integrantes aprobados.
 */
router.get("/jornada/overview", async (req: Request, res: Response) => {
  if (!canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const qd = typeof req.query.date === "string" ? req.query.date : localDate();
  if (!isValidDateStr(qd)) {
    res.status(400).json({ error: "Parámetro date inválido (YYYY-MM-DD)" });
    return;
  }
  try {
    const date = qd;
    const today = localDate();
    const weekStart = weekStartOf(date);
    const weekEnd = addDays(weekStart, 6);

    const members = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      picture: users.picture,
      teamRole: users.teamRole,
      discordUserId: users.discordUserId,
      discordTag: users.discordTag,
    }).from(users)
      .where(eq(users.approvalStatus, "approved"))
      .orderBy(asc(users.name));

    const ids = members.map((m) => m.id);
    const [sessions, logs] = ids.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(hubWorkSessions)
            .where(and(
              inArray(hubWorkSessions.userId, ids),
              gte(hubWorkSessions.workDate, weekStart),
              lte(hubWorkSessions.workDate, weekEnd),
            ))
            .orderBy(asc(hubWorkSessions.checkIn)),
          db.select().from(hubDayLogs)
            .where(and(inArray(hubDayLogs.userId, ids), eq(hubDayLogs.logDate, date)))
            .orderBy(asc(hubDayLogs.createdAt)),
        ]);

    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    // Pausas de toda la semana visible: las horas del equipo se muestran netas.
    const pausasPorSesion = await pausasDeSesiones(sessions.map((s) => s.id));

    // Verificación EN VIVO (solo al mirar HOY): ¿está en un canal de voz ahora?
    const liveVoice = new Map<number, boolean | null>();
    if (date === today && discordConfigured()) {
      const candidates = members.filter((m) =>
        m.discordUserId &&
        sessions.some((s) => s.userId === m.id && s.workDate === date && !s.checkOut),
      );
      await Promise.all(candidates.map(async (m) => {
        liveVoice.set(m.id, await voiceStatus(m.discordUserId!));
      }));
    }

    const result = members.map((m) => {
      const mySessions = sessions.filter((s) => s.userId === m.id);
      const daySessions = mySessions.filter((s) => s.workDate === date);
      const weekByDay = days.map((d) => {
        const delDia = mySessions.filter((s) => s.workDate === d);
        return {
          date: d,
          minutes: minutosNetosDeSesiones(delDia, pausasPorSesion, now),
          pausedMinutes: delDia.reduce(
            (a, s) => a + minutosDePausas(s, pausasPorSesion.get(s.id) ?? [], now),
            0,
          ),
        };
      });
      // Quién está en pausa AHORA MISMO: es lo que dirección, ventas y RRHH
      // necesitan ver de un vistazo para medir al equipo.
      const abierta = daySessions.find((s) => !s.checkOut) ?? null;
      const pausaActiva = abierta
        ? (pausasPorSesion.get(abierta.id) ?? []).find((p) => !p.endedAt) ?? null
        : null;
      const first = daySessions[0] ?? null;
      const allClosed = daySessions.length > 0 && daySessions.every((s) => s.checkOut);
      const lastOut = allClosed ? daySessions[daySessions.length - 1]!.checkOut : null;
      return {
        ...m,
        today: first
          ? {
              checkIn: first.checkIn,
              checkOut: lastOut,
              onDiscord: daySessions.some((s) => s.onDiscord),
              minutes: weekByDay.find((d) => d.date === date)?.minutes ?? 0,
              pausedMinutes: weekByDay.find((d) => d.date === date)?.pausedMinutes ?? 0,
              pausa: pausaActiva
                ? { id: pausaActiva.id, startedAt: pausaActiva.startedAt, motivo: pausaActiva.reason }
                : null,
              open: date === today && daySessions.some((s) => !s.checkOut),
            }
          : null,
        discord: m.discordUserId
          ? (() => {
              const checks = daySessions.reduce((a, s) => a + (s.discordChecks ?? 0), 0);
              const hits = daySessions.reduce((a, s) => a + (s.discordHits ?? 0), 0);
              const seen = daySessions
                .map((s) => (s.discordLastSeenAt ? new Date(s.discordLastSeenAt).getTime() : 0))
                .filter((t) => t > 0);
              return {
                linked: true,
                tag: m.discordTag ?? null,
                checkin: first?.discordCheckin ?? null,
                pct: checks > 0 ? Math.round((hits / checks) * 100) : null,
                lastSeenMin: seen.length > 0
                  ? Math.max(0, Math.round((now.getTime() - Math.max(...seen)) / 60000))
                  : null,
                inVoiceNow: liveVoice.get(m.id) ?? null,
              };
            })()
          : null,
        weekByDay,
        weekTotal: weekByDay.reduce((a, d) => a + d.minutes, 0),
        logs: logs
          .filter((l) => l.userId === m.id)
          .map((l) => ({ id: l.id, text: l.text, done: l.done })),
      };
    });

    res.json({
      date,
      today,
      weekStart,
      days,
      members: result,
      summary: {
        working: result.filter((r) => r.today?.open).length,
        finished: result.filter((r) => r.today && !r.today.open).length,
        absent: result.filter((r) => !r.today).length,
        totalMinutes: result.reduce((a, r) => a + (r.today?.minutes ?? 0), 0),
      },
    });
  } catch (err) {
    console.error("[jornada/overview GET]", err);
    res.status(500).json({ error: "Error obteniendo la asistencia" });
  }
});

/**
 * GET /jornada/history?userId=&from=&to= — historial (sesiones + checklist)
 * agrupado por día. Cada uno puede ver el suyo; el de terceros requiere
 * rol supervisor. Rango máximo: 92 días.
 */
router.get("/jornada/history", async (req: Request, res: Response) => {
  const user = me(req);
  const targetId = req.query.userId !== undefined ? Number(req.query.userId) : user.id;
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  if (targetId !== user.id && !canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const today = localDate();
  const from = typeof req.query.from === "string" ? req.query.from : addDays(today, -27);
  const to = typeof req.query.to === "string" ? req.query.to : today;
  if (!isValidDateStr(from) || !isValidDateStr(to) || from > to) {
    res.status(400).json({ error: "Rango de fechas inválido" });
    return;
  }
  const spanDays = Math.round(
    (new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000,
  ) + 1;
  if (spanDays > 92) {
    res.status(400).json({ error: "Rango máximo: 92 días" });
    return;
  }
  try {
    const [sessions, logs] = await Promise.all([
      db.select().from(hubWorkSessions)
        .where(and(
          eq(hubWorkSessions.userId, targetId),
          gte(hubWorkSessions.workDate, from),
          lte(hubWorkSessions.workDate, to),
        ))
        .orderBy(asc(hubWorkSessions.checkIn)),
      db.select().from(hubDayLogs)
        .where(and(
          eq(hubDayLogs.userId, targetId),
          gte(hubDayLogs.logDate, from),
          lte(hubDayLogs.logDate, to),
        ))
        .orderBy(asc(hubDayLogs.createdAt)),
    ]);

    const now = new Date();
    const dates = [...new Set([
      ...sessions.map((s) => s.workDate),
      ...logs.map((l) => l.logDate),
    ])].sort().reverse();

    const daysOut = dates.map((d) => ({
      date: d,
      minutes: sessions
        .filter((s) => s.workDate === d)
        .reduce((a, s) => a + sessionMinutes(s, now), 0),
      sessions: sessions
        .filter((s) => s.workDate === d)
        .map((s) => ({
          id: s.id,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          onDiscord: s.onDiscord,
          discordPct: (s.discordChecks ?? 0) > 0
            ? Math.round(((s.discordHits ?? 0) / s.discordChecks) * 100)
            : null,
          minutes: sessionMinutes(s, now),
        })),
      logs: logs
        .filter((l) => l.logDate === d)
        .map((l) => ({ id: l.id, text: l.text, done: l.done })),
    }));

    res.json({
      userId: targetId,
      from,
      to,
      days: daysOut,
      totalMinutes: daysOut.reduce((a, d) => a + d.minutes, 0),
    });
  } catch (err) {
    console.error("[jornada/history GET]", err);
    res.status(500).json({ error: "Error obteniendo el historial" });
  }
});

/* ============== Discord: estado del bot y emparejamiento ================= */

/** GET /jornada/discord/status — estado de la integración (para el panel). */
router.get("/jornada/discord/status", async (req: Request, res: Response) => {
  if (!canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  try {
    const linkRows = await db.select({ id: users.id, discordUserId: users.discordUserId })
      .from(users)
      .where(eq(users.approvalStatus, "approved"));
    const linked = linkRows.filter((r) => r.discordUserId).length;
    if (!discordConfigured()) {
      res.json({
        configured: false, app: null, guild: null, inviteUrl: null,
        membersAccess: "unconfigured", linked, total: linkRows.length,
      });
      return;
    }
    const [app, guild, membersRes] = await Promise.all([
      getBotApp(),
      resolveGuild(),
      listGuildMembers(),
    ]);
    res.json({
      configured: true,
      app,
      guild,
      inviteUrl: app ? inviteUrl(app.id) : null,
      membersAccess: membersRes.ok ? "ok" : membersRes.reason,
      linked,
      total: linkRows.length,
    });
  } catch (err) {
    console.error("[jornada/discord/status GET]", err);
    res.status(500).json({ error: "Error consultando el estado de Discord" });
  }
});

/** GET /jornada/discord/members — miembros humanos del servidor (para emparejar). */
router.get("/jornada/discord/members", async (req: Request, res: Response) => {
  if (!canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  try {
    const result = await listGuildMembers();
    if (!result.ok) {
      res.json({ ok: false, reason: result.reason, members: [] });
      return;
    }
    res.json({ ok: true, members: result.members });
  } catch (err) {
    console.error("[jornada/discord/members GET]", err);
    res.status(500).json({ error: "Error obteniendo los miembros del servidor" });
  }
});

const mapSchema = z.object({
  userId: z.number().int().positive(),
  /** null = quitar el emparejamiento. */
  discordUserId: z.string().regex(/^\d{5,25}$/).nullable(),
  discordTag: z.string().trim().min(1).max(100).nullable().optional(),
});

/** PATCH /jornada/discord/map — empareja un integrante con su cuenta de Discord. */
router.patch("/jornada/discord/map", async (req: Request, res: Response) => {
  if (!canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const parsed = mapSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Cuerpo inválido" });
    return;
  }
  try {
    const { userId, discordUserId } = parsed.data;
    const discordTag = discordUserId ? (parsed.data.discordTag ?? null) : null;
    const [updated] = await db.update(users)
      .set({ discordUserId, discordTag })
      .where(eq(users.id, userId))
      .returning({ id: users.id, discordUserId: users.discordUserId, discordTag: users.discordTag });
    if (!updated) {
      res.status(404).json({ error: "Integrante no encontrado" });
      return;
    }
    res.json({ user: updated });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Esa cuenta de Discord ya está emparejada con otra persona" });
      return;
    }
    console.error("[jornada/discord/map PATCH]", err);
    res.status(500).json({ error: "Error al emparejar la cuenta" });
  }
});

/** PATCH /jornada/user/:id/name — renombrar un integrante desde el panel. */
router.patch("/jornada/user/:id/name", async (req: Request, res: Response) => {
  if (!canOversee(req)) {
    res.status(403).json({ error: "Sin acceso" });
    return;
  }
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const raw = (req.body?.name ?? "").toString().trim();
  if (!raw || raw.length > 120) {
    res.status(400).json({ error: "El nombre debe tener entre 1 y 120 caracteres" });
    return;
  }
  const [updated] = await db.update(users)
    .set({ name: raw })
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name });
  if (!updated) {
    res.status(404).json({ error: "Integrante no encontrado" });
    return;
  }
  res.json({ user: updated });
});

export default router;
