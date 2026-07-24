-- Catálogo de servicios editable del Hub (antes hardcodeado en el frontend).
-- El seed de datos lo hace la API en el primer GET si la tabla está vacía.
-- Ya aplicado en desarrollo (2026-07-24); pendiente de aplicar en producción al publicar.

CREATE TABLE IF NOT EXISTS "hub_services" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "includes" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "hub_services_archived_idx" ON "hub_services" ("archived");
CREATE INDEX IF NOT EXISTS "hub_services_sort_idx" ON "hub_services" ("sort_order");
