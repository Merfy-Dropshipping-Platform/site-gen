-- Этап 3 (merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И3):
-- состояние рождения магазина — сага reserved → seeded → provisioned → ready (+ failed).
-- Аддитивно и без backfill: у существующих магазинов колонки остаются NULL,
-- их по-прежнему обслуживают старые cron; доводчик саги берёт только строки
-- с непустым lifecycle (магазины, рождённые командой CreateStore).
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "lifecycle" text;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "lifecycle_error" text;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "lifecycle_attempts" integer;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "lifecycle_next_at" timestamp with time zone;--> statement-breakpoint
-- Выборка доводчика: только строки саги, которые ещё не готовы. Частичный индекс
-- пуст у всех существующих магазинов (lifecycle IS NULL) — строится мгновенно.
CREATE INDEX IF NOT EXISTS "idx_site_lifecycle_next_at" ON "site" ("lifecycle_next_at") WHERE "lifecycle" IS NOT NULL AND "lifecycle" <> 'ready' AND "deleted_at" IS NULL;
