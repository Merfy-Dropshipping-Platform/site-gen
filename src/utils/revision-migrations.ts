/**
 * Server-side revision migrations — фасад (R4).
 *
 * Реализация переехала в `src/content/format/` (таблица шагов вместо
 * лестницы `if` — `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`).
 * Этот файл остался на старом пути и с тем же публичным составом экспортов
 * ЦЕЛЕНАПРАВЛЕННО: `migrateRevisionData`/`unifyHeaderWithHome`/
 * `storeChromeOnCheckoutResult`/`unifyFooterWithHome`/`GALLERY_CANON_ITEMS`
 * импортируют ~45 файлов (`document.adapter.ts`, `canon-reference.ts`,
 * `revision-write-filter.ts`, тесты тем и утилит) — переносить все точки
 * импорта ради переезда файла не было смысла. Новый код читать в
 * `content/format/run.ts` (сама функция) и `content/format/steps/table.ts`
 * (таблица шагов + порядок).
 */
export { migrateRevisionData } from '../content/format/run';
export {
  storeChromeOnCheckoutResult,
  unifyFooterWithHome,
  unifyHeaderWithHome,
} from '../content/format/steps/chrome-unify';
export { GALLERY_CANON_ITEMS } from '../content/format/steps/multirows-gallery';
