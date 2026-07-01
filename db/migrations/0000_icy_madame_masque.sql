-- Extensions (plan §3.6). Must precede any use of the `citext` type below.
-- `gen_random_uuid()` is built into PostgreSQL 18, so no extension is needed for it.
CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."ticket_state" AS ENUM('new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('bug', 'feature', 'fix');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_nonempty_check" CHECK (length(btrim("comments"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "epics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "epics_id_team_id_key" UNIQUE("id","team_id"),
	CONSTRAINT "epics_title_nonempty_check" CHECK (length(btrim("epics"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name"),
	CONSTRAINT "teams_name_nonempty_check" CHECK (length(btrim("teams"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"epic_id" uuid,
	"type" "ticket_type" NOT NULL,
	"state" "ticket_state" DEFAULT 'new' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_title_nonempty_check" CHECK (length(btrim("tickets"."title")) > 0),
	CONSTRAINT "tickets_body_nonempty_check" CHECK (length(btrim("tickets"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_nonempty_check" CHECK (length(btrim("users"."email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_epic_id_team_id_fkey" FOREIGN KEY ("epic_id","team_id") REFERENCES "public"."epics"("id","team_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_ticket_id_created_at_idx" ON "comments" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "epics_team_id_idx" ON "epics" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tickets_team_state_modified_idx" ON "tickets" USING btree ("team_id","state","modified_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tickets_team_id_idx" ON "tickets" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tickets_epic_id_idx" ON "tickets" USING btree ("epic_id");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_id_idx" ON "verification_tokens" USING btree ("user_id");--> statement-breakpoint
-- Trigram GIN index for case-insensitive substring search over ticket titles
-- (plan §3.5). Functional index on lower(title); drizzle-kit cannot express this,
-- so it is hand-added here and verified by the migration tests.
CREATE INDEX "tickets_title_trgm_idx" ON "tickets" USING gin (lower("title") gin_trgm_ops);