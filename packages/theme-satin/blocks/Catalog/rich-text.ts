// XSS-safe inline rich-text для заголовков/подзаголовков satin-портов (паритет rose).
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
