import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { leaveRequests, onboardings, performanceReviews, users } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { recordActivity } from "../../lib/activity";
import { businessDays, getHrRecipientIds, leaveBalance } from "../../lib/hr-ops";
import { addDays, isValidDateStr, localDate } from "../jornada";

/**
 * Self-service de personas: vacaciones/permisos, onboarding propio y
 * evaluaciones propias. Va montado FUERA de los gates de área (como jornada):
 * cualquier usuario aprobado gestiona lo SUYO; nada de terceros ni montos.
 */
const router: IRouter = Router();

type Me = { id: number; name?: string | null; email: string };
const me = (req: Request) => req.user as Me;

/* ======================= Vacaciones y permisos =========================== */

/** GET /me/leave — saldo del año + solicitudes propias. */
router.get("/me/leave", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const [balance, requests] = await Promise.all([
      leaveBalance(user.id),
      db.select().from(leaveRequests)
        .where(eq(leaveRequests.userId, user.id))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(30),
    ]);
    res.json({ balance, requests });
  } catch (err) {
    console.error("[me/leave GET]", err);
    res.status(500).json({ error: "Error obteniendo tus solicitudes" });
  }
});

const leaveSchema = z.object({
  type: z.enum(["vacaciones", "permiso"]),
  startDate: z.string(),
  endDate: z.string(),
  note: z.string().trim().max(500).default(""),
});

/** POST /me/leave — crea una solicitud; los días hábiles los calcula el servidor. */
router.post("/me/leave", async (req: Request, res: Response) => {
  const parsed = leaveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { type, startDate, endDate, note } = parsed.data;
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate) || endDate < startDate) {
    res.status(400).json({ error: "Rango de fechas inválido" });
    return;
  }
  if (startDate < localDate()) {
    res.status(400).json({ error: "La solicitud debe ser desde hoy en adelante" });
    return;
  }
  const days = businessDays(startDate, endDate);
  if (days <= 0) {
    res.status(400).json({ error: "El rango no incluye días hábiles" });
    return;
  }
  if (days > 60) {
    res.status(400).json({ error: "Máximo 60 días hábiles por solicitud" });
    return;
  }
  try {
    const user = me(req);
    // Lock consultivo por persona dentro de la transacción: chequeo de saldo
    // e inserción en serie — dos solicitudes simultáneas no pueden sobregirar.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(730551004, ${user.id})`);
      if (type === "vacaciones") {
        // El saldo disponible ya descuenta aprobadas Y pendientes: no se puede
        // sobregirar ni siquiera encadenando solicitudes.
        const bal = await leaveBalance(user.id, new Date(startDate + "T12:00:00Z"), tx);
        if (days > bal.available) {
          return { error: `Saldo insuficiente: tienes ${bal.available} días hábiles disponibles y pides ${days}` } as const;
        }
      }
      const [row] = await tx.insert(leaveRequests)
        .values({ userId: user.id, type, startDate, endDate, days, note })
        .returning();
      return { row } as const;
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const row = result.row;
    res.status(201).json(row);
    const [uRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1);
    const who = uRow?.name || user.email;
    const tipo = type === "vacaciones" ? "vacaciones" : "permiso";
    const recipients = await getHrRecipientIds();
    for (const uid of recipients) {
      if (uid === user.id) continue;
      createNotification({
        userId: uid,
        type: "system",
        title: `${who} solicita ${tipo}`,
        body: `${startDate} al ${endDate} (${days} días hábiles)${note ? ` — ${note}` : ""}`,
        link: "/rrhh",
      }).catch(() => {});
    }
    recordActivity({
      actorId: user.id,
      entityType: "persona",
      entityId: user.id,
      entityLabel: `Solicitud de ${tipo} ${startDate} al ${endDate}`,
      action: "created",
    });
  } catch (err) {
    console.error("[me/leave POST]", err);
    res.status(500).json({ error: "Error al crear la solicitud" });
  }
});

/** DELETE /me/leave/:id — cancela una solicitud propia pendiente. */
router.delete("/me/leave/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  try {
    const user = me(req);
    const deleted = await db.delete(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, user.id), eq(leaveRequests.status, "pendiente")))
      .returning({ id: leaveRequests.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Solicitud no encontrada o ya resuelta" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error("[me/leave DELETE]", err);
    res.status(500).json({ error: "Error al cancelar la solicitud" });
  }
});

