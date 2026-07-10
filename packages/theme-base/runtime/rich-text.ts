import sanitizeHtml from 'sanitize-html';

/**
 * Inline rich-text sanitizer для заголовков/подзаголовков секций.
 *
 * Конструктор (кнопки «Курсив»/«Жирный» в AITextInput) оборачивает ВСЁ поле в
 * `<em>…</em>` / `<strong>…</strong>` и сохраняет строку в ревизию. Astro по
 * умолчанию экранирует `{value}` → на витрине/превью показывались сырые теги
 * («<EM>ТЕКСТ</EM>»). Рендерим такое поле через `set:html={sanitizeInline(v)}` —
 * разрешаем ТОЛЬКО инлайн-форматирование, всё прочее (script/style, on*-хендлеры,
 * атрибуты, блочные теги) вырезается. Plain-текст проходит как есть (спецсимволы
 * экранируются sanitize-html) — поведение для обычных заголовков не меняется.
 */
const INLINE_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br'];

export function sanitizeInline(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return sanitizeHtml(value, {
    allowedTags: INLINE_TAGS,
    allowedAttributes: {},
    // script/style и их содержимое вырезаются (nonTextTags по умолчанию),
    // прочие неразрешённые теги отбрасываются, но их текст сохраняется.
    disallowedTagsMode: 'discard',
  });
}
