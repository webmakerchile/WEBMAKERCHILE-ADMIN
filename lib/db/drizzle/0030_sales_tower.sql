-- Torre de control de Ventas: comisión por ejecutivo, dedupe de alertas y configuración.
ALTER TABLE "employee_profiles" ADD COLUMN IF NOT EXISTS "commission_pct" real NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_alerts" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "contract_ref" text NOT NULL,
  "marker" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_alerts_dedupe" ON "sales_alerts" ("kind", "contract_ref", "marker");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "renewal_alert_days" integer NOT NULL DEFAULT 30,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
