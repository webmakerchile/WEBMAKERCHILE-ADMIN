import { db } from "@workspace/db";
import {
  employeeDocuments,
  employeeProfiles,
  goals,
  hubWorkSessions,
  leaveRequests,
  onboardingTemplates,
  users,
} from "@workspace/db/schema";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { normalizeRole, ROLES, TEAM_ROLES, type TeamRole } from "@workspace/roles";
import { createNotification } from "./notifications";
import { periodKey } from "./periods";
import { sessionMinutes } from "../routes/jornada";

/**
 * Operaciones de RRHH: onboarding por rol, vacaciones/permisos, evaluación de
 * desempeño y alertas de vencimiento de documentos.
 */

/* ============================ Onboarding ================================= */

const COMMON_STEPS = [
  "Firmar contrato y anexos",
  "Entregar datos personales y de emergencia a RRHH",
  "Vincular cuenta de Discord al panel",
  "Aprender a marcar entrada/salida en Mi Día",
  "Conocer el flujo de tickets y a quién pedir ayuda",
];

const ROLE_STEPS: Partial<Record<TeamRole, string[]>> = {
  editora: ["Acceso a la carpeta de Drive de videos", "Revisar el flujo de revisión y aprobación de videos", "Editar un video de prueba de punta a punta"],
  social: ["Acceso a las cuentas de redes sociales", "Revisar el calendario de publicaciones", "Programar una publicación de prueba"],
  ventas: ["Acceso al Hub de proyectos y clientes", "Revisar el catálogo de servicios y cotizaciones", "Acompañar una reunión comercial"],
  dev: ["Acceso al repositorio y credenciales de desarrollo", "Levantar el entorno local", "Resolver un ticket pequeño de desarrollo"],
  marketing: ["Acceso a analíticas e inspiración de competidores", "Revisar el tono de marca", "Proponer una idea de contenido"],
  contador: ["Acceso a la documentación financiera", "Revisar el flujo de cotizaciones y contratos"],
  rrhh: ["Acceso a las fichas laborales", "Revisar el flujo de aprobación de accesos", "Conocer las plantillas de onboarding"],
};

/** Plantilla por defecto para un rol: pasos comunes + específicos. */
export function defaultOnboardingItems(role: TeamRole): string[] {
  return [...COMMON_STEPS, ...(ROLE_STEPS[role] ?? [])];
}

const SEED_LOCK = 730551003;

