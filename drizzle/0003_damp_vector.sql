CREATE TABLE "tenant_project" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"coolify_project_uuid" text NOT NULL,
	"coolify_project_name" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "tenant_project_tenant_id_unique" UNIQUE("tenant_id")
);
