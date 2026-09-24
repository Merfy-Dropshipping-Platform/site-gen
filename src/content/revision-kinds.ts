/**
 * Виды ревизий. Снимок документа клиента (`meta.kind = 'client-snapshot'`,
 * этап 2, «линия клиента») — служебная база слияния, а не версия магазина:
 * он никогда не текущий и не попадает туда, где ищут версии магазина
 * (история, счётчики, «последняя ревизия»).
 */
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { CLIENT_SNAPSHOT_KIND } from "./store-content.port";

/** Условие SQL: ревизия — версия магазина, не снимок клиента. */
export function isStoreVersion() {
  return sql`coalesce(${schema.siteRevision.meta}->>'kind', '') <> ${CLIENT_SNAPSHOT_KIND}`;
}
