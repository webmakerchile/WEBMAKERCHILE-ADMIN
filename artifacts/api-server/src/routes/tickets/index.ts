import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ticketComments, tickets, users } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  TICKET_AREAS, hubWriteScopesFor, isTicketArea, normalizeRole, ticketAreasFor,
} from "@workspace/roles";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { recordActivity } from "../../lib/activity";
import { resolveBoard, saveBoard } from "../../lib/hub-board";

const router: IRouter = Router();

const STATUSES = ["abierto", "en_progreso", "en_revision", "resuelto", "cerrado"] as const;
const PRIORITIES = ["crítica", "alta", "media", "baja"] as const;

type Me = { id: number; name: string | null; email: string; teamRole: string; role: string };

async function loadMe(req: Request): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  return me ? { id: me.id, name: me.name, email: me.email, teamRole: me.teamRole, role: me.role } : null;
}

const roleOf = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin");
/** La dirección ve y toca todos los tickets; el resto, los suyos y los de su área. */
const seesEverything = (me: Me) => roleOf(me) === "ceo";

const createSchema = z.object({
  title: z.string().trim().min(3, "El título es muy corto").max(200),
  description: z.string().trim().max(4000).default(""),
  area: z.string().refine(isTicketArea, "Área inválida"),
  priority: z.enum(PRIORITIES).default("media"),
  dueDate: z.string().trim().refine(v => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida").default(""),
  projectId: z.string().trim().max(64).default(""),
  contractId: z.string().trim().max(64).default(""),
  clientName: z.string().trim().max(200).default(""),
  videoId: z.union([z.null(), z.coerce.number().int().positive()]).default(null),
  assignedTo: z.union([z.null(), z.coerce.number().int().positive()]).default(null),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  area: z.string().refine(isTicketArea, "Área inválida").optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: z.string().trim().refine(v => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida").optional(),
  projectId: z.string().trim().max(64).optional(),
  contractId: z.string().trim().max(64).optional(),
  clientName: z.string().trim().max(200).optional(),
  assignedTo: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
});

/** Quién puede tocar un ticket: quien lo creó, quien lo tiene, el área responsable o la dirección. */
function canTouch(me: Me, ticket: { createdBy: number; assignedTo: number | null; area: string }): boolean {
  if (seesEverything(me)) return true;
  if (ticket.createdBy === me.id || ticket.assignedTo === me.id) return true;
  return (ticketAreasFor(roleOf(me)) as readonly string[]).includes(ticket.area);
}

/** Enriquecer con nombres para no hacer joins en el cliente. */
async function withPeople(rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const ids = new Set<number>();
  for (const r of rows) {
    if (typeof r.createdBy === "number") ids.add(r.createdBy);
    if (typeof r.assignedTo === "number") ids.add(r.assignedTo);
  }
  if (ids.size === 0) return rows;
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, picture: users.picture })
    .from(users)
    .where(inArray(users.id, Array.from(ids)));
  const byId = new Map(people.map(p => [p.id, p]));
  return rows.map(r => ({
    ...r,
    creator: byId.get(r.createdBy as number) ?? null,
    assignee: r.assignedTo ? byId.get(r.assignedTo as number) ?? null : null,
  }));
}

router.get("/tickets", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const myAreas = ticketAreasFor(roleOf(me)) as readonly string[];
  const visible = seesEverything(me)
    ? undefined
    : or(
        eq(tickets.createdBy, me.id),
        eq(tickets.assignedTo, me.id),
        myAreas.length > 0 ? inArray(tickets.area, myAreas as string[]) : sql`false`,
      );

  const includeClosed = String(req.query.includeClosed || "") === "1";
  const where = includeClosed
    ? visible
    : visible
      ? and(visible, sql`${tickets.status} <> 'cerrado'`)
      : sql`${tickets.status} <> 'cerrado'`;

  const rows = await db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(desc(tickets.updatedAt))
    .limit(300);

  const counts = rows.length
    ? await db
        .select({ ticketId: ticketComments.ticketId, n: sql<number>`count(*)::int` })
        .from(ticketComments)
        .where(inArray(ticketComments.ticketId, rows.map(r => r.id)))
        .groupBy(ticketComments.ticketId)
    : [];
  const countById = new Map(counts.map(c => [c.ticketId, c.n]));

  const enriched = await withPeople(rows as unknown as Array<Record<string, unknown>>);
  res.json({
    tickets: enriched.map(t => ({ ...t, commentCount: countById.get(t.id as number) ?? 0 })),
    myAreas,
    canConvertToTask: (hubWriteScopesFor(roleOf(me)) as readonly string[]).includes("tasks"),
    areas: TICKET_AREAS,
  });
});

