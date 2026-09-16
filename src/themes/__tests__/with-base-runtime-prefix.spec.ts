/**
 * Баг-репорт владельца (16.09, п.3): «иконка корзины на странице Корзина
 * сломалась». Root cause: `themes/<тема>/src/lib/with-base.ts` — идентичная
 * копия в rose/vanilla/bloom/satin/flux — читает `import.meta.env.BASE_URL`,
 * Astro-константу, ЗАПЕЧЁННУЮ В БАНДЛ на `build:theme-preview` (значение "/",
 * не "/__theme/<тема>/"). Витрину это не задевает: сайт владеет своим корнем.
 * НО `cart-thumb-html.ts` (строка корзины страницы /cart — превью, миниатюра,
 * кнопка «Удалить», +/−) зовёт `withBase()` из КЛИЕНТСКОГО скрипта, который
 * собирает `<img src>` В БРАУЗЕРЕ при каждой отрисовке позиции — то есть УЖЕ
 * ПОСЛЕ того, как серверный rewriteHtmlAssets/rewriteRootUrlsToPrefix (он
 * переписывает статичный HTML ответа `/icons/*` → `/__theme/<тема>/icons/*`)
 * отработал. Запечённый BASE_URL остаётся "/" → `<img src="/icons/menu-
 * close.svg">` 404 в iframe превью конструктора (сайт превью не владеет
 * корнем "/", там только `/__theme/<тема>/icons/*`, `/placeholders/*`, API).
 *
 * Живой репро (curl, локальный sites :3114, siteId темы flux, 16.09):
 *   GET /api/sites/<id>/preview?page=cart → в скомпилированном инлайн-скрипте
 *   `const raw = "/" ?? "/";` (BASE_URL запечён как "/") → withBase("/icons/
 *   menu-close.svg") === "/icons/menu-close.svg" — БЕЗ префикса /__theme/flux.
 *
 * ФИКС (без правки Astro-сборки, дублировать в пяти файлах уже поздно):
 * `withBase()` сначала читает РАНТАЙМ-глобал `window.__MERFY_ASSET_BASE__` —
 * его инжектит `preview.controller.injectPreviewGlobals` ТОЛЬКО в превью
 * (`/__theme/<тема>`), и только если он есть/непуст. Витрина глобал не
 * получает → падает на прежний запечённый BASE_URL, поведение не меняется.
 *
 * Этот файл — гард ПОВЕДЕНИЯ (исполняет функцию, не считает текст исходника):
 * извлекает тело `withBase` дословно из каждого из пяти `with-base.ts`,
 * прогоняет через `new Function` с управляемым window/BASE_URL и проверяет
 * оба режима (превью и витрина) на всех пяти темах разом.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

/**
 * Извлекает тело функции `withBase` из исходника, подменяет
 * `import.meta.env.BASE_URL` (невалидный синтаксис вне ES-модуля) на параметр
 * `__BASE_URL__`, и собирает вызываемую функцию через `new Function` — тот же
 * приём, что `checkout-submit-contrast.spec.ts` использует для
 * CHECKOUT_BUTTON_CONTRAST_SOURCE.
 */
function extractBody(theme: string): string {
  const src = readFileSync(
    resolve(SITES_ROOT, 'themes', theme, 'src', 'lib', 'with-base.ts'),
    'utf-8',
  );
  const m = /export function withBase\(absolutePath: string\): string \{([\s\S]*?)\n\}/.exec(src);
  if (!m) throw new Error(`withBase не найден в themes/${theme}/src/lib/with-base.ts`);
  return m[1]
    .replace(/import\.meta\.env\.BASE_URL/g, '__BASE_URL__')
    // TS-only casts — new Function() парсит только plain JS.
    .replace(/\s+as\s+unknown\s+as\s+\{[^}]*\}/g, '');
}

function callWithBase(theme: string, absolutePath: string, win: unknown, baseUrl: unknown): string {
  const body = extractBody(theme);
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    '__win__',
    '__BASE_URL__',
    'absolutePath',
    `var window = __win__;${body}`,
  ) as (win: unknown, base: unknown, path: string) => string;
  return factory(win, baseUrl, absolutePath);
}

describe.each(THEMES)('%s: withBase — рантайм-глобал превью (владелец, 16.09, п.3)', (theme) => {
  it('ВИТРИНА (window без __MERFY_ASSET_BASE__): поведение НЕ меняется — запечённый BASE_URL', () => {
    const out = callWithBase(theme, '/icons/menu-close.svg', {}, '/');
    expect(out).toBe('/icons/menu-close.svg');
  });

  it('ПРЕВЬЮ (window.__MERFY_ASSET_BASE__ = "/__theme/<тема>"): путь получает префикс', () => {
    const out = callWithBase(
      theme,
      '/icons/menu-close.svg',
      { __MERFY_ASSET_BASE__: `/__theme/${theme}` },
      '/',
    );
    expect(out).toBe(`/__theme/${theme}/icons/menu-close.svg`);
  });

  it('SSR (window === undefined): падает на BASE_URL как раньше — не роняет сборку', () => {
    const out = callWithBase(theme, '/icons/menu-close.svg', undefined, '/');
    expect(out).toBe('/icons/menu-close.svg');
  });

  it('пустой __MERFY_ASSET_BASE__ ("") не считается заданным — фоллбек на BASE_URL', () => {
    const out = callWithBase(theme, '/icons/menu-close.svg', { __MERFY_ASSET_BASE__: '' }, '/');
    expect(out).toBe('/icons/menu-close.svg');
  });

  it('входной путь без ведущего "/" — нормализуется, префикс превью применяется', () => {
    const out = callWithBase(
      theme,
      'icons/menu-close.svg',
      { __MERFY_ASSET_BASE__: `/__theme/${theme}` },
      '/',
    );
    expect(out).toBe(`/__theme/${theme}/icons/menu-close.svg`);
  });
});

describe('preview.controller — инжект window.__MERFY_ASSET_BASE__', () => {
  const src = readFileSync(
    resolve(SITES_ROOT, 'src', 'controllers', 'preview.controller.ts'),
    'utf-8',
  );

  it('инжектится ТОЛЬКО когда themeName известен (тот же гейт, что __MERFY_THEME__)', () => {
    const idx = src.indexOf('__MERFY_ASSET_BASE__');
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/if \(themeName\) \{/);
  });

  it('значение — ровно "/__theme/<themeName>" (тот же префикс, что rewriteRootUrlsToPrefix)', () => {
    expect(src).toContain('`/__theme/${themeName}`');
  });
});
