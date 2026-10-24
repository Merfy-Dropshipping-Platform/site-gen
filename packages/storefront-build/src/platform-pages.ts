import { placedSections, withoutHidden } from './code';
import type { BuildFile } from './client-files';
import type { BuildInputs } from './inputs';
import { platformPageStyles } from './head';
import { renderShopPage, type RenderedPage, type ShopTheme } from './page';
import { NOT_FOUND_ROUTE } from './routes';
import type { PageRender } from './sections-render';
import { NOT_FOUND_TEXT, UNAVAILABLE_TEXT, platformPageTitle } from './special-pages';

// Простые страницы платформы 404 и 502 (блок 7 «Секций и SDK», часть 7а; Р7а-5, Р7а-6): одна строка разметки, без
// скриптов и ссылок на файлы сборки — страницы работают и без рендера. Цвета — токены магазина по его правкам.

export const UNAVAILABLE_FILE = '502.html';

export interface SpecialFiles {
  files: BuildFile[]; // 404.html, 502.html — в этом порядке
  rendered: RenderedPage[]; // страница 404 темой — её бандл идёт в сборку; простая 404 — пусто
}

// Раскладка простых страниц: без отступов и переводов строки, `& < > " '` в подстановках экранированы.
const PLATFORM_PAGE_CSS =
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--background);color:var(--foreground);font-family:var(--font-body);text-align:center}main{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px}h1{margin:0;font-family:var(--font-heading);font-weight:var(--weight-heading);font-size:var(--text-3xl);line-height:var(--text-3xl--line-height);letter-spacing:var(--tracking-heading);color:var(--heading)}p{margin:0;color:var(--muted-foreground)}a{display:inline-block;padding:12px 24px;border-radius:var(--radius-button);background:var(--primary);color:var(--primary-foreground);text-decoration:none}';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeText = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const pageHtml = (title: string, styles: string, body: string): string =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>${styles}<style id="merfy-platform">${PLATFORM_PAGE_CSS}</style></head><body><main>${body}</main></body></html>`;

const fileOf = (path: string, html: string): BuildFile => ({ path, content: Buffer.from(html, 'utf8') });

const tokensOf = (inputs: BuildInputs, theme: ShopTheme): { fontsCss: string; tokensCss: string } =>
  platformPageStyles(inputs, theme.tokens, theme.migrations);

// Простая 404 платформы: шрифты и токены магазина, заголовок и кнопка «На главную», noindex.
export function notFoundHtml(inputs: BuildInputs, theme: ShopTheme): string {
  const { fontsCss, tokensCss } = tokensOf(inputs, theme);
  const styles = `<style id="merfy-fonts">${fontsCss}</style><style id="merfy-tokens">${tokensCss}</style>`;
  const body = `<h1>${NOT_FOUND_TEXT.heading}</h1><a href="/">${NOT_FOUND_TEXT.home}</a>`;
  return pageHtml(platformPageTitle(NOT_FOUND_TEXT.heading, escapeText(inputs.site.name)), styles, body);
}

// 502: только токены магазина — шрифты при сбое хранилища не придут; без ссылок и скриптов.
export function unavailableHtml(inputs: BuildInputs, theme: ShopTheme): string {
  const { tokensCss } = tokensOf(inputs, theme);
  const styles = `<style id="merfy-tokens">${tokensCss}</style>`;
  const body = `<h1>${UNAVAILABLE_TEXT.heading}</h1><p>${UNAVAILABLE_TEXT.text}</p>`;
  return pageHtml(platformPageTitle(UNAVAILABLE_TEXT.heading, escapeText(inputs.site.name)), styles, body);
}

// Файлы 404 и 502 сборки: у «Страницы 404» есть видимые секции — страницу рендерит тема, её бандл идёт в сборку.
export async function specialFiles(inputs: BuildInputs, theme: ShopTheme, page: PageRender): Promise<SpecialFiles> {
  const unavailable = fileOf(UNAVAILABLE_FILE, unavailableHtml(inputs, theme));
  const visible = placedSections(withoutHidden(inputs), NOT_FOUND_ROUTE.id);
  if (visible.length === 0)
    return { files: [fileOf(NOT_FOUND_ROUTE.file, notFoundHtml(inputs, theme)), unavailable], rendered: [] };
  const rendered = await renderShopPage(inputs, NOT_FOUND_ROUTE.path, theme, page);
  return { files: [rendered.file, unavailable], rendered: [rendered] };
}
