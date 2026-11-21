-- Сборщик витрин: кто нажал «Опубликовать» (этап 5b, событие аудита `audit.regressed` несёт `publishedBy`, чтобы шлюз
-- написал тому, кто опубликовал, а не владельцу организации). Событие `merchant-publish` теперь может нести id
-- пользователя; сборщик держит его в строке магазина: published_by — для идущей или ждущей в очереди сборки,
-- pending_published_by — для «ещё раз» (событие пришло, пока сборка шла). NULL — публикации человеком не было
-- (правка, выпуск, системная пересборка) или автор неизвестен.
-- Новые колонки без значения по умолчанию, старые строки не меняются — миграция обратно совместима и повторяется без ошибки.
ALTER TABLE "storefront_shop" ADD COLUMN IF NOT EXISTS "published_by" text;--> statement-breakpoint
ALTER TABLE "storefront_shop" ADD COLUMN IF NOT EXISTS "pending_published_by" text;
