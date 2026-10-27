import { isNewThemeId } from "./new-theme-pages";

/**
 * Как сохранение из конструктора и MCP обходится с устаревшей базой. Решает
 * sites по теме магазина (решение 8 спеки MCP: проверки и запись — в sites):
 *   тема из списка новых тем (`isNewThemeId`, сейчас nova) — всегда merge, флаг
 *   от шлюза не нужен;
 *   остальные темы — merge только при `mergeOnStale: true` (шлюз ставит его
 *   аккаунтам из NEW_LOGIC_EMAILS), иначе cas.
 *
 *   merge — этап 2: id, который видел клиент, — база записи; устарела —
 *           слияние, одно и то же поле — побеждает последний (как в Figma);
 *   cas   — как до этапа 2: жёсткий CAS по тому же id, устарела —
 *           REVISION_CONFLICT (шлюз отдаёт 409).
 */
const CONSTRUCTOR_STALE_BASE = {
  merge: (seen: string | null | undefined) => ({
    base: seen,
    mergePolicy: "last-writer-wins" as const,
  }),
  cas: (seen: string | null | undefined) => ({
    expectedCurrentRevisionId: seen,
  }),
};

export function constructorStaleBase(
  themeId: string | null | undefined,
  mergeOnStale: boolean,
  seen: string | null | undefined,
) {
  const merge = mergeOnStale || isNewThemeId(themeId);
  return CONSTRUCTOR_STALE_BASE[merge ? "merge" : "cas"](seen);
}
