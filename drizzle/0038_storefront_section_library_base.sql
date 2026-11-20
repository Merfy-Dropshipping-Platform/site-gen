-- Основа копии библиотечной секции и отказ от обновления (20.11): улучшения библиотечных секций доходят до магазинов
-- с копией, которую изменил мерчант или агент, только предложением — «вышла новая версия, перенести правки?».
-- library_base — отпечаток версии библиотеки (generated/library-history.json), от которой пошла копия: пишет сохранение
-- секции с явной основой; без неё строка наследует основу прошлой текущей правки, а нет и её — основа считается по
-- истории библиотеки среди отпечатков строк копии. storefront_section_update_decline — версия секции, от обновления
-- до которой мерчант отказался: предложение молчит до следующей версии библиотеки. Новые столбец и таблица, прежние
-- не меняются — миграция обратно совместима и повторяется без ошибки.
ALTER TABLE storefront_section ADD COLUMN IF NOT EXISTS library_base text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS storefront_section_update_decline (
  site_id text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL,
  declined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, name)
);
