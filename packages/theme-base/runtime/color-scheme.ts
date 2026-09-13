/**
 * Значение «Цветовой схемы» → суффикс класса `.color-scheme-N`.
 *
 * Одно и то же значение приезжает тремя видами: панель конструктора шлёт
 * "scheme-2" или голую "1" (разные контролы), а живая нормализация ревизии
 * (`coerceGenericLegacyProps`, sites/src/themes/page-blocks.ts) переводит это в
 * ЧИСЛО. Блоки, сверявшие `typeof colorScheme === 'string'`, печатали класс на
 * сыром рендере и ТЕРЯЛИ его на живом пути. Отсюда п.4 третьего круга: мерчант
 * выбирал схему у «Сводки заказа», и класс `color-scheme-N` с секции ИСЧЕЗАЛ
 * (замер прода 2026-09-13, все пять тем).
 *
 * Зеркало `schemeIdOf` из `themes/<t>/src/lib/color-scheme.ts` — там он для
 * порт-секций, здесь для общих блоков theme-base.
 */
export function schemeIdOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value) return value.replace(/^scheme-/, '');
  return '';
}

/** Готовый класс схемы или пустая строка (класс не печатаем вовсе). */
export function schemeClassOf(value: unknown): string {
  const id = schemeIdOf(value);
  return id ? `color-scheme-${id}` : '';
}
