import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  hubClients,
  hubContracts,
  hubMeetings,
  hubNotes,
  hubProjects,
  hubQuotes,
  hubState,
  hubTasks,
} from "@workspace/db/schema";
import { count, eq } from "drizzle-orm";
import { getHubUser, isAdmin } from "./helpers";

const router: IRouter = Router();

/* ============================================================
   Helpers de saneo del blob legacy (hub_state.data): todos los
   registros llegan como Record<string, unknown> sin garantías.
   ============================================================ */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Epoch ms del blob legacy → Date (o null si no es válido). */
function msDate(v: unknown): Date | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fechas legacy tipo "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" (inputs date/datetime-local).
 * Las fechas sin hora se anclan a mediodía para evitar corrimientos de día por zona horaria.
 */
function legacyDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "$290.000 / mes" → 290000; sin dígitos → null. El string crudo va a `extra`. */
function parseAmountCLP(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  if (!digits || digits.length > 12) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Extrae un fileId de Drive desde una URL tipo .../file/d/<id>/... o ?id=<id>. */
function driveFileIdFromUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}

/** Mapa etapa scrumban legacy → status normalizado de hub_tasks. */
const TASK_STAGE_TO_STATUS: Record<string, string> = {
  backlog: "por_hacer",
  sprint: "por_hacer",
  doing: "en_progreso",
  qa_sent: "en_revision",
  qa_rev: "en_revision",
  done: "hecho",
};

/** Copia a `extra` solo los campos legacy presentes y con valor. */
function buildExtra(pairs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

type LegacyRecord = Record<string, unknown>;

function asArray(v: unknown): LegacyRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is LegacyRecord => !!x && typeof x === "object" && !Array.isArray(x));
}

/** Ejecutor de queries: la instancia global `db` o la `tx` de una transacción. */
type DbExecutor = Pick<typeof db, "select">;

async function allNewTablesEmpty(tx: DbExecutor): Promise<boolean> {
  const [[clients], [projects], [tasks], [meetings], [notes], [contracts], [quotes]] = [
    await tx.select({ value: count() }).from(hubClients),
    await tx.select({ value: count() }).from(hubProjects),
    await tx.select({ value: count() }).from(hubTasks),
    await tx.select({ value: count() }).from(hubMeetings),
    await tx.select({ value: count() }).from(hubNotes),
    await tx.select({ value: count() }).from(hubContracts),
    await tx.select({ value: count() }).from(hubQuotes),
  ];
  return [clients, projects, tasks, meetings, notes, contracts, quotes].every((r) => r.value === 0);
}

const ZERO_COUNTS = { clients: 0, projects: 0, tasks: 0, meetings: 0, notes: 0, contracts: 0 };

/**
 * POST /hub/migrate-legacy — migra el blob hub_state del usuario actual a las
 * tablas nuevas. Idempotente: solo corre si TODAS las tablas nuevas están
 * vacías (si no, responde {migrated:false} sin tocar nada). Solo admin/superadmin.
 * Vínculos por nombre de cliente: si un proyecto/reunión/contrato referencia un
 * cliente que no existe en el blob, se crea un cliente mínimo con ese nombre.
 */
