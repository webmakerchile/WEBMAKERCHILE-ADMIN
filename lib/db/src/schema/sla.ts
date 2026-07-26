import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** Tipos de entidad con SLA por etapa. */
export const SLA_ENTITY_TYPES = ["task", "ticket", "video", "project", "contract"] as const;
export type SlaEntityType = (typeof SLA_ENTITY_TYPES)[number];

/**
 * Políticas de SLA: horas máximas esperadas por (tipo de entidad, etapa).
 * Configurables por dirección; sembradas con defaults sensatos.
 */
export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    stage: text("stage").notNull(),
    /** Horas máximas en la etapa antes de considerarse atrasado. 0 = sin SLA. */
    maxHours: integer("max_hours").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTypeStage: uniqueIndex("sla_policies_type_stage_uq").on(t.entityType, t.stage),
  }),
);

/**
 * Vencimientos detectados. La restricción única (tipo, entidad, etapa, entrada
 * a la etapa) garantiza UNA sola notificación por vencimiento: si la entidad
 * vuelve a entrar a la misma etapa más tarde, es un episodio nuevo.
 */
export const slaBreaches = pgTable(
  "sla_breaches",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    stage: text("stage").notNull(),
    /** Cuándo entró la entidad a la etapa (clave del episodio). */
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull(),
    /** Etiqueta legible (ya sanitizada de montos) para notificaciones/paneles. */
    label: text("label").notNull().default(""),
    /** Responsable al momento de detectar; null si no había asignado. */
    responsibleId: integer("responsible_id").references(() => users.id, { onDelete: "set null" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).defaultNow().notNull(),
    /** Motivo del atraso registrado por el responsable. */
    reason: text("reason"),
    reasonById: integer("reason_by_id").references(() => users.id, { onDelete: "set null" }),
    reasonAt: timestamp("reason_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEpisode: uniqueIndex("sla_breaches_episode_uq").on(t.entityType, t.entityId, t.stage, t.stageEnteredAt),
    byResponsible: index("sla_breaches_responsible_idx").on(t.responsibleId),
  }),
);

export type SlaPolicyRow = typeof slaPolicies.$inferSelect;
export type SlaBreachRow = typeof slaBreaches.$inferSelect;
