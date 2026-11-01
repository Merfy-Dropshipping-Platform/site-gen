-- Свои сторы (SDK витрины, 01.11): вид строки реестра store — код автора без места на странице, его значение читают
-- секции и другие сторы. Приходит тем же путём, что секции и глобальные скрипты: свой стор магазина — из конструктора и
-- MCP, стор расширения — при регистрации версии. Ограничение вида расширяется, строки не меняются — миграция обратно
-- совместима и повторяется без ошибки.
ALTER TABLE storefront_section DROP CONSTRAINT IF EXISTS storefront_section_kind_check;--> statement-breakpoint
ALTER TABLE storefront_section ADD CONSTRAINT storefront_section_kind_check
  CHECK (kind IN ('section', 'global', 'store'));
