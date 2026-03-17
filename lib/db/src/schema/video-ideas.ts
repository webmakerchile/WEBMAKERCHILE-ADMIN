import { boolean, integer, pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videoIdeas = pgTable("video_ideas", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  guion: text("guion").notNull(),
  descripcion: text("descripcion"),
  category: text("category").notNull().default("corto-viral"),
  plataforma: text("plataforma").notNull().default("TikTok"),
  duracionSugerida: text("duracion_sugerida"),
  tendencia: text("tendencia"),
  hashtags: jsonb("hashtags").$type<string[]>(),
  inStudio: integer("in_studio").notNull().default(0),
  saved: boolean("saved").notNull().default(false),
  batchDate: text("batch_date"),
  coverImageUrl: text("cover_image_url"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertVideoIdeaSchema = createInsertSchema(videoIdeas).omit({
  id: true,
  createdAt: true,
});

export type VideoIdea = typeof videoIdeas.$inferSelect;
export type InsertVideoIdea = z.infer<typeof insertVideoIdeaSchema>;
