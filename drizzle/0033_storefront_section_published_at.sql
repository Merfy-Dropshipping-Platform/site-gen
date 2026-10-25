-- Когда правка своей секции магазина последний раз встала на витрину (блок 12 «Секций и SDK», часть 12в; design.md
-- блока 12, В12-1 А): по нему откат секции с ролью находит прежнюю опубликованную правку. Пишут публикация магазина
-- (publishDrafts) и откат; у правки, снятой откатом из-за ошибок, — NULL: сама она на витрину не вернётся. Строкам,
-- которые сейчас на витрине, — время приёма: точного времени публикации до этой миграции нет. rolled_back_at — когда
-- правку сняли откатом (не больше одного отката на магазин и роль за сутки); rollback_notice_at — когда мерчант получил
-- запись «отката нет: уже откатывали» (не чаще раза в сутки). Новые столбцы, старые не меняются — миграция обратно
-- совместима и повторяется без ошибки.
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS published_at timestamptz;--> statement-breakpoint
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;--> statement-breakpoint
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS rollback_notice_at timestamptz;--> statement-breakpoint
UPDATE storefront_section SET published_at = created_at WHERE published AND published_at IS NULL;
