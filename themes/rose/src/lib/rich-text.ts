// XSS-safe inline rich-text для заголовков/подзаголовков rose-портов.
//
// Конструктор (AITextInput, кнопки «Курсив»/«Жирный») оборачивает ВСЁ поле в один
// инлайн-тег (<em>…</em> / <strong>…</strong>) либо оставляет plain-текст. Astro
// экранирует {value} → на витрине/превью показывались сырые теги («<EM>ТЕКСТ</EM>»).
// Рендерим такие поля через set:html={inlineFormat(value)}.
//
// sanitize-html в rose-теме НЕТ (не вводим зависимость — Constitution VI). Поэтому
// разрешаем ТОЛЬКО обёртку ВСЕГО значения одним allow-тегом; содержимое обёртки и
// любой другой ввод экранируем. Так сырые теги не видны, а произвольный HTML/скрипт
// мерчанта (stored XSS в адрес его же покупателей) не исполняется.
const ALLOWED = ['em', 'strong', 'b', 'i', 'u', 's'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inlineFormat(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  const m = value.match(/^<(em|strong|b|i|u|s)>([\s\S]*)<\/(em|strong|b|i|u|s)>$/);
  if (m && m[1] === m[3] && ALLOWED.includes(m[1])) {
    return `<${m[1]}>${escapeHtml(m[2])}</${m[1]}>`;
  }
  return escapeHtml(value);
}
