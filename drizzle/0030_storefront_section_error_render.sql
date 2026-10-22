-- Стадии рендера в таблице ошибок секций (блок 2 «Секций и SDK», «Решил сам» п. 8): сборщик пишет сюда секции, которые
-- упали при рендере на сервере, — render, render-timeout, render-output, render-memory, render-denied. У таких строк в
-- script_hash — хеш модуля рендера (storefront_section.render_hash). Ограничение только расширяется: прежние
-- строки ему отвечают, миграция обратно совместима и повторяется без ошибки.
ALTER TABLE "storefront_section_error" DROP CONSTRAINT IF EXISTS "storefront_section_error_stage_check";--> statement-breakpoint
ALTER TABLE "storefront_section_error" ADD CONSTRAINT "storefront_section_error_stage_check" CHECK ("stage" IN ('load', 'define', 'mount', 'unmount', 'runtime', 'render', 'render-timeout', 'render-output', 'render-memory', 'render-denied'));
