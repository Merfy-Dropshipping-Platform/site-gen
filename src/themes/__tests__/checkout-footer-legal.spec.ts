import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assembleChrome,
  injectCheckoutChromeIntoHtml,
  type AssembledChrome,
  type RenderBlockFn,
} from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

/** Рендер ТОГО ЖЕ скомпилированного блока, что уходит на витрину и в превью. */
function renderStrip(props: Record<string, unknown>): string {
  const jobs = [{ block: 'CheckoutFooterStrip', pkg: 'theme-base', props }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

/**
 * Баг-репорт 18-А: «Во вкладке Оформление заказа убрать подвал, где идёт
 * "Powered by merfy". Ожидаемый результат: подвал на этой странице — это
 * юридическая информация, ссылки».
 *
 * Замер «до» (прод, 2026-09-13, пять витрин на 9871f205): у четырёх тем внизу
 * чекаута чёрная полоса «© 2026 … Все права защищены. Powered by Merfy» и
 * больше ничего; у flux подвала на чекауте не было вовсе. Правовые страницы
 * магазина (site_policy: refund/privacy/tos/shipping) на чекаут не попадали —
 * покупатель на шаге оплаты не мог открыть ни оферту, ни политику возврата.
 *
 * Лечение: строка копирайта теряет маркетинговый хвост, а сам подвал собирается
 * из УЖЕ существующего реестра политик. Источник ссылок — тот же, что у
 * обычного подвала: `applyFooterData` кладёт заполненные политики в
 * `Footer.props.informationColumn.links` ревизии (оба пути — сборка витрины и
 * превью конструктора), поэтому чекаут ничего не выдумывает и не ходит в БД
 * отдельно.
 */
describe('подвал чекаута — правовой, а не «Powered by Merfy» (баг 18-А)', () => {
  const STRIP = 'packages/theme-base/blocks/CheckoutFooterStrip/CheckoutFooterStrip.astro';

  it('в блоке полосы не осталось «Powered by Merfy»', () => {
    const src = read(STRIP);
    // Упоминание допустимо только в комментарии-истории, в РАЗМЕТКЕ и дефолтах — нет.
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toContain('Powered by Merfy');
    expect(withoutComments).not.toContain('Powered by merfy');
  });

  it('полоса умеет показывать правовые ссылки магазина', () => {
    const src = read(STRIP);
    expect(src).toMatch(/links\??:/);
    expect(src).toContain('data-checkout-legal-links');
  });

  describe('что реально видит покупатель (рендер скомпилированного блока)', () => {
    it('блоки скомпилированы (pnpm build:blocks)', () => {
      expect(existsSync(resolve(SITES_ROOT, 'dist', 'astro-blocks', 'manifest.json'))).toBe(true);
    });

    it('в отрисованной полосе нет «Powered by Merfy»', () => {
      const html = renderStrip({ siteTitle: 'Мой магазин', links: [] });
      expect(html).not.toContain('Powered by Merfy');
      expect(html).not.toContain('Powered by merfy');
      // Копирайт остаётся — это тоже правовая строка.
      expect(html).toContain('Все права защищены');
      expect(html).toContain('Мой магазин');
    });

    it('правовые страницы магазина выводятся ссылками', () => {
      const html = renderStrip({
        siteTitle: 'Мой магазин',
        links: [
          { label: 'Политика возврата', href: '/legal/refund' },
          { label: 'Условия обслуживания', href: '/legal/terms' },
        ],
      });
      expect(html).toContain('data-checkout-legal-links');
      expect(html).toContain('href="/legal/refund"');
      expect(html).toContain('Политика возврата');
      expect(html).toContain('href="/legal/terms"');
      expect(html).toContain('Условия обслуживания');
    });

    it('пустая или битая ссылка не рисуется (политика не заполнена)', () => {
      const html = renderStrip({
        siteTitle: 'Мой магазин',
        links: [
          { label: 'Политика возврата', href: '/legal/refund' },
          { label: '', href: '/legal/privacy' },
          { label: 'Политика доставки', href: '' },
        ],
      });
      expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
      expect(html).toContain('href="/legal/refund"');
    });
  });

  it.each(THEMES)('тема %s рисует правовой подвал на чекауте', (theme) => {
    const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
    expect(layout).toContain('CheckoutFooterStrip');
    // Полоса обязана быть в checkout-ветке, а не только импортирована.
    const checkoutBranch = layout.slice(layout.indexOf('header !== "checkout"'));
    expect(checkoutBranch).toContain('CheckoutFooterStrip');
  });

  it('сборка хрома чекаута отдаёт подвал с правовыми ссылками из ревизии', async () => {
    const calls: Array<{ blockName: string; props: Record<string, unknown> }> = [];
    const renderBlock: RenderBlockFn = async ({ blockName, props }) => {
      calls.push({ blockName, props });
      return `<${blockName.toLowerCase()} />`;
    };
    const chrome = await assembleChrome({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { siteTitle: 'Мой магазин' } },
            {
              type: 'Footer',
              props: {
                informationColumn: {
                  links: [
                    { label: 'Политика конфиденциальности', href: '/legal/privacy' },
                    { label: 'Условия обслуживания', href: '/legal/terms' },
                  ],
                },
              },
            },
          ],
        },
      },
      theme: 'rose',
      chrome: 'checkout',
      renderBlock,
      isPreview: false,
    });
    const strip = calls.find((c) => c.blockName === 'CheckoutFooterStrip');
    expect(strip).toBeDefined();
    expect(strip!.props.links).toEqual([
      { label: 'Политика конфиденциальности', href: '/legal/privacy' },
      { label: 'Условия обслуживания', href: '/legal/terms' },
    ]);
    // Название магазина в копирайте — то же, что в шапке чекаута.
    expect(strip!.props.siteTitle).toBe('Мой магазин');
    expect(chrome.footerHtml).toBe('<checkoutfooterstrip />');
  });

  it('политик нет → подвал всё равно собирается, но без ссылок', async () => {
    const calls: Array<{ blockName: string; props: Record<string, unknown> }> = [];
    const renderBlock: RenderBlockFn = async ({ blockName, props }) => {
      calls.push({ blockName, props });
      return `<${blockName.toLowerCase()} />`;
    };
    await assembleChrome({
      pagesData: { home: { content: [{ type: 'Footer', props: {} }] } },
      theme: 'flux',
      chrome: 'checkout',
      renderBlock,
      isPreview: true,
    });
    const strip = calls.find((c) => c.blockName === 'CheckoutFooterStrip');
    expect(strip!.props.links).toEqual([]);
  });

  it('подменяет полосу темы собранной (и остаётся идемпотентной)', () => {
    const blob =
      '<html><body>' +
      '<header data-checkout-slot="header">ШАПКА</header>' +
      '<section class="a" data-block="checkout-form">F</section>' +
      '<section class="b" data-block="checkout-summary">S</section>' +
      '<div class="color-scheme-2"><footer class="w-full" data-checkout-footer-strip>' +
      '<p>© 2026 Rose Theme Все права защищены. Powered by Merfy</p></footer></div>' +
      '</body></html>';
    const chrome: AssembledChrome = {
      headerHtml: null,
      footerHtml:
        '<footer class="w-full" data-checkout-footer-strip><a href="/legal/privacy">Политика конфиденциальности</a></footer>',
    };
    const once = injectCheckoutChromeIntoHtml(blob, chrome);
    expect(once).not.toContain('Powered by Merfy');
    expect(once).toContain('href="/legal/privacy"');
    // Обёртка схемы темы остаётся на месте — подменяем только <footer>.
    expect(once).toContain('<div class="color-scheme-2">');
    expect(injectCheckoutChromeIntoHtml(once, chrome)).toEqual(once);
  });

  it('подвал не собрался → полоса темы остаётся (без молчаливой пропажи)', () => {
    const blob =
      '<body><footer data-checkout-footer-strip>ПОЛОСА ТЕМЫ</footer></body>';
    const out = injectCheckoutChromeIntoHtml(blob, { headerHtml: null, footerHtml: null });
    expect(out).toContain('ПОЛОСА ТЕМЫ');
  });
});

