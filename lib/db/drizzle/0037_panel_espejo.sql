CREATE TABLE IF NOT EXISTS "panel_espejo" (
	"recurso" text NOT NULL,
	"id" text NOT NULL,
	"datos" jsonb NOT NULL,
	"actualizado_en" timestamp with time zone,
	"sincronizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panel_espejo_recurso_id_pk" PRIMARY KEY("recurso","id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_espejo_recurso_fecha_idx" ON "panel_espejo" ("recurso","actualizado_en");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "panel_sync_estado" (
	"id" integer PRIMARY KEY NOT NULL,
	"cursor" text,
	"ultima_corrida" timestamp with time zone,
	"ultimo_exito" timestamp with time zone,
	"ultimo_error" text,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL
);
