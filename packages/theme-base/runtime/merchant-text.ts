/**
 * Текст мерчанта в секции: «стёрто» и «не задано» — разные состояния.
 *
 * Поле панели пришло строкой (в т.ч. пустой — мерчант стёр) → рисуем её, пустая
 * значит «элемента нет». Поле не пришло вовсе (старая ревизия) → заглушка темы
 * или легаси-поле. Раньше порты писали `x?.trim() || "Заглушка"`, и стёртый
 * заголовок возвращался текстом темы (владелец 26.09, bloom «Коллекция товаров»).
 * Сторож: src/themes/__tests__/cleared-text-stays-empty.spec.ts.
 */

/** Строка из поля панели: `"…"`, `{ text }` или `{ content }`; иначе undefined. */
export function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const { text, content } = value as { text?: unknown; content?: unknown };
  if (typeof text === "string") return text;
  return typeof content === "string" ? content : undefined;
}

/** Текст поля, а заглушка — только если поле не задано вовсе. */
export function pickText(value: unknown, fallback: string): string {
  return textOf(value) ?? fallback;
}

/** Есть что рисовать: непустая строка после обрезки пробелов. */
export function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