/** Siembra las plantillas de onboarding si la tabla está vacía (idempotente). */
export async function seedOnboardingTemplatesIfEmpty(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK})`);
    const existing = await tx.select({ id: onboardingTemplates.id }).from(onboardingTemplates).limit(1);
    if (existing.length > 0) return;
    const rows = TEAM_ROLES
      .filter((r) => r !== "ceo" && r !== "tester")
      .map((role) => ({ role, items: defaultOnboardingItems(role) }));
    if (rows.length > 0) await tx.insert(onboardingTemplates).values(rows);
  });
}

/* ======================= Días hábiles y saldo ============================ */

/** Días hábiles (lunes a viernes) entre dos fechas civiles, inclusive. */
export function businessDays(startDate: string, endDate: string): number {
  let count = 0;
  const d = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z").getTime();
  while (d.getTime() <= end) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
    if (count > 366) break; // guardia: rangos absurdos
  }
  return count;
}

export type LeaveBalance = {
  allowance: number;
  usedDays: number;
  pendingDays: number;
  available: number;
  year: string;
};

/**
 * Saldo de vacaciones del año en curso: asignación anual de la ficha menos
 * días hábiles de vacaciones aprobadas (las pendientes se informan aparte y
 * también bloquean nuevas solicitudes para no sobregirar).
 */
/** Ejecutor mínimo (db o tx) para poder calcular el saldo dentro de una transacción. */
export type DbExecutor = Pick<typeof db, "select">;

export async function leaveBalance(userId: number, now: Date = new Date(), exec: DbExecutor = db): Promise<LeaveBalance> {
  const year = String(now.getFullYear());
  const [profile] = await exec
    .select({ allowance: employeeProfiles.vacationDaysPerYear })
    .from(employeeProfiles)
    .where(eq(employeeProfiles.userId, userId))
    .limit(1);
  const allowance = profile?.allowance ?? 15;
  const rows = await exec
    .select({ days: leaveRequests.days, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.userId, userId),
      eq(leaveRequests.type, "vacaciones"),
      gte(leaveRequests.startDate, `${year}-01-01`),
      lte(leaveRequests.startDate, `${year}-12-31`),
      ne(leaveRequests.status, "rechazada"),
    ));
  const usedDays = rows.filter((r) => r.status === "aprobada").reduce((a, r) => a + r.days, 0);
  const pendingDays = rows.filter((r) => r.status === "pendiente").reduce((a, r) => a + r.days, 0);
  return { allowance, usedDays, pendingDays, available: Math.max(0, allowance - usedDays - pendingDays), year };
}

/* ==================== Métricas de desempeño (mes) ======================== */

export type PerformanceMetrics = {
  periodKey: string;
  goalsTotal: number;
  goalsMet: number;
  attendanceMinutes: number;
  attendanceDays: number;
  leaveDays: number;
};

/** Último día del mes YYYY-MM como fecha civil. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** Todas las claves de período (día/semana/mes) que caen dentro del mes. */
export function periodKeysOfMonth(month: string): string[] {
  const keys = new Set<string>([month]);
  const end = monthEnd(month);
  for (let d = `${month}-01`; d <= end; ) {
    keys.add(d);
    keys.add(periodKey("semanal", new Date(d + "T15:00:00Z")));
    const nd = new Date(d + "T12:00:00Z");
    nd.setUTCDate(nd.getUTCDate() + 1);
    d = nd.toISOString().slice(0, 10);
  }
  return [...keys];
}

/**
 * Métricas reales del período: metas cumplidas (módulo de metas) + asistencia
 * (jornada) + ausencias aprobadas. RRHH solo agrega su comentario encima.
 */
export async function computePerformanceMetrics(userId: number, month: string): Promise<PerformanceMetrics> {
  const keys = periodKeysOfMonth(month);
  const end = monthEnd(month);
  const [goalRows, sessions, leaves] = await Promise.all([
    db.select({ status: goals.status }).from(goals)
      .where(and(eq(goals.assignedTo, userId), inArray(goals.periodKey, keys))),
    db.select().from(hubWorkSessions)
      .where(and(
        eq(hubWorkSessions.userId, userId),
        gte(hubWorkSessions.workDate, `${month}-01`),
        lte(hubWorkSessions.workDate, end),
      )),
    db.select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate }).from(leaveRequests)
      .where(and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, "aprobada"),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, `${month}-01`),
      )),
  ]);
  const now = new Date();
  const attendanceMinutes = sessions.reduce((a, s) => a + (s.checkOut ? sessionMinutes(s, now) : 0), 0);
  const attendanceDays = new Set(sessions.map((s) => s.workDate)).size;
  const leaveDays = leaves.reduce((a, l) => {
    const from = l.startDate > `${month}-01` ? l.startDate : `${month}-01`;
    const to = l.endDate < end ? l.endDate : end;
    return a + (from <= to ? businessDays(from, to) : 0);
  }, 0);
  return {
    periodKey: month,
    goalsTotal: goalRows.length,
    goalsMet: goalRows.filter((g) => g.status === "cumplida").length,
    attendanceMinutes,
    attendanceDays,
    leaveDays,
  };
}

/* ===================== Destinatarios RRHH/dirección ====================== */

/** IDs de RRHH + CEO aprobados (destinatarios de avisos de gestión de personas). */
export async function getHrRecipientIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id, teamRole: users.teamRole, role: users.role })
    .from(users)
    .where(eq(users.approvalStatus, "approved"));
  return rows
    .filter((u) => {
      const r = normalizeRole(u.teamRole, u.role === "superadmin");
      return r === "rrhh" || r === "ceo";
    })
    .map((u) => u.id);
}

/* ================= Alertas de vencimiento de documentos ================== */

const ALERT_DAYS_AHEAD = 30;

/**
 * Avisa a RRHH y dirección cuando un documento de ficha vence dentro de 30
 * días (o ya venció). Una sola alerta por vencimiento: el marcador
 * `alertSentFor` guarda la fecha por la que ya se avisó, y solo se vuelve a
 * avisar si la fecha de vencimiento cambia.
 */
export async function checkDocumentExpiryAlerts(now: Date = new Date()): Promise<number> {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const limitD = new Date(today + "T12:00:00Z");
  limitD.setUTCDate(limitD.getUTCDate() + ALERT_DAYS_AHEAD);
  const limit = limitD.toISOString().slice(0, 10);

  const docs = await db
    .select({
      id: employeeDocuments.id,
      name: employeeDocuments.name,
      userId: employeeDocuments.userId,
      expiresAt: employeeDocuments.expiresAt,
      alertSentFor: employeeDocuments.alertSentFor,
      userName: users.name,
      userEmail: users.email,
    })
    .from(employeeDocuments)
    .innerJoin(users, eq(users.id, employeeDocuments.userId))
    .where(and(
      eq(employeeDocuments.archived, false),
      ne(employeeDocuments.expiresAt, ""),
      lte(employeeDocuments.expiresAt, limit),
    ));

  let alerted = 0;
  const recipients = docs.length > 0 ? await getHrRecipientIds() : [];
  for (const doc of docs) {
    if (doc.alertSentFor === doc.expiresAt) continue;
    // Marcar primero (condicional) para que dos ticks concurrentes no dupliquen.
    const updated = await db
      .update(employeeDocuments)
      .set({ alertSentFor: doc.expiresAt })
      .where(and(eq(employeeDocuments.id, doc.id), ne(employeeDocuments.alertSentFor, doc.expiresAt)))
      .returning({ id: employeeDocuments.id });
    if (updated.length === 0) continue;
    alerted++;
    const who = doc.userName || doc.userEmail;
    const vencido = doc.expiresAt < today;
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "system",
        title: vencido
          ? `Documento vencido: ${doc.name} de ${who}`
          : `Documento por vencer: ${doc.name} de ${who}`,
        body: `Vence el ${doc.expiresAt}. Revisa la ficha en Recursos Humanos.`,
        link: "/rrhh",
      }).catch((err) => console.error("[hr-ops] notify doc expiry failed", err));
    }
  }
  return alerted;
}

/** Etiqueta legible de un rol para notificaciones. */
export function roleLabel(role: TeamRole): string {
  return ROLES[role]?.label ?? role;
}
