CREATE TABLE "site_theme_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"from_theme" text NOT NULL,
	"from_version" text NOT NULL,
	"to_theme" text NOT NULL,
	"to_version" text NOT NULL,
	"report" jsonb NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "theme_version" text;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "needs_rebuild" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_theme_migrations" ADD CONSTRAINT "site_theme_migrations_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_site_theme_migrations_site_id" ON "site_theme_migrations" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "idx_site_theme_migrations_timestamp" ON "site_theme_migrations" USING btree ("timestamp");
