/**
 * Значение цветовой схемы → суффикс класса `.color-scheme-N`.
 *
 * Панель конструктора пишет строку "scheme-N", но живая нормализация ревизии
 * (`adaptLegacyProps` → `coerceGenericLegacyProps`,
 * src/themes/page-blocks.ts:349-357) переводит `colorScheme`,
 * `containerColorScheme` и `copyrightColorScheme` в ЧИСЛО N. Порты, сверявшие
 * `typeof value === "string"`, печатали класс на сыром рендере и ТЕРЯЛИ его на
 * живом пути — витрине и точечном hot-render конструктора
 * (POST /preview/block). Отсюда «цветовая схема не применяется» в мультирядах,
 * сворачиваемом разделе и подвале (замечания тестировщика 2026-09-13, п.2/5/9).
 *
 * Нормализация ровно та же, что у `schemeIdFromProp` в
 * src/themes/v2-page-composer.ts, которая вешает схему СЕКЦИИ на живой
 * странице. Пустая строка означает «схема не выбрана» — вызывающий не печатает
 * класс вовсе, и блок наследует схему секции (`:root`).
 */
export function schemeIdOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value) return value.replace(/^scheme-/, "");
  return "";
}
