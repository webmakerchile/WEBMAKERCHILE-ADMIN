import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { goals, users } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { canAssignGoals, normalizeRole } from "@workspace/roles";
import { z } from "zod";
import { createNotification } from "../../lib/notifications";
import { recordActivity } from "../../lib/activity";
import { PERIODS, currentKeys, isPeriod, periodKey, type Period } from "../../lib/periods";

const router: IRouter = Router();

type Me = { id: number; name: string | null; email: string; teamRole: string; role: string };

async function loadMe(req: Request): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  return me ? { id: me.id, name: me.name, email: me.email, teamRole: me.teamRole, role: me.role } : null;
}

const roleOf = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin");
/** Dirección, ventas y RRHH ponen metas; el resto solo cumple las suyas. */
const puedeAsignar = (me: Me) => canAssignGoals(roleOf(me));

const createSchema = z.object({
  title: z.string().trim().min(3, "La meta necesita un título").max(200),
  description: z.string().trim().max(2000).default(""),
  period: z.string().refine(isPeriod, "Período inválido"),
  assignedTo: z.coerce.number().int().positive(),
  target: z.union([z.null(), z.coerce.number().int().min(1).max(100_000)]).default(null),
  /** Ventana explícita; por defecto, la vigente. */
  periodKey: z.string().trim().max(10).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["pendiente", "cumplida", "no_cumplida"]).optional(),
  progress: z.coerce.number().int().min(0).max(100_000).optional(),
  target: z.union([z.null(), z.coerce.number().int().min(1).max(100_000)]).optional(),
});

/**
 * GET /goals — las metas que me tocan.
 *
 * Por defecto solo las ventanas vigentes (hoy / esta semana / este mes): una
 * meta de la semana pasada ya no es accionable y solo haría ruido. Con
 * `?scope=team` quien asigna ve las de todo el equipo.
 */
router.get("/goals", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const equipo = String(req.query.scope || "") === "team" && puedeAsignar(me);
  const incluirPasadas = String(req.query.history || "") === "1";
  const keys = currentKeys();

  const filas = await db
    .select()
    .from(goals)
    .where(equipo ? undefined : eq(goals.assignedTo, me.id))
    .orderBy(desc(goals.createdAt))
    .limit(500);

  const vigentes = incluirPasadas
    ? filas
    : filas.filter(g => g.periodKey === keys[g.period as Period]);

  const ids = new Set<number>();
  for (const g of vigentes) { ids.add(g.assignedTo); ids.add(g.createdBy); }
  const personas = ids.size
    ? await db.select({ id: users.id, name: users.name, email: users.email, picture: users.picture })
        .from(users).where(inArray(users.id, Array.from(ids)))
    : [];
  const porId = new Map(personas.map(p => [p.id, p]));

  res.json({
    goals: vigentes.map(g => ({
      ...g,
      assignee: porId.get(g.assignedTo) ?? null,
      creator: porId.get(g.createdBy) ?? null,
    })),
    periods: PERIODS,
    currentKeys: keys,
    canAssign: puedeAsignar(me),
  });
});

router.post("/goals", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!puedeAsignar(me)) {
    res.status(403).json({ error: "Tu rol no puede asignar metas" });
    return;
  }

  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const d = parsed.data;

  const [destino] = await db.select({ id: users.id }).from(users).where(eq(users.id, d.assignedTo)).limit(1);
  if (!destino) { res.status(404).json({ error: "Esa persona no existe" }); return; }

  const [row] = await db
    .insert(goals)
    .values({
      title: d.title,
      description: d.description,
      period: d.period,
      periodKey: d.periodKey || periodKey(d.period as Period),
      assignedTo: d.assignedTo,
      createdBy: me.id,
      target: d.target,
    })
    .returning();

  recordActivity({ actorId: me.id, entityType: "goal", entityId: row!.id, entityLabel: row!.title, action: "created", detail: { assignedTo: d.assignedTo } });

  if (d.assignedTo !== me.id) {
    await createNotification({
      userId: d.assignedTo,
      type: "system",
      title: `Nueva meta: "${d.title}"`,
      body: `${me.name || me.email} te asignó una meta ${d.period}.`,
      link: "/metas",
    });
  }

  res.status(201).json(row);
});

router.patch("/goals/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [actual] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!actual) { res.status(404).json({ error: "Meta no encontrada" }); return; }

  // Quien la cumple puede avanzarla; quien la asignó (o dirección) puede editarla.
  const esDuenio = actual.assignedTo === me.id;
  const esGestor = puedeAsignar(me);
  if (!esDuenio && !esGestor) {
    res.status(403).json({ error: "Esta meta no es tuya" });
    return;
  }

  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const d = parsed.data;

  // Quien solo cumple no puede reescribir el enunciado de su propia meta.
  if (!esGestor && (d.title !== undefined || d.description !== undefined || d.target !== undefined)) {
    res.status(403).json({ error: "Solo quien asignó la meta puede cambiar su enunciado" });
    return;
  }

  const patch: Record<string, unknown> = { ...d, updatedAt: new Date() };
  if (d.status === "cumplida" && actual.status !== "cumplida") patch.completedAt = new Date();
  if (d.status && d.status !== "cumplida") patch.completedAt = null;

  const [row] = await db.update(goals).set(patch).where(eq(goals.id, id)).returning();

  if (d.status && d.status !== actual.status) {
    recordActivity({
      actorId: me.id,
      entityType: "goal",
      entityId: id,
      entityLabel: actual.title,
      action: d.status === "cumplida" ? "completed" : "status_change",
      detail: { from: actual.status, to: d.status },
    });
  }

  if (d.status === "cumplida" && actual.createdBy !== me.id) {
    await createNotification({
      userId: actual.createdBy,
      type: "system",
      title: `Meta cumplida: "${actual.title}"`,
      body: `${me.name || me.email} completó la meta que le asignaste.`,
      link: "/metas",
    });
  }

  res.json(row);
});

router.delete("/goals/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [actual] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!actual) { res.status(404).json({ error: "Meta no encontrada" }); return; }
  // Borrar una meta ajena la haría desaparecer del historial de otra persona.
  if (!puedeAsignar(me) || (actual.createdBy !== me.id && roleOf(me) !== "ceo")) {
    res.status(403).json({ error: "Solo quien asignó la meta puede eliminarla" });
    return;
  }

  await db.delete(goals).where(eq(goals.id, id));
  res.json({ ok: true });
});

/* ---------- Preferencias de menú: cada quien ordena su barra lateral ---------- */

router.get("/me/nav", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  const [row] = await db.select({ navHidden: users.navHidden }).from(users).where(eq(users.id, me.id)).limit(1);
  res.json({ hidden: (row?.navHidden || "").split(",").map(s => s.trim()).filter(Boolean) });
});

router.put("/me/nav", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const body = req.body as { hidden?: unknown };
  const lista = Array.isArray(body.hidden) ? body.hidden : [];
  // Solo rutas del propio panel: nada de texto libre en la base.
  const limpio = lista
    .filter((x): x is string => typeof x === "string")
    .map(x => x.trim())
    .filter(x => /^\/[a-z0-9/-]{0,60}$/i.test(x))
    .slice(0, 50);

  await db.update(users).set({ navHidden: limpio.join(",") }).where(eq(users.id, me.id));
  res.json({ hidden: limpio });
});

export default router;