router.post("/tickets", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const d = parsed.data;

  const [row] = await db
    .insert(tickets)
    .values({
      title: d.title,
      description: d.description,
      area: d.area,
      priority: d.priority,
      dueDate: d.dueDate,
      projectId: d.projectId,
      contractId: d.contractId,
      clientName: d.clientName,
      videoId: d.videoId,
      assignedTo: d.assignedTo,
      createdBy: me.id,
    })
    .returning();

  // Avisar a quien corresponda: la persona asignada, o el área destino.
  const author = me.name || me.email;
  if (d.assignedTo && d.assignedTo !== me.id) {
    await createNotification({
      userId: d.assignedTo,
      type: "system",
      title: `${author} te asignó un ticket: "${d.title}"`,
      body: d.description.slice(0, 200) || "Sin descripción",
      link: `/tickets?id=${row!.id}`,
    });
  } else {
    const team = await db.select({ id: users.id, teamRole: users.teamRole, role: users.role }).from(users);
    for (const u of team) {
      if (u.id === me.id) continue;
      const areas = ticketAreasFor(normalizeRole(u.teamRole, u.role === "superadmin")) as readonly string[];
      if (!areas.includes(d.area)) continue;
      await createNotification({
        userId: u.id,
        type: "system",
        title: `Nuevo ticket para tu área: "${d.title}"`,
        body: `${author} pidió: ${d.description.slice(0, 160) || "sin descripción"}`,
        link: `/tickets?id=${row!.id}`,
      });
    }
  }

  recordActivity({ actorId: me.id, entityType: "ticket", entityId: row!.id, entityLabel: row!.title, action: "created", detail: { area: d.area } });
  res.status(201).json(row);
});

router.patch("/tickets/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [current] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
  if (!canTouch(me, current)) {
    res.status(403).json({ error: "Este ticket no es de tu área" });
    return;
  }

  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = { ...d, updatedAt: new Date() };
  // SLA por etapa: el reloj se reinicia solo cuando el estado realmente cambia.
  if (d.status && d.status !== current.status) patch.statusSince = new Date();
  if (d.status === "resuelto" && current.status !== "resuelto") patch.resolvedAt = new Date();
  if (d.status === "cerrado" && current.status !== "cerrado") patch.closedAt = new Date();
  if (d.status && d.status !== "resuelto" && d.status !== "cerrado") { patch.resolvedAt = null; patch.closedAt = null; }

  const [row] = await db.update(tickets).set(patch).where(eq(tickets.id, id)).returning();

  if (d.status && d.status !== current.status) {
    recordActivity({
      actorId: me.id,
      entityType: "ticket",
      entityId: id,
      entityLabel: current.title,
      action: d.status === "resuelto" || d.status === "cerrado" ? "completed" : "status_change",
      detail: { from: current.status, to: d.status },
    });
  }

  // El autor quiere saber cuándo avanza su pedido.
  if (d.status && d.status !== current.status && current.createdBy !== me.id) {
    await createNotification({
      userId: current.createdBy,
      type: "system",
      title: `Tu ticket "${current.title}" pasó a ${d.status.replace("_", " ")}`,
      body: `${me.name || me.email} actualizó el estado.`,
      link: `/tickets?id=${id}`,
    });
  }
  if (d.assignedTo && d.assignedTo !== current.assignedTo && d.assignedTo !== me.id) {
    await createNotification({
      userId: d.assignedTo,
      type: "system",
      title: `Te asignaron el ticket "${current.title}"`,
      body: current.description.slice(0, 200) || "Sin descripción",
      link: `/tickets?id=${id}`,
    });
  }

  res.json(row);
});

