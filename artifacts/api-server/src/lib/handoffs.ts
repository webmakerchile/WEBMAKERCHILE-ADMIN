/**
 * Motor de handoffs entre áreas: cuando una etapa termina, el trabajo de la
 * siguiente área aparece solo.
 *
 *  - venta cerrada (contrato → activo)  → proyecto + tareas desde el brief, aviso a desarrollo
 *  - video aprobado                     → cola de redes con fecha sugerida, aviso a marketing
 *  - proyecto entregado (status done)   → ticket de cobranza al contador
 *
 * Idempotencia: cada handoff se "reclama" insertando en handoff_log con una
 * restricción única (kind, entityId). Si la etapa rebota (activo → borrador →
 * activo), el segundo intento no reclama el lock y no se duplica nada.
 *
 * Todos los handoffs son fire-and-forget para el request que los dispara:
 * nunca lanzan hacia arriba, solo loguean.
 */
import { db } from "@workspace/db";
import { handoffLog, hubTasks, playbooks, tickets, users, videos } from "@workspace/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { normalizeRole, ticketAreasFor } from "@workspace/roles";
import { createNotification } from "./notifications";
import { recordActivity } from "./activity";
import { resolveBoard } from "./hub-board";

export type HandoffKind = "venta_cerrada" | "video_aprobado" | "proyecto_entregado";

/** Reclama el handoff. Devuelve true solo la PRIMERA vez para (kind, entityId). */
export async function claimHandoff(kind: HandoffKind, entityId: string | number, detail: Record<string, unknown> = {}): Promise<boolean> {
  const rows = await db
    .insert(handoffLog)
    .values({ kind, entityId: String(entityId), detail })
    .onConflictDoNothing()
    .returning({ id: handoffLog.id });
  return rows.length > 0;
}

/** Libera el claim si el handoff falló a medias, para que un rebote lo reintente. */
export async function releaseHandoff(kind: HandoffKind, entityId: string | number): Promise<void> {
  await db
    .delete(handoffLog)
    .where(and(eq(handoffLog.kind, kind), eq(handoffLog.entityId, String(entityId))));
}

/**
 * Patrón común: reclamar → ejecutar → si falla, liberar el claim y relanzar.
 * Así un error transitorio (DB caída, etc.) no consume la idempotencia:
 * el siguiente rebote de etapa vuelve a intentar el handoff completo.
 */
async function runClaimed(kind: HandoffKind, entityId: string | number, fn: () => Promise<void>): Promise<void> {
  if (!(await claimHandoff(kind, entityId))) return;
  try {
    await fn();
  } catch (err) {
    try { await releaseHandoff(kind, entityId); } catch { /* mejor claim huérfano que crash */ }
    throw err;
  }
}

