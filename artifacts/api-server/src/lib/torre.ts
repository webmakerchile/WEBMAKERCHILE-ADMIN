import { db } from "@workspace/db";
import {
  employeeProfiles,
  goals,
  hubTasks,
  hubWorkSessions,
  projectAssignments,
  slaPolicies,
  users,
} from "@workspace/db/schema";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { AREAS, areaOfRole, type Area } from "@workspace/areas";
import { normalizeRole } from "@workspace/roles";
import { collectOpenItems, seedSlaPoliciesIfEmpty, stageLabel, type OpenItem } from "./sla";
import { currentKeys } from "./periods";
import { resolveBoard } from "./hub-board";
import { contractNet } from "./ventas";
import { sessionMinutes } from "../routes/jornada";

/**
 * Torre de control del CEO: semáforo por área, metas de empresa y
 * rentabilidad por proyecto. Todo se calcula al leer — nada se duplica en
 * tablas de resumen que puedan quedar desactualizadas.
 */

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/* ============================== Semáforo ================================= */

export type Semaforo = "green" | "yellow" | "red";

export interface AreaStatus {
  area: Area;
  status: Semaforo;
  /** Ítems pasados de su SLA ahora mismo (no el log histórico). */
  slaOverdue: Array<{ entityType: string; entityId: string; label: string; stage: string; stageLabel: string; hoursOver: number; responsible: string | null }>;
  /** Personas en rojo según carga (tareas estancadas o vencidas). */
  saturated: Array<{ id: number; name: string; stagnant: number; overdue: number }>;
  /** Cumplimiento de metas vigentes del área (0–100; null = sin metas). */
  goalsPct: number | null;
  goalsTotal: number;
  goalsDone: number;
}

/** Umbral bajo el cual las metas ponen el área en amarillo. */
export const GOALS_YELLOW_THRESHOLD = 50;

interface MemberInfo { id: number; name: string; area: Area | null }

async function approvedMembers(): Promise<MemberInfo[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, teamRole: users.teamRole, role: users.role })
    .from(users)
    .where(eq(users.approvalStatus, "approved"));
  return rows.map((u) => ({
    id: u.id,
    name: u.name || u.email,
    area: areaOfRole(normalizeRole(u.teamRole, u.role === "superadmin")),
  }));
}

/** Área a la que se atribuye un ítem de SLA sin responsable, por su tipo. */
function defaultAreaFor(entityType: string): Area {
  if (entityType === "video") return "edicion";
  return "ejecutivo";
}

/** % de cumplimiento de un grupo de metas: con target, avance/total; sin target, cumplidas/total. */
export function goalsCompliance(rows: Array<{ target: number | null; progress: number; status: string }>): { pct: number | null; total: number; done: number } {
  if (rows.length === 0) return { pct: null, total: 0, done: 0 };
  let num = 0;
  let den = 0;
  let done = 0;
  for (const g of rows) {
    if (g.status === "cumplida") done++;
    if (g.target && g.target > 0) {
      num += Math.min(g.progress, g.target);
      den += g.target;
    } else {
      num += g.status === "cumplida" ? 1 : 0;
      den += 1;
    }
  }
  return { pct: den > 0 ? Math.round((num / den) * 100) : null, total: rows.length, done };
}

/** Semáforo del área a partir de sus tres insumos. */
export function areaSemaforo(slaCount: number, saturatedCount: number, goalsPct: number | null): Semaforo {
  if (slaCount > 0 || saturatedCount > 0) return "red";
  if (goalsPct !== null && goalsPct < GOALS_YELLOW_THRESHOLD) return "yellow";
  return "green";
}

