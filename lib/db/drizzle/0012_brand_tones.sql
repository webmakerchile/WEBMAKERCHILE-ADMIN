CREATE TABLE IF NOT EXISTS "brand_tones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"voice" text DEFAULT '' NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '' NOT NULL,
	"avoid_words" text DEFAULT '' NOT NULL,
	"examples" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_tones_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_tones" ADD CONSTRAINT "brand_tones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
