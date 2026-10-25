import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { CHECKOUT_COLOR_VARS, checkoutVarsCss } from '../src/checkout-css';
import { CHECKOUT_PAGES } from '../src/checkout-pages';
import type { BuildFile } from '../src/client-files';
import { routeOf } from '../src/routes';
import { standInputs } from './support';
import { ASSETS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// /checkout и /checkout-result новой темы (блок 10 «Секций и SDK», часть 10а, Р10а-17, Р10а-18): в каждой сборке, без
// строк манифеста; бандл оформления — с частью checkout; переменные пяти тем — из схем магазина.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };
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

  it('в каждой сборке; в страницах манифеста их нет; конфиг страницы — id оформления', async () => {
    const { manifest, files } = await buildStorefront(standInputsJson, REFERENCES, THEME);
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining(['checkout/index.html', 'checkout-result/index.html']));
    expect(manifest.pages.map((page) => page.path)).toEqual(['/']);
    expect(text(files, 'checkout/index.html')).toContain('data-path="/checkout"');
    expect(text(files, 'checkout/index.html')).toContain('"id":"page-checkout"');
  });

  it('бандл /checkout — с частью checkout, у /checkout-result и главной — без неё', async () => {
    // Подставное ядро support-code экспортирует checkout = { name: 'checkout' }: в бандл попадает только импортированное.
    const renderSection = (): Promise<string> => Promise.resolve('<p class="flex">секция</p>');
    const { files } = await buildStorefront(codeInputs(), REFERENCES, THEME, ASSETS, renderSection);
    const bundleOf = (page: string): string => {
      const src = /src="\/(_merfy\/b\/[0-9a-f]{64}\.js)"/.exec(text(files, page))?.[1];
      if (src === undefined) throw new Error(`у ${page} нет бандла`);
      return text(files, src);
    };
    const CHECKOUT_PART = /name:\s*["']checkout["']/;
    expect(bundleOf('checkout/index.html')).toMatch(CHECKOUT_PART);
    expect(bundleOf('checkout-result/index.html')).not.toMatch(CHECKOUT_PART);
    expect(bundleOf('index.html')).not.toMatch(CHECKOUT_PART);
  });
});

describe('переменные пяти тем из токенов', () => {
  it('цвет схемы #rrggbb — тройка r g b; не #rrggbb — переменной нет; размеры — ссылкой', () => {
    const css = checkoutVarsCss({ 'scheme-2': { background: '#ffffff', foreground: '#1a1a1a', primary: 'oklch(0.5 0.1 20)' } });
    expect(css).toContain('.color-scheme-2 {');
    expect(css).toContain('--color-bg: 255 255 255;');
    expect(css).toContain('--color-text: 26 26 26;');
    expect(css).toContain('--color-input-bg: 255 255 255;');
    expect(css).not.toContain('--color-button-bg');
    expect(css).toContain('--size-body: var(--text-base);');
    expect(css).toContain('--container-max-width: var(--width-page);');
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
