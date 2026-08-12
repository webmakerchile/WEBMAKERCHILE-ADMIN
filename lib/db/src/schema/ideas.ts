import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tablero de Ideas de Editora + Redes sociales: de EQUIPO, no privado por
 * usuario. Dos columnas fijas (`IDEA_COLUMNS`) — sin edición de texto,
 * comentarios ni votos: solo cargar, mover y eliminar.
 *
 * Quién puede leerlo/escribirlo se decide por ROL, no por área — ver
 * `artifacts/api-server/src/lib/ideas-gate.ts` (Marketing comparte área con
 * Redes sociales pero NO debe tener acceso a este tablero).
 *
 * Distinto del generador de ideas de video con IA de Estudio (tabla
 * `video_ideas`, endpoint `/api/studio/ideas`): son productos separados.
 */
export const IDEA_COLUMNS = ["funciona", "no_funciona"] as const;
export type IdeaColumnId = (typeof IDEA_COLUMNS)[number];

export const ideas = pgTable(
  "ideas",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    columnId: text("column_id").notNull().default("funciona"),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byColumn: index("ideas_column_id_idx").on(t.columnId),
  }),
);

export const insertIdeaSchema = createInsertSchema(ideas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Idea = typeof ideas.$inferSelect;
export type InsertIdea = z.infer<typeof insertIdeaSchema>;