router.post("/hub/migrate-legacy", async (req: Request, res: Response) => {
  const user = getHubUser(req);
  if (!isAdmin(user)) {
    res.status(403).json({ error: "Solo un administrador puede ejecutar la migración" });
    return;
  }

  if (!(await allNewTablesEmpty(db))) {
    res.json({ migrated: false, counts: ZERO_COUNTS });
    return;
  }

  const [blobRow] = await db
    .select()
    .from(hubState)
    .where(eq(hubState.userId, user.id))
    .limit(1);
  const blob = (blobRow?.data ?? null) as Record<string, unknown> | null;
  if (!blob || typeof blob !== "object") {
    res.json({ migrated: false, counts: ZERO_COUNTS });
    return;
  }

  const legacyClients = asArray(blob.clients);
  const legacyProjects = asArray(blob.projects);
  const legacyTasks = asArray(blob.tasks);
  const legacyMeetings = asArray(blob.meetings);
  const legacyNotes = asArray(blob.notes);
  const legacyContracts = asArray(blob.contracts);

  const counts = { ...ZERO_COUNTS };

  await db.transaction(async (tx) => {
    // Re-chequeo dentro de la transacción por si dos admins migran a la vez.
    if (!(await allNewTablesEmpty(tx))) return;

    // Nombre de cliente (normalizado) → id nuevo. Los vínculos legacy son por nombre.
    const clientIdByName = new Map<string, number>();
    const normName = (name: string) => name.trim().toLowerCase();

    async function ensureClient(name: unknown): Promise<number | null> {
      const clean = str(name);
      if (!clean) return null;
      const key = normName(clean);
      const existing = clientIdByName.get(key);
      if (existing !== undefined) return existing;
      const [row] = await tx
        .insert(hubClients)
        .values({ name: clean.trim(), createdBy: user.id })
        .returning({ id: hubClients.id });
      clientIdByName.set(key, row.id);
      counts.clients += 1;
      return row.id;
    }

    // 1) Clientes
    for (const c of legacyClients) {
      const name = str(c.name);
      if (!name) continue;
      const [row] = await tx
        .insert(hubClients)
        .values({
          name: name.trim(),
          notes: str(c.notes),
          extra: buildExtra({ legacyId: c.id, contact: c.contact, segment: c.segment }),
          createdBy: user.id,
          createdAt: msDate(c.createdAt) ?? undefined,
          updatedAt: msDate(c.createdAt) ?? undefined,
        })
        .returning({ id: hubClients.id });
      clientIdByName.set(normName(name), row.id);
      counts.clients += 1;
    }

    // 2) Proyectos (id legacy nanoid → id serial nuevo, para enlazar tareas)
    const projectIdByLegacyId = new Map<string, number>();
    for (const p of legacyProjects) {
      const name = str(p.name);
      if (!name) continue;
      const [row] = await tx
        .insert(hubProjects)
        .values({
          name: name.trim(),
          clientId: await ensureClient(p.client),
          status: str(p.status),
          priority: str(p.prio),
          progress: num(p.prog),
          dueDate: legacyDate(p.due),
          description: str(p.notes),
          extra: buildExtra({
            legacyId: p.id,
            type: p.type,
            owner: p.owner,
            link: p.link,
            stageSince: p.stageSince,
            stageTime: p.stageTime,
          }),
          createdBy: user.id,
          createdAt: msDate(p.createdAt) ?? undefined,
          updatedAt: msDate(p.updatedAt) ?? msDate(p.createdAt) ?? undefined,
        })
        .returning({ id: hubProjects.id });
      const legacyId = str(p.id);
      if (legacyId) projectIdByLegacyId.set(legacyId, row.id);
      counts.projects += 1;
    }

    // 3) Tareas (stage scrumban → status nuevo; timers de etapa quedan en extra)
    for (const t of legacyTasks) {
      const title = str(t.title);
      if (!title) continue;
      const legacyProjectId = str(t.projectId);
      const stage = str(t.stage);
      await tx.insert(hubTasks).values({
        title: title.trim(),
        description: str(t.notes),
        projectId: legacyProjectId ? projectIdByLegacyId.get(legacyProjectId) ?? null : null,
        status: stage ? TASK_STAGE_TO_STATUS[stage] ?? "por_hacer" : "por_hacer",
        priority: str(t.crit),
        assigneeIds: [],
        extra: buildExtra({
          legacyId: t.id,
          stage: t.stage,
          stageSince: t.stageSince,
          stageTime: t.stageTime,
        }),
        createdBy: user.id,
        createdAt: msDate(t.createdAt) ?? undefined,
        updatedAt: msDate(t.updatedAt) ?? msDate(t.createdAt) ?? undefined,
      });
      counts.tasks += 1;
    }

    // 4) Reuniones (el blob no tiene título: se deriva del resumen o del cliente)
    for (const m of legacyMeetings) {
      const clientName = str(m.client);
      const summary = str(m.summary);
      const title = summary
        ? summary.slice(0, 120)
        : clientName
          ? `Reunión con ${clientName}`
          : "Reunión";
      await tx.insert(hubMeetings).values({
        title,
        clientId: await ensureClient(m.client),
        date: legacyDate(m.date),
        summary,
        notes: str(m.notes),
        extra: buildExtra({ legacyId: m.id }),
        createdBy: user.id,
        createdAt: msDate(m.createdAt) ?? undefined,
        updatedAt: msDate(m.createdAt) ?? undefined,
      });
      counts.meetings += 1;
    }

    // 5) Notas (todas quedan como 'team'; la categoría legacy va a extra)
    for (const n of legacyNotes) {
      const title = str(n.title);
      const body = str(n.body);
      if (!title && !body) continue;
      await tx.insert(hubNotes).values({
        title,
        content: body ?? "",
        scope: "team",
        extra: buildExtra({ legacyId: n.id, cat: n.cat }),
        createdBy: user.id,
        createdAt: msDate(n.createdAt) ?? undefined,
        updatedAt: msDate(n.updatedAt) ?? msDate(n.createdAt) ?? undefined,
      });
      counts.notes += 1;
    }

    // 6) Contratos (value string → amount CLP si es parseable; crudo a extra)
    for (const c of legacyContracts) {
      const title = str(c.title);
      if (!title) continue;
      await tx.insert(hubContracts).values({
        title: title.trim(),
        clientId: await ensureClient(c.client),
        clientName: str(c.client),
        status: str(c.status),
        amount: parseAmountCLP(c.value),
        currency: "CLP",
        issuedAt: legacyDate(c.signedAt),
        expiresAt: legacyDate(c.expiresAt),
        driveFileId: driveFileIdFromUrl(c.pdfUrl),
        body: str(c.notes),
        extra: buildExtra({
          legacyId: c.id,
          value: c.value,
          pdfUrl: c.pdfUrl,
          pdfTitle: c.pdfTitle,
          pdfUploadedAt: c.pdfUploadedAt,
        }),
        createdBy: user.id,
        createdAt: msDate(c.createdAt) ?? undefined,
        updatedAt: msDate(c.updatedAt) ?? msDate(c.createdAt) ?? undefined,
      });
      counts.contracts += 1;
    }
  });

  const inserted = Object.values(counts).some((n) => n > 0);
  res.json({ migrated: inserted, counts });
});

export default router;
