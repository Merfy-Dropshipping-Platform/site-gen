/**
 * Server-side revision migrations — R4: таблица шагов вместо лестницы `if`.
 *
 * Applied at read time (getRevision, build pipeline) so legacy revision
 * shapes converge to the current canonical structure without backfills.
 *
 * All migrations MUST be idempotent — running twice produces identical
 * output. New shapes must be detected by feature presence (e.g. "has Catalog
 * block in page-catalog content"), not by version number.
 *
 * Тема — это данные её пакета `packages/theme-<t>`, а не код: любое
 * поведение, зависящее от того, ЧТО умеет тема (какие страницы у неё есть,
 * какие блоки зарегистрированы), решается по МАНИФЕСТУ темы
 * (`getThemeManifest`), а не литералом `themeId === 'vanilla'`/`'bloom'`/…
 * Сторож: `src/utils/__tests__/no-theme-branches-in-migrations.spec.ts`.
 *
 * Публичная сигнатура и поведение НЕ изменились относительно лестницы (R4 —
 * `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`): те же шаги в том же
 * порядке на тех же входах дают тот же результат — золотые документы,
 * су��ествующие тесты миграций и снапшоты не менялись. Шаги — данные
 * (`format/steps/table.ts`), их реализации — маленькие файлы
 * (`format/steps/*.ts`), проверка порядка — `validateStepOrder()`.
 */
import { MIGRATION_STEPS, validateStepOrder, type MigrationCtx } from './steps/table';

// Саботаж (переставить два шага с `after` местами) должен падать на загрузке
// модуля, а не тихо менять поведение в проде — см. `steps/__tests__/table.spec.ts`.
validateStepOrder(MIGRATION_STEPS);

export function migrateRevisionData(
  data: Record<string, unknown> | null | undefined,
  themeId?: string | null,
  /** Название магазина из админки — подставляется в подвал вместо имени темы. */
  siteName?: string | null,
  /**
   * Пункт 3б: подвал = подвал главной ({@link import('./steps/chrome-unify').unifyFooterWithHome}).
   * Решает вызывающий по выключателю PARITY_FOOTER (знает siteId).
   */
  options: { unifyFooter?: boolean } = {},
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  let doc: Record<string, unknown> = { ...data };
  const ctx: MigrationCtx = {
    themeId,
    siteName,
    unifyFooter: Boolean(options.unifyFooter),
  };
  for (const step of MIGRATION_STEPS) {
    if (step.when && !step.when(ctx)) continue;
    if (step.scope === 'pagesData') {
      // Тот же гард, что был у каждого блока лестницы.
      if (doc.pagesData && typeof doc.pagesData === 'object') {
        doc.pagesData = step.run(doc.pagesData as Record<string, unknown>, ctx);
      }
      continue;
    }
    // scope: 'document' — шаг возвращает ПОЛНЫЙ документ (как
    // `withProfile = seedProfilePage(withCheckoutResult)` в лестнице) —
    // присваиваем результат целиком, не мержим поля.
    doc = step.run(doc, ctx);
  }
  return doc;
}
