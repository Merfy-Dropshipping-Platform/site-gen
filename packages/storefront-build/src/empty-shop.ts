import type { BuildInputs } from './inputs';

// Страница магазина, на которой нет ни одной секции — ни шапки, ни своих, ни подвала, ни секций поверх (владелец
// 27.10: «по умолчанию вообще не было секций, а была заглушка „работайте через MCP“»): в <main> — подсказка для
// мерчанта, как собрать страницу через MCP. Магазин новой темы рождается пустым (sites: CreateStore без заготовки), так
// что заглушку видят холст конструктора, миниатюры превью и сама витрина. Появилась хоть одна секция — заглушки нет.
// Стили — атрибутами на переменных токенов темы: CSS секций страница печатает только при секциях (как у policy-text.ts).

// Адрес MCP по контуру. Контур — по адресу магазина или адресу API из входов сборки: на dev оба в *.dev.merfy.ru.
// Новых настроек нет: сборка не читает окружение (сторож блока 4).
export const MCP_URL = 'https://mcp.merfy.ru/mcp';
export const MCP_URL_DEV = 'https://mcp.dev.merfy.ru/mcp';
const DEV_HOST = /(^|\.)dev\.merfy\.ru$/;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function mcpUrlOf(inputs: Pick<BuildInputs, 'site' | 'env'>): string {
  const dev = [inputs.site.publicUrl, inputs.env.apiUrl].some((url) => DEV_HOST.test(hostOf(url)));
  return dev ? MCP_URL_DEV : MCP_URL;
}

// Текст заглушки: заголовок, пояснение, команда подключения (адрес подставляется), пример просьбы.
export const EMPTY_SHOP_TEXT = {
  heading: 'Здесь пока пусто',
  lead: 'Страницы магазина собирает ИИ через MCP Merfy. Подключите его в Claude Code командой:',
  example: 'и попросите, например: «Собери главную для магазина шарфов».',
} as const;

export const connectCommand = (mcpUrl: string): string => `claude mcp add --transport http merfy ${mcpUrl}`;

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeText = (text: string): string => text.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);

const OUTER = [
  'box-sizing:border-box',
  'min-height:60vh',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'padding:48px 16px',
  'font-family:var(--font-body)',
  'color:var(--foreground)',
].join(';');
const CARD = [
  'box-sizing:border-box',
  'width:100%',
  'max-width:640px',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:16px',
  'padding:32px 24px',
  'text-align:center',
  'border:1px solid color-mix(in srgb,var(--foreground) 16%,transparent)',
  'border-radius:var(--radius-card)',
].join(';');
const HEADING = [
  'margin:0',
  'font-family:var(--font-heading,var(--font-body))',
  'font-weight:var(--weight-heading)',
  'font-size:var(--text-3xl)',
  'line-height:var(--text-3xl--line-height)',
  'letter-spacing:var(--tracking-heading)',
  'color:var(--heading,var(--foreground))',
].join(';');
const TEXT = 'margin:0;font-size:var(--text-base);line-height:var(--text-base--line-height);color:var(--foreground)';
const COMMAND = [
  'box-sizing:border-box',
  'max-width:100%',
  'margin:0',
  'padding:12px 16px',
  'overflow-wrap:anywhere',
  'text-align:left',
  'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
  'font-size:var(--text-sm)',
  'background:color-mix(in srgb,var(--foreground) 7%,transparent)',
  'border-radius:var(--radius-button)',
].join(';');

export const emptyShopHtml = (mcpUrl: string): string =>
  `<div data-merfy-empty-shop style="${OUTER}"><div style="${CARD}">` +
  `<h1 style="${HEADING}">${EMPTY_SHOP_TEXT.heading}</h1>` +
  `<p style="${TEXT}">${EMPTY_SHOP_TEXT.lead}</p>` +
  `<code style="${COMMAND}">${escapeText(connectCommand(mcpUrl))}</code>` +
  `<p style="${TEXT}">${EMPTY_SHOP_TEXT.example}</p>` +
  `</div></div>`;
