-- Сборщик витрин: предел выпуска (merfy-mcp/docs/plans/storefront-shell/06-builder-queue/design.md, В6-2 В). Новое
-- состояние строки магазина held — событие выпуска темы ждёт места: в работе уже K выпусков. Строки и данные не
-- меняются, старое ограничение заменяется более широким — миграция обратно совместима.
ALTER TABLE "storefront_shop" DROP CONSTRAINT IF EXISTS "storefront_shop_state_check";--> statement-breakpoint
ALTER TABLE "storefront_shop" ADD CONSTRAINT "storefront_shop_state_check"
  CHECK ("state" IN ('idle', 'busy', 'retrying', 'stopped', 'held'));
