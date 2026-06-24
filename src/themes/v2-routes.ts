/**
 * Фаза 2 (слайсинг): первые сегменты маршрутов, которые НЕ нарезаются на
 * секции — их страницы остаются пред-собранными (блоб в превью, verbatim-дист
 * на live). Общий список для превью-форка (preview.controller) и
 * publish-пересадки (v2-live-pages): расхождение списков = превью и live
 * по-разному решают, какая страница «сложная».
 *
 * Spec 108: единственный источник этого решения — реестр страниц
 * (`page-registry.ts`). Здесь сохранён только публичный псевдоним
 * `isV2ComplexRoute` (= `isVerbatimRoute` реестра), чтобы импортеры
 * (`v2-live-pages.ts`, `preview.controller.ts`) не ломались. Прежние локальные
 * `V2_COMPLEX_ROUTE_PREFIXES` + тело `isV2ComplexRoute` удалены — их значения
 * теперь дают `VERBATIM_PREFIXES` + verbatim-записи реестра.
 */
export { isVerbatimRoute as isV2ComplexRoute } from './page-registry';
