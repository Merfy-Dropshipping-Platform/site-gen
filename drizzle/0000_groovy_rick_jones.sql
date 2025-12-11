CREATE TYPE "public"."site_build_status" AS ENUM('queued', 'running', 'failed', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."site_deployment_status" AS ENUM('provisioning', 'deployed', 'disabled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('draft', 'published', 'frozen', 'archived');--> statement-breakpoint
CREATE TABLE "site" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"status" "site_status" DEFAULT 'draft' NOT NULL,
	"prev_status" "site_status",
	"theme" jsonb,
	"current_revision_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp,
	"frozen_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_build" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"status" "site_build_status" DEFAULT 'queued' NOT NULL,
	"artifact_url" text,
	"s3_bucket" text,
	"s3_key_prefix" text,
	"log_url" text,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "site_deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"build_id" text NOT NULL,
	"coolify_app_id" text,
	"coolify_env_id" text,
	"status" "site_deployment_status" DEFAULT 'provisioning' NOT NULL,
	"url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_domain" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token" text,
	"verification_type" text,
	"created_at" timestamp NOT NULL,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"data" jsonb,
	"meta" jsonb,
	"created_at" timestamp NOT NULL,
	"created_by" text
);
