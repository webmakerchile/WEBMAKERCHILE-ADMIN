import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmployeeProfile = typeof employeeProfiles.$inferSelect;
