import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { playbooks, type PlaybookTask } from "@workspace/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeRole } from "@workspace/roles";
import { applyPlaybook } from "../../lib/handoffs";

/**
 * Playbooks: plantillas de proceso por tipo de trabajo. Al crear un proyecto
 * se puede elegir uno y se generan sus tareas estándar en el tablero.
 * Lectura y aplicación: cualquier usuario con acceso al área /hub.
 * Gestión (crear/editar/archivar): dirección (CEO/Ejecutivo + superadmin).
 */
const router: IRouter = Router();

type AuthUser = { id: number; role?: string; teamRole?: string };
function me(req: Request): AuthUser {
  return req.user as AuthUser;
}
function canManage(req: Request): boolean {
  const u = me(req);
  // normalizeRole resuelve alias legacy ("ejecutivo" → "ventas") y superadmin → ceo.
  const role = normalizeRole(u.teamRole, u.role === "superadmin");
  return role === "ceo" || role === "ventas";
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Cada tarea necesita título").max(200),
  notes: z.string().trim().max(2000).optional(),
  priority: z.enum(["crítica", "alta", "media", "baja"]).optional(),
});

const bodySchema = z.object({
  name: z.string({ required_error: "Nombre requerido" }).trim().min(1, "Nombre requerido").max(120),
  workType: z.string().trim().max(60).default(""),
  description: z.string().trim().max(600).default(""),
  tasks: z.array(taskSchema).max(100).default([]),
});
const patchSchema = bodySchema.partial().extend({ archived: z.boolean().optional() });

/** Playbooks iniciales: los 3 tipos de trabajo más comunes de la agencia. */
const SEED_PLAYBOOKS: Array<{ name: string; workType: string; description: string; tasks: PlaybookTask[] }> = [
  {
    name: "Sitio Web",
    workType: "Sitio Web",
    description: "Proceso estándar para landing pages y sitios corporativos.",
    tasks: [
      { title: "Kickoff con el cliente y levantamiento de requerimientos", priority: "alta" },
      { title: "Wireframes y arquitectura de contenido" },
      { title: "Diseño UI en Figma", priority: "alta" },
      { title: "Aprobación de diseño por el cliente" },
      { title: "Desarrollo frontend" },
      { title: "Contenidos finales (textos e imágenes) cargados" },
      { title: "SEO técnico on-page + analítica (GA4/Pixel)" },
      { title: "QA en móvil y escritorio", priority: "alta" },
      { title: "Publicación en dominio del cliente" },
      { title: "Entrega y capacitación al cliente" },
    ],
  },
  {
    name: "Campaña",
    workType: "Campaña",
    description: "Campaña de marketing digital de punta a punta.",
    tasks: [
      { title: "Brief de campaña: objetivo, audiencia y presupuesto", priority: "alta" },
      { title: "Propuesta creativa y ángulos de mensaje" },
      { title: "Diseño de piezas (estáticos + video)" },
      { title: "Aprobación de piezas por el cliente" },
      { title: "Configurar campañas y públicos en las plataformas", priority: "alta" },
      { title: "Lanzamiento y verificación de tracking" },
      { title: "Optimización semana 1" },
      { title: "Reporte de resultados al cliente" },
    ],
  },
  {
    name: "Video",
    workType: "Video",
    description: "Producción de video para redes: de la idea a la publicación.",
    tasks: [
      { title: "Idea y guión aprobados", priority: "alta" },
      { title: "Grabación" },
      { title: "Edición y post-producción" },
      { title: "Revisión interna y aprobación", priority: "alta" },
      { title: "Portadas y descripciones por red" },
      { title: "Programar publicación en la cola de redes" },
    ],
  },
];

const SEED_LOCK_ID = 730551002;

async function seedIfEmpty(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(playbooks);
  if ((row?.n ?? 0) > 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK_ID})`);
    const [again] = await tx.select({ n: sql<number>`count(*)::int` }).from(playbooks);
    if ((again?.n ?? 0) > 0) return;
    await tx.insert(playbooks).values(SEED_PLAYBOOKS);
  });
}

router.get("/hub/playbooks", async (_req: Request, res: Response) => {
  await seedIfEmpty();
  const rows = await db.select().from(playbooks).orderBy(asc(playbooks.name), asc(playbooks.id));
  res.json({ playbooks: rows, canManage: canManage(_req) });
});

router.post("/hub/playbooks", async (req: Request, res: Response) => {
  if (!canManage(req)) { res.status(403).json({ error: "Solo la dirección puede gestionar playbooks" }); return; }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }
  const [created] = await db.insert(playbooks).values(parsed.data).returning();
  res.status(201).json({ playbook: created });
});

router.patch("/hub/playbooks/:id", async (req: Request, res: Response) => {
  if (!canManage(req)) { res.status(403).json({ error: "Solo la dirección puede gestionar playbooks" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }
  if (Object.keys(parsed.data).length === 0) { res.status(400).json({ error: "Nada que actualizar" }); return; }
  const [updated] = await db
    .update(playbooks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(playbooks.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Playbook no encontrado" }); return; }
  res.json({ playbook: updated });
});

/**
 * Genera las tareas estándar del playbook para un proyecto recién creado.
 * Crear tareas es escritura sobre el sistema de tareas: mismo gate que la
 * gestión de playbooks (dirección), NUNCA abierto a toda el área /hub
 * (RRHH, por ejemplo, puede leer /hub pero no crear tareas).
 */
router.post("/hub/playbooks/:id/apply", async (req: Request, res: Response) => {
  if (!canManage(req)) { res.status(403).json({ error: "Solo la dirección puede aplicar playbooks" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }
  const projectRef = typeof req.body?.projectRef === "string" ? req.body.projectRef.trim().slice(0, 64) : "";
  if (!projectRef) { res.status(400).json({ error: "Campo 'projectRef' requerido" }); return; }
  try {
    const created = await applyPlaybook(id, projectRef, me(req).id);
    res.status(201).json({ created });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || "Playbook no encontrado" });
  }
});

export default router;