export async function computeSemaforo(now: Date = new Date()): Promise<AreaStatus[]> {
  const members = await approvedMembers();
  const areaOf = new Map(members.map((m) => [m.id, m.area] as const));
  const nameOf = new Map(members.map((m) => [m.id, m.name] as const));

  // 1. SLA: ítems abiertos que YA se pasaron de su política, en vivo.
  await seedSlaPoliciesIfEmpty();
  const policies = await db.select().from(slaPolicies);
  const maxHours = new Map(policies.map((p) => [`${p.entityType}:${p.stage}`, p.maxHours] as const));
  const open: OpenItem[] = await collectOpenItems();
  const overdueItems = open
    .map((i) => {
      const max = maxHours.get(`${i.entityType}:${i.stage}`) ?? 0;
      const hours = (now.getTime() - i.stageEnteredAt.getTime()) / 3600000;
      return { item: i, over: max > 0 ? hours - max : -1 };
    })
    .filter((x) => x.over > 0);

  // 2. Carga: mismas reglas que la vista de equipo (estancada >48h o vencida = rojo).
  const stagnantThreshold = new Date(now.getTime() - 48 * 3600000);
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const STAGNANT_STAGES = new Set(["sprint", "doing", "qa_sent", "qa_rev"]);
  const activeTasks = await db
    .select({ stage: hubTasks.stage, dueDate: hubTasks.dueDate, stageSince: hubTasks.stageSince, assigneeId: hubTasks.assigneeId })
    .from(hubTasks)
    .where(and(ne(hubTasks.stage, "done"), sql`${hubTasks.assigneeId} IS NOT NULL`));
  const loadByUser = new Map<number, { stagnant: number; overdue: number }>();
  for (const t of activeTasks) {
    if (t.assigneeId == null) continue;
    const stagnant = STAGNANT_STAGES.has(t.stage) && t.stageSince != null && new Date(t.stageSince) < stagnantThreshold;
    const overdue = t.dueDate != null && t.dueDate < todayStr;
    if (!stagnant && !overdue) continue;
    const cur = loadByUser.get(t.assigneeId) ?? { stagnant: 0, overdue: 0 };
    if (stagnant) cur.stagnant++;
    if (overdue) cur.overdue++;
    loadByUser.set(t.assigneeId, cur);
  }

  // 3. Metas vigentes (hoy / esta semana / este mes) por área del asignado.
  const keys = currentKeys(now);
  const goalRows = await db
    .select({ assignedTo: goals.assignedTo, target: goals.target, progress: goals.progress, status: goals.status, period: goals.period, periodKey: goals.periodKey })
    .from(goals)
    .where(inArray(goals.periodKey, [keys.diaria, keys.semanal, keys.mensual]));
  const vigentes = goalRows.filter((g) => keys[g.period as keyof typeof keys] === g.periodKey);

  return AREAS.map((area) => {
    const slaOverdue = overdueItems
      .filter(({ item }) => {
        const respArea = item.responsibleId != null ? (areaOf.get(item.responsibleId) ?? null) : null;
        return (respArea ?? defaultAreaFor(item.entityType)) === area;
      })
      .map(({ item, over }) => ({
        entityType: item.entityType,
        entityId: item.entityId,
        label: item.label,
        stage: item.stage,
        stageLabel: stageLabel(item.stage),
        hoursOver: Math.round(over),
        responsible: item.responsibleId != null ? (nameOf.get(item.responsibleId) ?? null) : null,
      }))
      .sort((a, b) => b.hoursOver - a.hoursOver);

    const saturated = members
      .filter((m) => m.area === area && loadByUser.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, ...loadByUser.get(m.id)! }));

    const areaGoals = vigentes.filter((g) => (areaOf.get(g.assignedTo) ?? null) === area);
    const { pct, total, done } = goalsCompliance(areaGoals);

    return {
      area,
      status: areaSemaforo(slaOverdue.length, saturated.length, pct),
      slaOverdue,
      saturated,
      goalsPct: pct,
      goalsTotal: total,
      goalsDone: done,
    };
  });
}

/* ============================ Rentabilidad =============================== */

