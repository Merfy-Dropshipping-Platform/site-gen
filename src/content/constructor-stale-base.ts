import { isNewThemeId } from "./new-theme-pages";
import type { WriteActor } from "./store-content.port";
import type { MergePolicy } from "./operations";

/**
 * Как сохранение из конструктора и MCP обходится с устаревшей базой. Решает
 * sites по теме магазина (решение 8 спеки MCP: проверки и запись — в sites):
 *   тема из списка новых тем (`isNewThemeId`, сейчас nova) — всегда merge, флаг
 *   от шлюза не нужен;
 *   остальные темы — merge только при `mergeOnStale: true` (шлюз ставит его
 *   аккаунтам из NEW_LOGIC_EMAILS), иначе cas.
 *
 *   merge — этап 2: id, который видел клиент, — база записи; устарела —
 *           слияние; одно и то же поле — по политике автора записи
 *           (`MERGE_POLICY_BY_ACTOR`);
 *   cas   — как до этапа 2: жёсткий CAS по тому же id, устарела —
 *           REVISION_CONFLICT (шлюз отдаёт 409).
 */

/**
 * Политика слияния по автору записи. Мерчант (конструктор): побеждает
 * последний, как в Figma. Агент: значение мерчанта остаётся, спорное место
 * уходит в `conflicts` (этап 3 спеки «Запись Визи в черновик nova»).
 */
export const MERGE_POLICY_BY_ACTOR: Record<WriteActor, MergePolicy> = {
  merchant: "last-writer-wins",
  system: "last-writer-wins",
  agent: "keep-current",
};

const CONSTRUCTOR_STALE_BASE = {
  merge: (seen: string | null | undefined, actor: WriteActor) => ({
    base: seen,
    mergePolicy: MERGE_POLICY_BY_ACTOR[actor],
  }),
  cas: (seen: string | null | undefined) => ({
    expectedCurrentRevisionId: seen,
  }),
};

export function constructorStaleBase(
  themeId: string | null | undefined,
  mergeOnStale: boolean,
  seen: string | null | undefined,
  actor: WriteActor = "merchant",
) {
  const merge = mergeOnStale || isNewThemeId(themeId);
  return merge
    ? CONSTRUCTOR_STALE_BASE.merge(seen, actor)
    : CONSTRUCTOR_STALE_BASE.cas(seen);
}
