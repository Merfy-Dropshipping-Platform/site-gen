/**
 * Виды ревизий. Снимок документа клиента (`kind = 'client-snapshot'`,
 * этап 2, «линия клиента») — служебная база слияния, а не версия магазина:
 * он никогда не текущий и не попадает туда, где ищут версии магазина
 * (история, счётчики, «последняя ревизия»). Карта модуля — `README.md`.
 *
 * R3 (миграция `drizzle/0020_revision_kind_and_history_index.sql`): условие
 * читает колонку `kind`, а не `meta->>'kind'` — так индекс истории
 * (`idx_site_revision_site_id_created_at`) не заслоняет вычисление по jsonb.
 * `DocumentAdapter.commit()` продолжает писать обе копии (совместимость на
 * время выкатки, см. README «Долг»).
 *
 * На время выкатки миграции 0020
 * рядом со старым контейнером (rolling deploy) старый код пишет снимки с
 * `meta.kind = 'client-snapshot'`, но колонку `kind` не знает — она осталась
 * бы NULL, и новый код по чистой колонке принял бы такой снимок за версию
 * магазина. `coalesce(kind, meta->>'kind', '')` — колонка в приоритете (её
 * пишут ОБА кода, новый и после выкатки старый перестаёт существовать), а
 * `meta->>'kind'` — запасной для строк, написанных ДО того, как новый код
 * появился на всех инстансах. Индекс `idx_site_revision_site_id_created_at`
 * (по `site_id, created_at`) это условие не использует и не ломает — оно
 * применяется как фильтр НАД уже узкой выборкой по индексу.
 */
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { CLIENT_SNAPSHOT_KIND } from "./store-content.port";

/** Условие SQL: ревизия — версия магазина, не снимок клиента. */
export function isStoreVersion() {
  return sql`coalesce(${schema.siteRevision.kind}, ${schema.siteRevision.meta}->>'kind', '') <> ${CLIENT_SNAPSHOT_KIND}`;
}