/**
 * GET /team/absences?from=&to= — calendario de ausencias APROBADAS del equipo.
 * Visible para cualquier usuario aprobado: solo nombres, tipo y fechas.
 */
router.get("/team/absences", async (req: Request, res: Response) => {
  const today = localDate();
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to = typeof req.query.to === "string" ? req.query.to : addDays(today, 60);
  if (!isValidDateStr(from) || !isValidDateStr(to) || from > to) {
    res.status(400).json({ error: "Rango de fechas inválido" });
    return;
  }
  try {
    const rows = await db
      .select({
        id: leaveRequests.id,
        userId: leaveRequests.userId,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        name: users.name,
        email: users.email,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .where(and(
        eq(leaveRequests.status, "aprobada"),
        lte(leaveRequests.startDate, to),
        gte(leaveRequests.endDate, from),
      ))
      .orderBy(asc(leaveRequests.startDate));
    res.json(rows.map((r) => ({ ...r, name: r.name || r.email, email: undefined })));
  } catch (err) {
    console.error("[team/absences GET]", err);
    res.status(500).json({ error: "Error obteniendo las ausencias" });
  }
});

/* ============================ Onboarding ================================= */

/** GET /me/onboarding — checklist propio (o null si no tiene). */
router.get("/me/onboarding", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const [row] = await db.select().from(onboardings).where(eq(onboardings.userId, user.id)).limit(1);
    res.json(row ?? null);
  } catch (err) {
    console.error("[me/onboarding GET]", err);
    res.status(500).json({ error: "Error obteniendo tu onboarding" });
  }
});

const itemSchema = z.object({ done: z.boolean() });

/** PATCH /me/onboarding/items/:idx — marca/desmarca un paso propio. */
router.patch("/me/onboarding/items/:idx", async (req: Request, res: Response) => {
  const idx = Number(req.params.idx);
  const parsed = itemSchema.safeParse(req.body ?? {});
  if (!Number.isInteger(idx) || idx < 0 || !parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  try {
    const user = me(req);
    const [row] = await db.select().from(onboardings).where(eq(onboardings.userId, user.id)).limit(1);
    if (!row || idx >= row.items.length) {
      res.status(404).json({ error: "Paso no encontrado" });
      return;
    }
    const items = row.items.map((it, i) =>
      i === idx ? { ...it, done: parsed.data.done, doneAt: parsed.data.done ? new Date().toISOString() : null } : it,
    );
    const allDone = items.length > 0 && items.every((it) => it.done);
    const [updated] = await db.update(onboardings)
      .set({ items, completedAt: allDone ? (row.completedAt ?? new Date()) : null })
      .where(eq(onboardings.id, row.id))
      .returning();
    res.json(updated);
    if (allDone && !row.completedAt) {
      const [uRow] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, user.id)).limit(1);
      const who = uRow?.name || uRow?.email || "Alguien";
      const recipients = await getHrRecipientIds();
      for (const uid of recipients) {
        if (uid === user.id) continue;
        createNotification({
          userId: uid,
          type: "system",
          title: `${who} completó su onboarding`,
          body: `Los ${items.length} pasos del checklist están listos.`,
          link: "/rrhh",
        }).catch(() => {});
      }
      recordActivity({
        actorId: user.id,
        entityType: "persona",
        entityId: user.id,
        entityLabel: `Onboarding de ${who}`,
        action: "completed",
      });
    }
  } catch (err) {
    console.error("[me/onboarding PATCH]", err);
    res.status(500).json({ error: "Error al actualizar el paso" });
  }
});

/* ========================= Evaluaciones propias ========================== */

/** GET /me/reviews — evaluaciones cerradas propias (solo lectura). */
router.get("/me/reviews", async (req: Request, res: Response) => {
  try {
    const user = me(req);
    const rows = await db.select().from(performanceReviews)
      .where(eq(performanceReviews.userId, user.id))
      .orderBy(desc(performanceReviews.periodKey))
      .limit(24);
    res.json(rows);
  } catch (err) {
    console.error("[me/reviews GET]", err);
    res.status(500).json({ error: "Error obteniendo tus evaluaciones" });
  }
});

export default router;
