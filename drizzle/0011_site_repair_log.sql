CREATE TYPE "public"."repair_action" AS ENUM('rebuild_queued', 'skipped_limit', 'skipped_grace_period', 'skipped_minio_down');--> statement-breakpoint
CREATE TYPE "public"."repair_result" AS ENUM('success', 'failure', 'pending');--> statement-breakpoint
CREATE TABLE "site_repair_log" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"detected_at" timestamp NOT NULL,
	"action" "repair_action" NOT NULL,
	"site_status_code" integer,
	"health_status_code" integer,
	"build_id" text,
	"result" "repair_result",
	"resolved_at" timestamp,
	"error_message" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_repair_log_site_id" ON "site_repair_log" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_repair_log_detected_at" ON "site_repair_log" USING btree ("detected_at");
