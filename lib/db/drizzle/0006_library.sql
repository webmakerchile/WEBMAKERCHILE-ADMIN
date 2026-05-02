-- Incremental, idempotent migration for Templates, Hashtag Groups, Campaigns
-- and the related foreign keys on `videos`.

CREATE TABLE IF NOT EXISTS "templates" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "fields" jsonb NOT NULL,
    "networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_user_idx" ON "templates" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hashtag_groups" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" text NOT NULL,
    "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hashtag_groups" ADD CONSTRAINT "hashtag_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hashtag_groups_user_idx" ON "hashtag_groups" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "color" text DEFAULT '#f97316' NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_user_idx" ON "campaigns" ("user_id");
--> statement-breakpoint

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "campaign_id" integer;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "template_id" integer;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "videos_campaign_idx" ON "videos" ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_template_idx" ON "videos" ("template_id");
