CREATE TABLE IF NOT EXISTS "contract_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_ref" text NOT NULL,
	"fecha" text NOT NULL,
	"monto" integer NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_payments_ref_idx" ON "contract_payments" ("contract_ref");