/**
 * Саботаж-контроль: одной чистой функции мало — баг 16 был в том, что общую
 * функцию НЕ ЗВАЛИ. Сторожим проводку: подвал чекаута обязан ехать обоими
 * путями (превью конструктора и сборка витрины), иначе мерчант снова увидит
 * в конструкторе одно, а покупатель на витрине — другое.
 */
describe('правовой подвал доезжает обоими путями', () => {
  it('чекаут-ветка сборки хрома действительно рендерит полосу', () => {
    const src = read('src/themes/chrome-assembler.ts');
    const branch = src.slice(
      src.indexOf("if (chrome === 'checkout')"),
      src.indexOf("// chrome === 'full'"),
    );
    expect(branch).toContain('CheckoutFooterStrip');
    expect(branch).toContain('informationColumn');
    // Возврат `footerHtml: null` для чекаута = подвал снова потерян.
    expect(branch).not.toMatch(/return\s*\{\s*headerHtml,\s*footerHtml:\s*null\s*\}/);
  });

  it('общая доводка чекаута подменяет именно полосу, а не последний <footer>', () => {
    const src = read('src/themes/chrome-assembler.ts');
    const fn = src.slice(src.indexOf('export function injectCheckoutChromeIntoHtml'));
    expect(fn).toContain('replaceCheckoutFooterStrip');
  });
});
