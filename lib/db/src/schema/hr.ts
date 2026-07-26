import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Ficha laboral de cada persona del equipo (Recursos Humanos).
 *
 * Complementa a `users` (que es la cuenta de acceso) con los datos del
 * vínculo laboral: cargo, tipo de contrato, fechas, renta y contacto de
 * emergencia. Solo la dirección y RRHH pueden leerla o escribirla — contiene
 * datos sensibles (renta, teléfonos personales).
 *
 * Las fechas van como texto YYYY-MM-DD: son fechas civiles (ingreso, término)
 * sin hora ni zona horaria, y así se comparan y se muestran sin conversiones.
 */
export const employeeProfiles = pgTable("employee_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Cargo o título del puesto (ej: "Editora de video senior"). */
  position: text("position").notNull().default(""),
  /** Área o equipo al que pertenece. */
  area: text("area").notNull().default(""),
  /** indefinido | plazo_fijo | honorarios | practica */
  contractType: text("contract_type").notNull().default("indefinido"),
  /** activo | licencia | desvinculado */
  employmentStatus: text("employment_status").notNull().default("activo"),
  /** Fecha de ingreso (YYYY-MM-DD). */
  startDate: text("start_date").notNull().default(""),
  /** Fecha de término del contrato, si aplica (YYYY-MM-DD). */
  endDate: text("end_date").notNull().default(""),
  /** Renta bruta mensual en CLP. Null = no registrada. */
  monthlySalary: integer("monthly_salary"),
  phone: text("phone").notNull().default(""),
  emergencyContact: text("emergency_contact").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  /** Carpeta de Drive con contrato, anexos y documentación. */
  documentsUrl: text("documents_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  /** Días hábiles de vacaciones al año (Chile: 15 legales por defecto). */
  vacationDaysPerYear: integer("vacation_days_per_year").notNull().default(15),
  /** % de comisión sobre lo efectivamente cobrado (solo ejecutivos de venta). */
  commissionPct: real("commission_pct").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmployeeProfile = typeof employeeProfiles.$inferSelect;

/**
 * Plantillas de onboarding por rol: la lista de pasos que RRHH espera que
 * complete cada persona nueva según su rol. Editables desde el panel; al
 * aprobar un usuario se copia la plantilla vigente a su checklist.
 */
export const onboardingTemplates = pgTable("onboarding_templates", {
  id: serial("id").primaryKey(),
  /** Rol normalizado (@workspace/roles). Único: una plantilla por rol. */
  role: text("role").notNull().unique(),
  /** Pasos como texto plano, en orden. */
  items: jsonb("items").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OnboardingItem = { text: string; done: boolean; doneAt: string | null };

/**
 * Checklist de onboarding asignado a una persona (copia de la plantilla al
 * momento de asignar — editar la plantilla después no cambia los ya asignados).
 */
export const onboardings = pgTable("onboardings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  /** Rol con el que se asignó (para saber qué plantilla se usó). */
  role: text("role").notNull(),
  items: jsonb("items").$type<OnboardingItem[]>().notNull().default([]),
  assignedBy: integer("assigned_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Onboarding = typeof onboardings.$inferSelect;

/**
 * Solicitudes de vacaciones y permisos. Las fechas son civiles (YYYY-MM-DD) y
 * `days` son días hábiles (lunes-viernes) ya calculados por el servidor: el
 * saldo se descuenta solo con las solicitudes de vacaciones APROBADAS.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** vacaciones | permiso */
    type: text("type").notNull().default("vacaciones"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** Días hábiles que abarca (calculado por el servidor). */
    days: integer("days").notNull(),
    note: text("note").notNull().default(""),
    /** pendiente | aprobada | rechazada */
    status: text("status").notNull().default("pendiente"),
    decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("leave_requests_user_idx").on(t.userId, t.status),
    byRange: index("leave_requests_range_idx").on(t.startDate, t.endDate),
  }),
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;

/**
 * Evaluaciones de desempeño por persona y período (mes YYYY-MM). Las métricas
 * se congelan al cerrar: metas cumplidas y asistencia reales del período, con
 * el comentario de RRHH. El evaluado solo puede leer las cerradas.
 */
export const performanceReviews = pgTable(
  "performance_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Mes evaluado: YYYY-MM. */
    periodKey: text("period_key").notNull(),
    goalsTotal: integer("goals_total").notNull().default(0),
    goalsMet: integer("goals_met").notNull().default(0),
    attendanceMinutes: integer("attendance_minutes").notNull().default(0),
    attendanceDays: integer("attendance_days").notNull().default(0),
    /** Días hábiles de ausencia aprobada en el período. */
    leaveDays: integer("leave_days").notNull().default(0),
    comment: text("comment").notNull().default(""),
    reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniquePeriod: uniqueIndex("performance_reviews_user_period_uq").on(t.userId, t.periodKey),
  }),
);

export type PerformanceReview = typeof performanceReviews.$inferSelect;

/**
 * Documentos de la ficha laboral (contrato, anexos, certificados) con
 * vencimiento opcional. `alertSentFor` guarda la fecha de vencimiento por la
 * que ya se avisó — así el job de alertas notifica UNA vez por vencimiento y
 * vuelve a avisar solo si la fecha cambia.
 */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull().default(""),
    /** Vencimiento YYYY-MM-DD; "" = no vence. */
    expiresAt: text("expires_at").notNull().default(""),
    /** Marcador de dedupe: vencimiento por el que ya se alertó. */
    alertSentFor: text("alert_sent_for").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("employee_documents_user_idx").on(t.userId),
  }),
);

export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
