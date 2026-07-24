import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubDayLogs, hubWorkSessions, users } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

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

type Me = { id: number; role?: string; teamRole?: string };
const me = (req: Request) => req.user as Me;

/** CEO, Ejecutivo y RRHH (o superadmin) supervisan la asistencia del equipo. */
function canOversee(req: Request): boolean {
  const u = me(req);
  return (
    u.role === "superadmin" ||
    u.teamRole === "ceo" ||
    u.teamRole === "ejecutivo" ||
    u.teamRole === "rrhh"
  );
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/* ========================= Mi jornada (self-service) ===================== */

/** GET /jornada/me — estado propio: sesión abierta, hoy, semana y checklist de hoy. */
router.get("/jornada/me", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const today = localDate();
    const weekStart = weekStartOf(today);
    const weekEnd = addDays(weekStart, 6);

    const [sessions, openRows, logs] = await Promise.all([
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
    ]);

    const now = new Date();
    const open = openRows[0] ?? null;
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const minutes = sessions
        .filter((s) => s.workDate === date)
        .reduce((acc, s) => acc + sessionMinutes(s, now), 0);
      return { date, minutes };
    });

    res.json({
      date: today,
      open: open
        ? { id: open.id, workDate: open.workDate, checkIn: open.checkIn, onDiscord: open.onDiscord, stale: open.workDate !== today }
        : null,
      todayMinutes: days.find((d) => d.date === today)?.minutes ?? 0,
      todaySessions: sessions
        .filter((s) => s.workDate === today)
        .map((s) => ({ id: s.id, checkIn: s.checkIn, checkOut: s.checkOut, onDiscord: s.onDiscord, minutes: sessionMinutes(s, now) })),
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
    const [session] = await db.insert(hubWorkSessions)
      .values({ userId: user.id, workDate: localDate(), onDiscord: parsed.data.onDiscord })
      .returning();
    res.status(201).json({ session });
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
    const [session] = await db.update(hubWorkSessions)
      .set({ checkOut: new Date() })
      .where(eq(hubWorkSessions.id, open.id))
      .returning();
    res.json({ session, minutes: session ? sessionMinutes(session) : 0 });
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

    const result = members.map((m) => {
      const mySessions = sessions.filter((s) => s.userId === m.id);
      const daySessions = mySessions.filter((s) => s.workDate === date);
      const weekByDay = days.map((d) => ({
        date: d,
        minutes: mySessions
          .filter((s) => s.workDate === d)
          .reduce((a, s) => a + sessionMinutes(s, now), 0),
      }));
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
              open: date === today && daySessions.some((s) => !s.checkOut),
            }
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
        .map((s) => ({ id: s.id, checkIn: s.checkIn, checkOut: s.checkOut, onDiscord: s.onDiscord, minutes: sessionMinutes(s, now) })),
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

export default router;
