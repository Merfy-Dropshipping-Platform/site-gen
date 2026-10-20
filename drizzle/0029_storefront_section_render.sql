-- Модуль рендера секции SDK 1 (блок 1 «Секций и SDK»): скомпилированный template.astro и отпечаток sha256 его байтов.
-- У строк до SDK 1 и у глобальных скриптов — NULL.
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS render text;
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS render_hash text;