/** Notifica a todas las personas cuyo rol atiende el área dada (excepto el actor). */
async function notifyArea(area: string, actorId: number, title: string, body: string, link: string): Promise<void> {
  const team = await db
    .select({ id: users.id, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
    .from(users);
  for (const u of team) {
    if (u.id === actorId || u.approvalStatus !== "approved") continue;
    const areas = ticketAreasFor(normalizeRole(u.teamRole, u.role === "superadmin")) as readonly string[];
    if (!areas.includes(area)) continue;
    await createNotification({ userId: u.id, type: "system", title, body, link }).catch(() => {});
  }
}

/* ----------------------- venta cerrada → proyecto ------------------------ */

type ContractEntity = Record<string, unknown> & {
  id?: unknown; title?: unknown; client?: unknown; status?: unknown;
  brief?: { objetivo?: string; alcance?: Array<{ modulo?: string; detalle?: string } | string>; hitos?: Array<{ nombre?: string } | string> } | null;
};

function contractLabel(c: ContractEntity): string {
  return String(c.title ?? c.client ?? c.id ?? "").slice(0, 120) || "(contrato)";
}

/** Tareas estándar derivadas del brief técnico; si no hay brief, un arranque genérico. */
function tasksFromBrief(c: ContractEntity): Array<{ title: string; notes: string | null }> {
  const out: Array<{ title: string; notes: string | null }> = [];
  const brief = c.brief && typeof c.brief === "object" ? c.brief : null;
  const alcance = Array.isArray(brief?.alcance) ? brief!.alcance : [];
  for (const item of alcance.slice(0, 20)) {
    if (typeof item === "string" && item.trim()) out.push({ title: item.trim().slice(0, 200), notes: null });
    else if (item && typeof item === "object") {
      const mod = String((item as { modulo?: unknown }).modulo ?? "").trim();
      const det = String((item as { detalle?: unknown }).detalle ?? "").trim();
      if (mod) out.push({ title: mod.slice(0, 200), notes: det ? det.slice(0, 2000) : null });
    }
  }
  if (out.length === 0) {
    out.push(
      { title: "Kickoff interno del proyecto", notes: "Revisar el contrato y el brief con el equipo." },
      { title: "Levantamiento de requerimientos con el cliente", notes: null },
      { title: "Planificar hitos y fechas de entrega", notes: null },
    );
  }
  return out;
}

/**
 * Venta cerrada: crea el proyecto en el tablero (si el contrato aún no tiene uno)
 * y las tareas estándar desde el brief, y avisa a desarrollo.
 */
export async function handoffContractClosed(contract: ContractEntity, actorId: number): Promise<void> {
  const contractId = String(contract.id ?? "");
  if (!contractId) return;
  await runClaimed("venta_cerrada", contractId, async () => {
    const label = contractLabel(contract);
    const now = Date.now();

    // 1) Proyecto en el tablero, salvo que ya exista uno ligado a este contrato.
    const board = await resolveBoard();
    let projectId: string | null = null;
    if (board) {
      const projects = Array.isArray(board.data.projects) ? (board.data.projects as Record<string, unknown>[]) : [];
      const existing = projects.find((p) => String(p.contractId ?? "") === contractId);
      if (existing) {
        projectId = String(existing.id ?? "");
      } else {
        projectId = `hp${now.toString(36)}`;
        const project = {
          id: projectId,
          name: label,
          client: String(contract.client ?? ""),
          type: "",
          prio: "alta",
          status: "disc",
          owner: "",
          prog: 0,
          notes: "Creado automáticamente al cerrar la venta.",
          link: "",
          due: "",
          contractId,
          createdAt: now,
          updatedAt: now,
          stageSince: now,
          stageTime: {},
        };
        await appendBoardProject(board.boardUserId, project);
      }
    }

    // 2) Tareas estándar desde el brief técnico (sistema hub_tasks).
    const stamp = new Date();
    const taskDefs = tasksFromBrief(contract);
    if (taskDefs.length > 0) {
      await db.insert(hubTasks).values(
        taskDefs.map((t, i) => ({
          title: t.title,
          notes: t.notes,
          createdById: actorId,
          projectRef: projectId,
          stage: "backlog",
          stageSince: stamp,
          stageTime: {},
          priority: "media",
          orderIndex: i,
        })),
      );
    }

    recordActivity({
      actorId, entityType: "project", entityId: projectId || contractId, entityLabel: label,
      action: "created", detail: { handoff: "venta_cerrada", tareas: taskDefs.length },
    });
    await notifyArea(
      "desarrollo", actorId,
      `Venta cerrada: "${label}" ya es proyecto`,
      `Se creó el proyecto con ${taskDefs.length} tareas iniciales desde el brief. Revisa el tablero.`,
      "/hub",
    );
  });
}

/**
 * Agrega el proyecto al blob del tablero de forma ATÓMICA (jsonb concat en SQL),
 * sin leer-modificar-escribir el blob completo: un PATCH /hub concurrente no
 * puede hacer desaparecer el proyecto por pisada de escritura. Si el cliente
 * luego guarda un blob viejo, mergeCollection preserva la entidad del servidor
 * por ser más nueva que su baseVersion.
 */
async function appendBoardProject(boardUserId: number, project: Record<string, unknown>): Promise<void> {
  await db.execute(sql`
    UPDATE hub_state
    SET data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{projects}',
      COALESCE(data->'projects', '[]'::jsonb) || ${JSON.stringify(project)}::jsonb
    ),
    updated_at = now()
    WHERE user_id = ${boardUserId}
  `);
}

/* ----------------------- video aprobado → cola redes ---------------------- */

/** Partes de fecha/hora de un instante visto desde Santiago. */
function santiagoParts(d: Date): { y: number; m: number; day: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day"), h: get("hour") % 24, min: get("minute") };
}

/**
 * Fecha sugerida: mañana a las 12:00 de Santiago (instante UTC exacto).
 * Cálculo por punto fijo sobre el offset real de la zona, correcto incluso
 * en los cambios de horario de verano chilenos.
 */
export function suggestPublishDate(from: Date = new Date()): Date {
  const today = santiagoParts(from);
  // Día siguiente en el calendario de Santiago (Date.UTC normaliza el desborde de mes).
  const targetUtcGuess = Date.UTC(today.y, today.m - 1, today.day + 1, 12, 0, 0, 0);
  let candidate = new Date(targetUtcGuess);
  // Dos iteraciones bastan: corrige por lo que la zona muestra vs lo buscado.
  for (let i = 0; i < 2; i++) {
    const seen = santiagoParts(candidate);
    const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.day, seen.h, seen.min, 0, 0);
    const diff = targetUtcGuess - seenAsUtc;
    if (diff === 0) break;
    candidate = new Date(candidate.getTime() + diff);
  }
  return candidate;
}

/**
 * Video aprobado: le deja fecha sugerida (si no tenía) para que aparezca en la
 * cola de redes, y avisa a marketing. No lo marca "scheduled": publicar sigue
 * siendo una decisión humana.
 */
export async function handoffVideoApproved(videoId: number, actorId: number): Promise<void> {
  await runClaimed("video_aprobado", videoId, async () => {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return;

    let suggested: Date | null = null;
    if (!video.scheduledAt) {
      suggested = suggestPublishDate();
      await db.update(videos).set({ scheduledAt: suggested, updatedAt: new Date() }).where(eq(videos.id, videoId));
    }

    recordActivity({
      actorId, entityType: "video", entityId: videoId, entityLabel: video.title,
      action: "status_change", detail: { handoff: "video_aprobado", fechaSugerida: suggested?.toISOString() ?? null },
    });
    await notifyArea(
      "marketing", actorId,
      `Video aprobado: "${video.title}" entró a la cola de redes`,
      suggested
        ? `Fecha sugerida: ${suggested.toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}. Ajústala y prográmalo.`
        : "Ya tenía fecha programada. Revísala y confirma la publicación.",
      `/videos?select=${videoId}`,
    );
  });
}

/* -------------------- proyecto entregado → cobranza ----------------------- */

type ProjectEntity = Record<string, unknown> & { id?: unknown; name?: unknown; client?: unknown; contractId?: unknown };

/**
 * Proyecto entregado: abre automáticamente un ticket de cobranza en el área de
 * finanzas (asignado al contador si hay uno) y avisa.
 */
export async function handoffProjectDelivered(project: ProjectEntity, actorId: number): Promise<void> {
  const projectId = String(project.id ?? "");
  if (!projectId) return;
  await runClaimed("proyecto_entregado", projectId, async () => {
    const name = String(project.name ?? project.id ?? "").slice(0, 150) || "(proyecto)";
    const client = String(project.client ?? "").slice(0, 200);

    // Asignar al contador más antiguo si existe.
    const team = await db
      .select({ id: users.id, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
      .from(users)
      .orderBy(asc(users.id));
    const contador = team.find(
      (u) => u.approvalStatus === "approved" && normalizeRole(u.teamRole, u.role === "superadmin") === "contador",
    );

    const [ticket] = await db
      .insert(tickets)
      .values({
        title: `Cobranza: ${name}`.slice(0, 200),
        description: [
          `El proyecto "${name}" fue marcado como entregado.`,
          client ? `Cliente: ${client}.` : null,
          "Gestionar la facturación y el cobro final.",
        ].filter(Boolean).join("\n"),
        area: "finanzas",
        priority: "alta",
        projectId,
        contractId: String(project.contractId ?? ""),
        clientName: client,
        assignedTo: contador?.id ?? null,
        createdBy: actorId,
      })
      .returning();

    recordActivity({
      actorId, entityType: "ticket", entityId: ticket!.id, entityLabel: ticket!.title,
      action: "created", detail: { handoff: "proyecto_entregado", projectId },
    });
    if (contador && contador.id !== actorId) {
      await createNotification({
        userId: contador.id,
        type: "system",
        title: `Proyecto entregado: cobranza de "${name}"`,
        body: "Se abrió automáticamente un ticket de cobranza a tu nombre.",
        link: `/tickets?id=${ticket!.id}`,
      }).catch(() => {});
    } else {
      await notifyArea(
        "finanzas", actorId,
        `Proyecto entregado: cobranza de "${name}"`,
        "Se abrió automáticamente un ticket de cobranza.",
        `/tickets?id=${ticket!.id}`,
      );
    }
  });
}

/* ------------------------------ playbooks --------------------------------- */

/**
 * Genera las tareas estándar de un playbook para un proyecto.
 * Devuelve cuántas tareas creó. Lanza si el playbook no existe o está archivado.
 */
export async function applyPlaybook(playbookId: number, projectRef: string, actorId: number): Promise<number> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.id, playbookId)).limit(1);
  if (!pb || pb.archived) throw new Error("Playbook no encontrado");
  const defs = Array.isArray(pb.tasks) ? pb.tasks : [];
  if (defs.length === 0) return 0;
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${hubTasks.orderIndex}), 0)::int` })
    .from(hubTasks);
  const base = (maxRow?.max ?? 0) + 1;
  const now = new Date();
  await db.insert(hubTasks).values(
    defs.slice(0, 100).map((t, i) => ({
      title: String(t.title || "").slice(0, 200) || "(tarea)",
      notes: t.notes ? String(t.notes).slice(0, 2000) : null,
      createdById: actorId,
      projectRef,
      stage: "backlog",
      stageSince: now,
      stageTime: {},
      priority: ["crítica", "alta", "media", "baja"].includes(String(t.priority)) ? String(t.priority) : "media",
      orderIndex: base + i,
    })),
  );
  recordActivity({
    actorId, entityType: "project", entityId: projectRef, entityLabel: pb.name,
    action: "created", detail: { playbook: pb.id, tareas: defs.length },
  });
  return defs.length;
}
