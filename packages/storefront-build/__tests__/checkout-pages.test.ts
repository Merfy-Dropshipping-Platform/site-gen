import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { CHECKOUT_COLOR_VARS, checkoutVarsCss } from '../src/checkout-css';
import { checkoutFiles, CHECKOUT_PAGES } from '../src/checkout-pages';
import { LIVE_PAGE, NO_SECTIONS, type PageRender } from '../src/sections-render';
import { StorefrontBuildError } from '../src/errors';
import { parseBuildInputs } from '../src/inputs';
import { renderShopPage } from '../src/page';
import { changedInputs } from './support';
import type { BuildFile } from '../src/client-files';
import { routeOf } from '../src/routes';
import type { CheckoutBlock } from '../src/inputs';
import { standInputs } from './support';
import { ASSETS, CODE, REVIEWS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// /checkout и /checkout-result новой темы (блок 10 «Секций и SDK», часть 10а, Р10а-17, Р10а-18): у прежних версий темы —
// в каждой сборке, без строк манифеста, бандл с частью checkoutLegacy; переменные пяти тем — из схем магазина. С 03.11
// тема с "checkout": "sections" рисует их из секций.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };
const SECTIONS_THEME: ThemeBuild = { ...THEME, checkout: 'sections' };
const text = (files: readonly BuildFile[], path: string): string =>
  Buffer.from(files.find((file) => file.path === path)?.content ?? new Uint8Array()).toString('utf8');

describe('страницы оформления', () => {
  it('адреса и файлы; в превью страница находится по адресу', () => {
    expect(CHECKOUT_PAGES.map((page) => [page.id, page.path, page.file])).toEqual([
      ['page-checkout', '/checkout', 'checkout/index.html'],
      ['page-checkout-result', '/checkout-result', 'checkout-result/index.html'],
    ]);
    expect(routeOf('/checkout', standInputs, 'preview').id).toBe('page-checkout');
  });

  const renderSection = (): Promise<string> => Promise.resolve('<p class="flex">секция</p>');
  // Секция оформления на модуле checkout и её экземпляр в списке page-checkout.
  const form = { ...REVIEWS, name: 'shop:checkout', meta: { uses: ['checkout'], parts: ['checkout'], classes: [] } };
  const withCheckoutList = (): unknown =>
    codeInputs((copy) => {
      copy.code = {
        ...CODE,
        sections: [...CODE.sections, form],
        pages: { ...CODE.pages, 'page-checkout': [{ id: 'ch-1', section: 'shop:checkout', settings: {} }] },
      };
    });
  const bundleOf = (files: readonly BuildFile[], page: string): string => {
    const src = /src="\/(_merfy\/b\/[0-9a-f]{64}\.js)"/.exec(text(files, page))?.[1];
    if (src === undefined) throw new Error(`у ${page} нет бандла`);
    return text(files, src);
  };
  // Подставное ядро support-code экспортирует checkout и checkoutLegacy: в бандл попадает только импортированное.
  const CHECKOUT_PART = /name:\s*["']checkout["']/;
  const LEGACY_PART = /name:\s*["']checkoutLegacy["']/;

  // Версии темы без "checkout": "sections" (до nova 0.7.8): прежние файлы оформления в каждой сборке, без строк
  // манифеста; список page-checkout их не меняет — секции там не рисуются (Astro-страница ждёт locals.checkout).
  it('прежняя тема: файлы в каждой сборке, строк манифеста нет, бандл /checkout — с checkoutLegacy', async () => {
    const plain = await buildStorefront(standInputsJson, REFERENCES, THEME);
    expect(plain.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(['checkout/index.html', 'checkout-result/index.html']),
    );
    expect(plain.manifest.pages.map((page) => page.path)).toEqual(['/']);
    expect(text(plain.files, 'checkout/index.html')).toContain('"id":"page-checkout"');
    const { manifest, files } = await buildStorefront(withCheckoutList(), REFERENCES, THEME, ASSETS, renderSection);
    expect(manifest.pages.map((page) => page.path)).toEqual(['/']);
    expect(bundleOf(files, 'checkout/index.html')).toMatch(LEGACY_PART);
    expect(bundleOf(files, 'checkout/index.html')).not.toMatch(CHECKOUT_PART);
    expect(bundleOf(files, 'checkout-result/index.html')).not.toMatch(LEGACY_PART);
    expect(bundleOf(files, 'index.html')).not.toMatch(LEGACY_PART);
  });

  it('прежняя тема: страницу оформления из секций не рисует и по запросу — page-unknown', async () => {
    const inputs = parseBuildInputs(withCheckoutList());
    const error = await renderShopPage(inputs, '/checkout', THEME, LIVE_PAGE).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorefrontBuildError);
    expect(error instanceof StorefrontBuildError ? error.code : '').toBe('page-unknown');
  });

  // С 03.11 (тема с "checkout": "sections") оформление — страницы из секций (базовые секции checkout и checkout-result),
  // как корзина: файла нет, пока в списке нет видимого экземпляра; есть — строка манифеста и конфиг с id оформления.
  it('из секций: без экземпляра — файла нет; с экземпляром — страница манифеста и конфиг id оформления', async () => {
    const empty = await buildStorefront(standInputsJson, REFERENCES, SECTIONS_THEME);
    expect(empty.files.map((file) => file.path)).not.toContain('checkout/index.html');
    expect(empty.files.map((file) => file.path)).not.toContain('checkout-result/index.html');
    const { manifest, files } = await buildStorefront(withCheckoutList(), REFERENCES, SECTIONS_THEME, ASSETS, renderSection);
    expect(manifest.pages.map((page) => page.path)).toEqual(['/', '/checkout']);
    expect(text(files, 'checkout/index.html')).toContain('data-path="/checkout"');
    expect(text(files, 'checkout/index.html')).toContain('"id":"page-checkout"');
  });

  it('из секций: бандл /checkout — с модулем checkout, когда его объявила секция; у главной — без него', async () => {
    const { files } = await buildStorefront(withCheckoutList(), REFERENCES, SECTIONS_THEME, ASSETS, renderSection);
    expect(bundleOf(files, 'checkout/index.html')).toMatch(CHECKOUT_PART);
    expect(bundleOf(files, 'checkout/index.html')).not.toMatch(LEGACY_PART);
    expect(bundleOf(files, 'index.html')).not.toMatch(CHECKOUT_PART);
  });
});

// Свойства блоков «Оформления заказа» по режиму (блок 10 «Секций и SDK», часть 10а, Р10а-19): на витрине действует
// только «Шапка оформления», в превью — все четыре блока, как на проде.
describe('свойства блоков оформления по режиму', () => {
  const PREVIEW_PAGE: PageRender = { sections: NO_SECTIONS, mode: 'preview' };
  const BLOCKS: CheckoutBlock[] = [
    { type: 'CheckoutHeader', props: { siteTitle: 'Магазин стены' } },
    { type: 'CheckoutLayout', props: { summaryPosition: 'left' } },
    { type: 'CheckoutForm', props: { requirePhone: true } },
    { type: 'CheckoutSummary', props: { showNotes: true } },
  ];

  it('в превью — все четыре блока, на витрине — только «Шапка оформления»', async () => {
    const seen: string[] = [];
    const theme: ThemeBuild = {
      tokens: novaTokens,
      clientFiles: [],
      render: (path, locals) => {
        seen.push(`${path} ${JSON.stringify(locals.checkout)}`);
        return Promise.resolve('<html><body>оформление</body></html>');
      },
    };
    const inputs = changedInputs((copy) => {
      copy.revision.checkout = { blocks: BLOCKS };
    });
    await checkoutFiles(inputs, theme, PREVIEW_PAGE);
    await checkoutFiles(inputs, theme, LIVE_PAGE);
    const [previewCheckout, , liveCheckout] = seen;
    expect(seen).toHaveLength(4);
    expect(previewCheckout ?? '').toContain('"siteTitle":"Магазин стены"');
    expect(previewCheckout ?? '').toContain('"summaryPosition":"left"');
    expect(previewCheckout ?? '').toContain('"requirePhone":true');
    expect(previewCheckout ?? '').toContain('"showNotes":true');
    expect(liveCheckout ?? '').toContain('"siteTitle":"Магазин стены"');
    expect(liveCheckout ?? '').not.toContain('"summaryPosition"');
    expect(liveCheckout ?? '').not.toContain('"requirePhone"');
    expect(liveCheckout ?? '').not.toContain('"showNotes"');
  });
});

describe('переменные пяти тем из токенов', () => {
  it('цвет схемы #rrggbb — тройка r g b; не #rrggbb — переменной нет; текстовые размеры — фиксированным px ступени', () => {
    const css = checkoutVarsCss(
      { 'scheme-2': { background: '#ffffff', foreground: '#1a1a1a', primary: 'oklch(0.5 0.1 20)' } },
      { 'text-base': { min: 16, max: 16 }, 'text-lg': { min: 18, max: 20 }, 'text-2xl': { min: 24, max: 32 } },
    );
    expect(css).toContain('.color-scheme-2 {');
    expect(css).toContain('--color-bg: 255 255 255;');
    expect(css).toContain('--color-text: 26 26 26;');
    expect(css).toContain('--color-input-bg: 255 255 255;');
    expect(css).not.toContain('--color-button-bg');
    expect(css).toContain('--size-body: 16px;');
    // Заголовки разделов — базовая ступень (18), итог — база text-2xl (24): фиксированные размеры, как у тем прода.
    expect(css).toContain('--size-h3: 18px;');
    expect(css).toContain('--size-h2: 24px;');
    expect(css).toContain('--container-max-width: var(--width-page);');
    expect(css).toContain('--radius-field: var(--radius-input);');
  });

  it('нет корневых токенов или ступень не шкала — размер ссылкой на переменную nova', () => {
    const css = checkoutVarsCss({});
    expect(css).toContain('--size-h3: var(--text-lg);');
    expect(css).toContain('--size-body: var(--text-base);');
  });

  it('таблица — все переменные цвета, которые читают блоки оформления', () => {
    expect(Object.keys(CHECKOUT_COLOR_VARS).sort()).toEqual([
      'color-bg',
      'color-border',
      'color-button-bg',
      'color-button-border',
      'color-button-text',
      'color-error',
      'color-heading',
      'color-input-bg',
      'color-input-border',
      'color-input-label',
      'color-input-placeholder',
      'color-muted',
      'color-surface',
      'color-text',
    ]);
  });
});