export interface ProjectProfit {
  projectRef: string;
  name: string;
  client: string;
  status: string;
  contractId: string | null;
  /** Horas imputadas en el rango (jornada × % de dedicación). */
  hours: number;
  /** Costo de esas horas según el costo hora de cada ficha. */
  cost: number;
  /** Neto del contrato vinculado (null si no hay contrato). */
  revenue: number | null;
  cobroEstado: string | null;
  margin: number | null;
  /** Personas asignadas sin costo hora registrado: el costo está subestimado. */
  missingCost: string[];
  assignments: Array<{ userId: number; name: string; allocationPct: number; minutes: number; hourlyCost: number | null }>;
}

export async function computeProfitability(from: string, to: string): Promise<ProjectProfit[]> {
  const board = await resolveBoard();
  const projects = board && Array.isArray(board.data.projects) ? (board.data.projects as Rec[]) : [];
  const contracts = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const contractById = new Map(contracts.map((c) => [str(c.id), c] as const));

  const [assignRows, members] = await Promise.all([
    db.select().from(projectAssignments),
    approvedMembers(),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name] as const));

  const userIds = [...new Set(assignRows.map((a) => a.userId))];
  const [sessions, profiles] = userIds.length === 0
    ? [[] as Array<{ userId: number; checkIn: Date; checkOut: Date | null }>, [] as Array<{ userId: number; hourlyCost: number | null }>]
    : await Promise.all([
        db.select({ userId: hubWorkSessions.userId, checkIn: hubWorkSessions.checkIn, checkOut: hubWorkSessions.checkOut })
          .from(hubWorkSessions)
          .where(and(
            inArray(hubWorkSessions.userId, userIds),
            gte(hubWorkSessions.workDate, from),
            lte(hubWorkSessions.workDate, to),
          )),
        db.select({ userId: employeeProfiles.userId, hourlyCost: employeeProfiles.hourlyCost })
          .from(employeeProfiles)
          .where(inArray(employeeProfiles.userId, userIds)),
      ]);

  const minutesByUser = new Map<number, number>();
  const now = new Date();
  for (const s of sessions) {
    minutesByUser.set(s.userId, (minutesByUser.get(s.userId) ?? 0) + sessionMinutes(s, now));
  }
  const costOf = new Map(profiles.map((p) => [p.userId, p.hourlyCost] as const));

  const byProject = new Map<string, typeof assignRows>();
  for (const a of assignRows) {
    if (!byProject.has(a.projectRef)) byProject.set(a.projectRef, []);
    byProject.get(a.projectRef)!.push(a);
  }

  return projects.map((p) => {
    const ref = str(p.id);
    const rows = byProject.get(ref) ?? [];
    let totalMinutes = 0;
    let cost = 0;
    const missingCost: string[] = [];
    const detail = rows.map((a) => {
      const mins = Math.round((minutesByUser.get(a.userId) ?? 0) * (a.allocationPct / 100));
      const hc = costOf.get(a.userId) ?? null;
      totalMinutes += mins;
      if (hc != null) cost += (mins / 60) * hc;
      else if (mins > 0) missingCost.push(nameOf.get(a.userId) ?? `#${a.userId}`);
      return { userId: a.userId, name: nameOf.get(a.userId) ?? `#${a.userId}`, allocationPct: a.allocationPct, minutes: mins, hourlyCost: hc };
    });

    const contractId = str(p.contractId) || null;
    const contract = contractId ? contractById.get(contractId) : undefined;
    const revenue = contract ? contractNet(contract) : null;
    const cobro = contract?.cobro as Rec | undefined;
    cost = Math.round(cost);

    return {
      projectRef: ref,
      name: str(p.name),
      client: str(p.client),
      status: str(p.status),
      contractId,
      hours: Math.round((totalMinutes / 60) * 10) / 10,
      cost,
      revenue,
      cobroEstado: cobro ? str(cobro.estado) : null,
      margin: revenue != null ? revenue - cost : null,
      missingCost,
      assignments: detail,
    };
  });
}
