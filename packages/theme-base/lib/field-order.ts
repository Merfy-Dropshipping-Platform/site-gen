/**
 * Порядок текстовых полей секции «Изображение с текстом» (тестер 24.09: «в
 * левом сайдбаре слетели дрэг-н-дропы»). Конструктор (PR constructor #38)
 * пишет порядок перетаскивания в `props.fieldOrder: string[]` — имена полей
 * панели: `image` / `heading` / `text` / `button`.
 *
 * Помощник отдаёт порядок ТОЛЬКО текстовой колонки (заголовок/текст/кнопка) —
 * `image` не переставляется, свою сторону задаёт отдельная настройка
 * «Позиция фото» (`imagePosition`), поэтому имя `image` (и любое неизвестное
 * имя) отбрасывается вместе с остальным «мусором».
 *
 * Правило — данными, без веток под тему: известные имена из `fieldOrder` в
 * заданном порядке (без дублей), недостающие — следом в порядке `base`
 * (реестр панели: heading, text, button). Нет `fieldOrder`, пустой массив или
 * не массив → `base` как есть — ровно нынешний вид секции, порядок реестра.
 */
export const TEXT_COLUMN_FIELDS = ['heading', 'text', 'button'] as const;

export type TextColumnField = (typeof TEXT_COLUMN_FIELDS)[number];

export function orderTextFields(
  props: { fieldOrder?: unknown } | Record<string, unknown> | undefined,
  base: readonly TextColumnField[] = TEXT_COLUMN_FIELDS,
): TextColumnField[] {
  const raw = Array.isArray((props as { fieldOrder?: unknown })?.fieldOrder)
    ? ((props as { fieldOrder?: unknown[] }).fieldOrder as unknown[])
    : [];
  const seen = new Set<TextColumnField>();
  const known = raw.filter((f): f is TextColumnField => {
    const isBaseField = (base as readonly string[]).includes(f as string);
    const isNew = isBaseField && !seen.has(f as TextColumnField);
    if (isNew) seen.add(f as TextColumnField);
    return isNew;
  });
  const missing = base.filter((f) => !seen.has(f));
  return [...known, ...missing];
}
