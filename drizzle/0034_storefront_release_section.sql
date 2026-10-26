-- Выпуск нашей секции волнами (блок 15 «Секций и SDK», часть 15з): вид выпуска section — новая версия нашей секции во
-- всех магазинах с её копией (команда theme-release section). Ограничение вида расширяется, строки не меняются —
-- миграция обратно совместима и повторяется без ошибки.
ALTER TABLE storefront_release DROP CONSTRAINT IF EXISTS storefront_release_kind_check;--> statement-breakpoint
ALTER TABLE storefront_release ADD CONSTRAINT storefront_release_kind_check
  CHECK (kind IN ('theme', 'platform', 'extension', 'section'));
