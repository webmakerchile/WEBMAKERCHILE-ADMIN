CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"cover_prompt" text,
	"cover_image_base64" text,
	"cover_mime_type" text,
	"video_file_drive_id" text,
	"video_file_name" text,
	"drive_file_id" text,
	"drive_folder_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"month" text,
	"week" text,
	"day" text,
	"video_number" text,
	"schedule_hour" text,
	"tiktok_description" text,
	"instagram_description" text,
	"youtube_title" text,
	"youtube_description" text,
	"linkedin_description" text,
	"x_description" text,
	"tiktok_publish_id" text,
	"tiktok_status" text DEFAULT 'pending',
	"instagram_media_id" text,
	"instagram_status" text DEFAULT 'pending',
	"youtube_video_id" text,
	"youtube_status" text DEFAULT 'pending',
	"linkedin_post_id" text,
	"linkedin_status" text DEFAULT 'pending',
	"linkedin_error" text,
	"x_post_id" text,
	"x_status" text DEFAULT 'pending',
	"x_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"guion" text NOT NULL,
	"descripcion" text,
	"category" text DEFAULT 'corto-viral' NOT NULL,
	"plataforma" text DEFAULT 'TikTok' NOT NULL,
	"duracion_sugerida" text,
	"tendencia" text,
	"hashtags" jsonb,
	"in_studio" integer DEFAULT 0 NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"batch_date" text,
	"cover_image_url" text,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"google_access_token" text,
	"google_refresh_token" text,
	"tiktok_open_id" text,
	"tiktok_access_token" text,
	"tiktok_refresh_token" text,
	"tiktok_token_expires_at" timestamp,
	"linkedin_person_urn" text,
	"linkedin_org_urn" text,
	"linkedin_access_token" text,
	"linkedin_refresh_token" text,
	"linkedin_token_expires_at" timestamp,
	"linkedin_name" text,
	"linkedin_picture" text,
	"x_user_id" text,
	"x_username" text,
	"x_access_token" text,
	"x_refresh_token" text,
	"x_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "community_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"topic" text NOT NULL,
	"data" jsonb NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;