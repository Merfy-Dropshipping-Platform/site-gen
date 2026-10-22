import sanitizeHtml from 'sanitize-html';

// Очистка значения richtext (блок 1 «Секций и SDK», часть 3, п. 4, Р52). Значение может записать не только
// конструктор, но и ИИ или запрос к API, а шаблон вставляет его через set:html без экранирования, поэтому HTML
// очищается в процессе сборщика при сведении значений (settings.ts). Список — как у «Страницы» пяти тем на проде
// (packages/theme-base/blocks/Page/Page.sanitize.ts): абзацы, заголовки h2–h3, выделение, списки, цитата и ссылка; у
// ссылки — только http(s), mailto, tel и адрес сайта, target="_blank" — с rel="noopener noreferrer". Остальное (script,
// style, iframe, обработчики on*, class, style, javascript:, data:) убирается.
const ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote'];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => {
      const out: Record<string, string> = {};
      if (typeof attribs.href === 'string') out.href = attribs.href;
      if (attribs.target === '_blank') {
        out.target = '_blank';
        out.rel = 'noopener noreferrer';
      }
      return { tagName: 'a', attribs: out };
    },
  },
};

export const cleanRichtext = (html: string): string => sanitizeHtml(html, OPTIONS);
