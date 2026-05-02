-- Collaboration: comments, reviews, workflow status and team role.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_role" text DEFAULT 'editor' NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "workflow_status" text DEFAULT 'borrador' NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "comments" (
    "id" serial PRIMARY KEY NOT NULL,
    "video_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "body" text NOT NULL,
    "mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_video_created_idx" ON "comments" ("video_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reviews" (
    "id" serial PRIMARY KEY NOT NULL,
    "video_id" integer NOT NULL,
    "requested_by" integer NOT NULL,
    "assigned_to" integer NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "message" text,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_assigned_status_idx" ON "reviews" ("assigned_to", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_video_idx" ON "reviews" ("video_id");
--> statement-breakpoint

-- Promote the lowest-id (first) user to reviewer so the team always has at
-- least one approver after the migration.
UPDATE "users" SET "team_role" = 'reviewer'
WHERE "id" = (SELECT MIN("id") FROM "users");
