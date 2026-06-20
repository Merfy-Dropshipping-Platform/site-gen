import { sanitizePageContent } from '../Page.sanitize';

describe('sanitizePageContent (Page WYSIWYG render-side XSS gate)', () => {
  it('strips <script> tags and their content', () => {
    const out = sanitizePageContent('<p>ok</p><script>alert(1)</script>');
    expect(out).toContain('<p>ok</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips event handlers and disallowed tags (img/onerror, iframe, style)', () => {
    const out = sanitizePageContent(
      '<img src=x onerror="alert(1)"><iframe src="evil"></iframe><style>x{}</style><p onclick="x()">t</p>',
    );
    expect(out).not.toMatch(/onerror|onclick|<img|<iframe|<style/i);
    expect(out).toContain('<p>t</p>'); // handler stripped, tag kept
  });

  it('drops javascript: and data: hrefs but keeps http/https/mailto/relative', () => {
    expect(sanitizePageContent('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizePageContent('<a href="https://merfy.ru">x</a>')).toContain('href="https://merfy.ru"');
    expect(sanitizePageContent('<a href="/about">x</a>')).toContain('href="/about"');
    expect(sanitizePageContent('<a href="mailto:a@b.ru">x</a>')).toContain('mailto:a@b.ru');
  });

  it('keeps the allowed formatting set (h2/h3, strong/em, ul/ol/li, blockquote)', () => {
    const html =
      '<h2>Title</h2><h3>Sub</h3><p><strong>b</strong> <em>i</em></p><ul><li>a</li></ul><ol><li>1</li></ol><blockquote>q</blockquote>';
    expect(sanitizePageContent(html)).toBe(html);
  });

  it('strips class/id/inline style attributes', () => {
    const out = sanitizePageContent('<p class="x" id="y" style="color:red">t</p>');
    expect(out).toBe('<p>t</p>');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(sanitizePageContent('')).toBe('');
  });

  it('adds rel=noopener noreferrer when target=_blank', () => {
    const out = sanitizePageContent('<a href="https://x.ru" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