router.get("/tickets/:id/comments", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
  if (!canTouch(me, ticket)) { res.status(403).json({ error: "Este ticket no es de tu área" }); return; }

  const rows = await db
    .select({
      id: ticketComments.id,
      body: ticketComments.body,
      createdAt: ticketComments.createdAt,
      userId: ticketComments.userId,
      authorName: users.name,
      authorEmail: users.email,
      authorPicture: users.picture,
    })
    .from(ticketComments)
    .leftJoin(users, eq(users.id, ticketComments.userId))
    .where(eq(ticketComments.ticketId, id))
    .orderBy(asc(ticketComments.createdAt));

  res.json(rows);
});

router.post("/tickets/:id/comments", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) { res.status(400).json({ error: "El comentario no puede estar vacío" }); return; }
  if (body.length > 4000) { res.status(400).json({ error: "Comentario demasiado largo" }); return; }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
  if (!canTouch(me, ticket)) { res.status(403).json({ error: "Este ticket no es de tu área" }); return; }

  const [row] = await db.insert(ticketComments).values({ ticketId: id, userId: me.id, body }).returning();
  await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, id));

  for (const target of new Set([ticket.createdBy, ticket.assignedTo].filter((n): n is number => !!n && n !== me.id))) {
    await createNotification({
      userId: target,
      type: "system",
      title: `${me.name || me.email} comentó en "${ticket.title}"`,
      body: body.slice(0, 200),
      link: `/tickets?id=${id}`,
    });
  }

  res.status(201).json(row);
});

/**
 * Convierte un ticket en una tarea del tablero compartido.
 *
 * Es el puente que pedía el negocio: lo que ventas o marketing solicita entra
 * al Scrumban donde el equipo ya trabaja, y el ticket queda enlazado a esa
 * tarea para seguir su avance sin duplicar el pedido.
 */
router.post("/tickets/:id/to-task", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const role = roleOf(me);
  if (!(hubWriteScopesFor(role) as readonly string[]).includes("tasks")) {
    res.status(403).json({ error: "Tu rol no puede crear tareas en el tablero" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!ticket) { res.status(404).json({ error: "Ticket no encontrado" }); return; }
  if (ticket.taskId) { res.status(409).json({ error: "Este ticket ya tiene una tarea en el tablero" }); return; }

  // El tablero es el mismo que abre el Hub: se resuelve por el helper compartido
  // para que la tarea aparezca donde el equipo realmente trabaja.
  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "No hay tablero de dirección" }); return; }
  const tasks = Array.isArray(board.data.tasks) ? (board.data.tasks as Record<string, unknown>[]) : [];

  const now = Date.now();
  const taskId = `tk${id}-${now.toString(36)}`;
  const task = {
    id: taskId,
    title: ticket.title,
    projectId: ticket.projectId || "",
    crit: ticket.priority,
    stage: "sprint",
    stageSince: now,
    stageTime: {},
    notes: [ticket.description, `— Desde el ticket #${ticket.id}`].filter(Boolean).join("\n\n"),
    ticketId: ticket.id,
    createdAt: now,
    updatedAt: now,
  };

  await saveBoard(board.boardUserId, { ...board.data, tasks: [...tasks, task] });
  const stamp = new Date();

  const [updated] = await db
    .update(tickets)
    .set({
      taskId,
      status: ticket.status === "abierto" ? "en_progreso" : ticket.status,
      assignedTo: ticket.assignedTo ?? me.id,
      updatedAt: stamp,
    })
    .where(eq(tickets.id, id))
    .returning();

  if (ticket.createdBy !== me.id) {
    await createNotification({
      userId: ticket.createdBy,
      type: "system",
      title: `Tu ticket "${ticket.title}" entró al tablero`,
      body: `${me.name || me.email} lo convirtió en tarea y ya está en el sprint.`,
      link: `/tickets?id=${id}`,
    });
  }

  res.status(201).json({ ticket: updated, task });
});

export default router;
