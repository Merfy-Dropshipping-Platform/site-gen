CREATE TYPE "public"."policy_type" AS ENUM('refund', 'privacy', 'tos', 'shipping');--> statement-breakpoint
CREATE TABLE "site_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "site_contacts_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "site_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"type" "policy_type" NOT NULL,
	"content" text DEFAULT '',
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
