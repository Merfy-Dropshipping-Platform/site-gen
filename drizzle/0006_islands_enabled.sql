CREATE TABLE "site_product" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"compare_at_price" integer,
	"images" jsonb DEFAULT '[]'::jsonb,
	"slug" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "islands_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_build" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "site_build" ADD COLUMN "percent" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "site_build" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "site_build" ADD COLUMN "retry_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "site_build" ADD COLUMN "started_at" timestamp;