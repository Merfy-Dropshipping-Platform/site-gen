// XSS-safe inline rich-text для заголовков/подзаголовков rose-портов.
//
// Конструктор (AITextInput, кнопки «Курсив»/«Жирный») оборачивает ВСЁ поле
// инлайн-тегами: `<em>…</em>`, `<strong>…</strong>` либо вложенной парой
// `<strong><em>…</em></strong>` (жирный + курсив вместе — коммит конструктора
// f19bb5f). Astro экранирует `{value}` → на витрине/превью показывались сырые
// теги («<EM>ТЕКСТ</EM>»). Рендерим такие поля через set:html={inlineFormat(value)}.
//
// sanitize-html в rose-теме НЕТ (не вводим зависимость — Constitution VI). Поэтому
// снимаем ТОЛЬКО обёртки ВСЕГО значения разрешёнными тегами БЕЗ атрибутов (любая
// вложенность до MAX_DEPTH), а содержимое самой внутренней обёртки экранируем.
// Так сырые теги не видны, а произвольный HTML/скрипт мерчанта (stored XSS в
// адрес его же покупателей) не исполняется.
//
// ⚠️ Первая версия снимала РОВНО ОДНУ обёртку — после f19bb5f внутренний тег
// вложенной пары уезжал в escapeHtml, и «жирный + курсив вместе» показывал на
// витрине сырьё «<em>ТЕКСТ</em>» внутри жирного (баг-репорт тестера 2026-09-13).
// Тесты: src/themes/__tests__/rich-text-bold-italic.spec.ts.

/** Начертания, которые умеет ставить конструктор (+ легаси b/i/u/s). */
const WRAPPER = /^<(em|strong|b|i|u|s)>([\s\S]*)<\/\1>$/;

/** Предел вложенности: конструктору хватает 2 (жирный+курсив), запас — на легаси. */
const MAX_DEPTH = 4;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inlineFormat(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';

  const tags: string[] = [];
  let inner = value;

  // Снимаем обёртки снаружи внутрь. Backreference `\1` гарантирует, что
  // закрывающий тег совпал с открывающим, а `<tag>` без пробела перед `>` —
  // что атрибутов (в т.ч. on*-хендлеров) в теге нет.
  while (tags.length < MAX_DEPTH) {
    const m = inner.match(WRAPPER);
    if (!m) break;
    tags.push(m[1]);
    inner = m[2];
  }

  let out = escapeHtml(inner);
  for (let i = tags.length - 1; i >= 0; i--) {
    out = `<${tags[i]}>${out}</${tags[i]}>`;
  }
  return out;
}
