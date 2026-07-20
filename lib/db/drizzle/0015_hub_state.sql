CREATE TABLE IF NOT EXISTS "hub_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_state_user_id_unique" UNIQUE("user_id")
);
