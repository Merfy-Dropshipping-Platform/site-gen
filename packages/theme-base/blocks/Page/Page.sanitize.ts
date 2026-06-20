import sanitizeHtml from 'sanitize-html';

/**
 * Render-side allowlist sanitizer for the «Страница» block body (Constitution II,
 * P0 — authoritative XSS gate). Merchant-authored HTML is sanitized on every
 * render (build + constructor preview), independent of input-side sanitize.
 *
 * Allowed: text formatting (bold/italic/underline/strike), H2/H3, lists,
 * links, blockquote. Everything else (script/style/iframe, on* handlers,
 * class/id/inline style, unknown tags/attrs) is stripped.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'a', 'blockquote',
];

export function sanitizePageContent(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    // http/https/mailto/tel + relative (`/about`) hrefs; no javascript:, data:.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      // Harden links: drop any handlers, force safe rel when target is set.
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
  });
}
