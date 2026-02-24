-- Site domain history: tracks domain changes for each site
CREATE TABLE IF NOT EXISTS "site_domain_history" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "domain_name" text NOT NULL,
  "domain_id" text,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "attached_at" timestamp NOT NULL,
  "detached_at" timestamp
);
