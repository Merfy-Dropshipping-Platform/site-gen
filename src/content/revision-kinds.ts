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
 */
import { isNull, ne, or } from "drizzle-orm";
import * as schema from "../db/schema";
import { CLIENT_SNAPSHOT_KIND } from "./store-content.port";

/** Условие SQL: ревизия — версия магазина, не снимок клиента. */
export function isStoreVersion() {
  return or(
    isNull(schema.siteRevision.kind),
    ne(schema.siteRevision.kind, CLIENT_SNAPSHOT_KIND),
  );
}
