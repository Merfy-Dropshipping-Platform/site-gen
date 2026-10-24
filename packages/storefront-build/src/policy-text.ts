import type { PolicyRecord } from './records';

// Страница политики, пока в шаблоне «Политика» нет видимых секций (блок 8 «Секций и SDK», В8-1 А, решено 21.10): в
// <main> — заголовок и текст политики от платформы, разметка — как у «Страницы» без настроек (fixtures/shop/page).
// Стили — атрибутами на переменных токенов темы: CSS секций страница печатает только при секциях. Текст уже HTML:
// policyTextToHtml экранировал текст мерчанта (records.ts).
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeText = (text: string): string => text.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);

const BOX = [
  'box-sizing:border-box',
  'max-width:var(--width-page)',
  'margin:0 auto',
  'padding:0 16px',
  'display:flex',
  'flex-direction:column',
  'gap:16px',
  'font-family:var(--font-body)',
].join(';');
const HEADING = [
  'margin:0',
  'font-family:var(--font-heading)',
  'font-weight:var(--weight-heading)',
  'font-size:var(--text-3xl)',
  'line-height:var(--text-3xl--line-height)',
  'letter-spacing:var(--tracking-heading)',
  'color:var(--heading)',
].join(';');
const TEXT = 'color:var(--foreground)';

export const policyTextHtml = (record: PolicyRecord): string =>
  `<div data-merfy-policy style="${BOX}"><h1 style="${HEADING}">${escapeText(record.title)}</h1><div style="${TEXT}">${record.html}</div></div>`;
