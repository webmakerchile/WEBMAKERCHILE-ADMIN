CREATE TABLE IF NOT EXISTS "publish_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "video_id" integer NOT NULL,
  "platform" text NOT NULL,
  "attempt_number" integer NOT NULL,
  "outcome" text NOT NULL,
  "error_kind" text,
  "error_message" text,
  "next_retry_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_video_id_videos_id_fk"
    FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "publish_attempts_video_created_idx" ON "publish_attempts" ("video_id","created_at");
