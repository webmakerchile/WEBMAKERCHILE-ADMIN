-- Compartidos del CEO hacia el equipo (sección Agencia, modo sanitizado).
-- Fila puntual (recurso, id del panel) o global (recurso, '*').
CREATE TABLE IF NOT EXISTS "panel_visibilidad" (
	"recurso" text NOT NULL,
	"panel_id" text NOT NULL,
	"compartido" boolean DEFAULT true NOT NULL,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panel_visibilidad_recurso_panel_id_pk" PRIMARY KEY("recurso","panel_id")
);
