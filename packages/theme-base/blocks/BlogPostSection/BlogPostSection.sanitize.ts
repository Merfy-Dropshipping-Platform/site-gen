import sanitizeHtml from 'sanitize-html';

/**
 * Текст записи блога — HTML из редактора кабинета. Чистится на КАЖДОМ рендере
 * (сборка витрины и превью конструктора), как тело секции «Страница»
 * (Page.sanitize.ts): скрипты, стили, обработчики, iframe и неизвестные теги
 * вырезаются. Сверх «Страницы» разрешены картинки (http/https) и h4 — их
 * вставляет редактор записи.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'a', 'blockquote', 'img', 'figure', 'figcaption',
];

export function sanitizePublicationContent(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
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
      img: (_tagName, attribs) => ({
        tagName: 'img',
        attribs: {
          ...(typeof attribs.src === 'string' ? { src: attribs.src } : {}),
          alt: typeof attribs.alt === 'string' ? attribs.alt : '',
          loading: 'lazy',
        },
      }),
    },
  });
}
