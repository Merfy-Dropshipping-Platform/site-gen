// XSS-safe инлайн-разметка для полей конструктора (заголовки, подзаголовки,
// тексты секций).
//
// Конструктор (AITextInput, кнопки «Жирный»/«Курсив») оборачивает значение поля
// инлайн-тегами: <strong>…</strong>, <em>…</em> или оба сразу —
// <strong><em>…</em></strong>. Astro экранирует {value}, поэтому без этого
// хелпера на витрине и в превью видны сырые теги («<strong>ТЕКСТ</strong>»).
// Рендерить такие поля через set:html={inlineFormat(value)}.
//
// sanitize-html в темах НЕТ (не вводим зависимость — Constitution VI). Поэтому
// разбираем строку сами: пропускаем ТОЛЬКО голые теги из белого списка с
// правильной вложенностью, всё остальное — включая атрибуты, чужие теги и
// незакрытые пары — экранируем. Так сырые теги не видны, а произвольный
// HTML/скрипт мерчанта (stored XSS в адрес его же покупателей) не исполняется.
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
  if (!value.includes('<')) return escapeHtml(value);

  const out: string[] = [];
  const open: string[] = [];
  let text = '';
  let i = 0;
  const flush = () => {
    if (text) {
      out.push(escapeHtml(text));
      text = '';
    }
  };

  while (i < value.length) {
    const lt = value.indexOf('<', i);
    if (lt === -1) {
      text += value.slice(i);
      break;
    }
    text += value.slice(i, lt);
    const gt = value.indexOf('>', lt);
    if (gt === -1) {
      text += value.slice(lt);
      break;
    }
    const raw = value.slice(lt + 1, gt).trim();
    const closing = raw.startsWith('/');
    const name = (closing ? raw.slice(1) : raw).trim().toLowerCase();
    if (!ALLOWED.includes(name)) {
      // Чужой тег или тег с атрибутами — показываем как текст.
      text += value.slice(lt, gt + 1);
      i = gt + 1;
      continue;
    }
    if (closing) {
      // Ломаная вложенность — не гадаем, экранируем значение целиком.
      if (open[open.length - 1] !== name) return escapeHtml(value);
      open.pop();
      flush();
      out.push(`</${name}>`);
    } else {
      flush();
      open.push(name);
      out.push(`<${name}>`);
    }
    i = gt + 1;
  }
  flush();
  if (open.length > 0) return escapeHtml(value);
  return out.join('');
}
