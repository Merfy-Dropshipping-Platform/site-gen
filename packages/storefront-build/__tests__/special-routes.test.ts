import { describe, expect, it } from 'vitest';
import { buildStorefront, type ThemeBuild } from '../src/build';
import type { BuildFile } from '../src/client-files';
import { parseBuildInputs, type BuildInputs, type CodeInput } from '../src/inputs';
import { pageInfoById, routeOf, shopRoutes, specialRoutes } from '../src/routes';
import { errorOf, rawInputs } from './support';
import { ASSETS, CODE, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Страницы корзины, избранного, входа и кабинета (блок 10 «Секций и SDK», часть 10а, Р10а-16): файл — когда в списке
// страницы есть видимый экземпляр; копия адреса — тот же HTML; в превью страница есть всегда.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };
// Тема с оформлением из секций (03.11, "checkout": "sections" в theme.json).
const SECTIONS_THEME: ThemeBuild = { ...THEME, checkout: 'sections' };
type Instance = CodeInput['pages'][string][number];
const instance = (id: string, hidden = false): Instance => ({
  id,
  section: 'shop:hero',
  settings: {},
  ...(hidden ? { hidden: true as const } : {}),
});

// Код стенда (support-code) и списки страниц блока 10 поверх его главной.
function withLists(lists: Record<string, Instance[]>): BuildInputs {
  return codeInputs((inputs) => {
    inputs.code = { ...CODE, pages: { ...CODE.pages, ...lists } };
  });
}
const text = (files: readonly BuildFile[], path: string): string =>
  Buffer.from(files.find((file) => file.path === path)?.content ?? new Uint8Array()).toString('utf8');

describe('страницы блока 10 в сборке', () => {
  it('видимый экземпляр — строка; пусто или только скрытые — строки нет', () => {
    const inputs = withLists({ 'page-cart': [instance('cart-1')], 'page-wishlist': [instance('w-1', true)] });
    expect(specialRoutes(inputs, 'live').map((route) => [route.id, route.path, route.file])).toEqual([
      ['page-cart', '/cart', 'cart/index.html'],
    ]);
    expect(shopRoutes(inputs).map((route) => route.path)).toEqual(['/', '/cart']);
  });

  it('кабинет: адрес из двух частей и копия /account; вход — копия /verify', () => {
    const inputs = withLists({ 'page-profile': [instance('p-1')], 'page-login': [instance('l-1')] });
    expect(specialRoutes(inputs, 'live').map((route) => [route.id, route.file, route.aliases])).toEqual([
      ['page-profile', 'account/profile/index.html', [{ path: '/account', file: 'account/index.html' }]],
      ['page-login', 'login/index.html', [{ path: '/verify', file: 'verify/index.html' }]],
    ]);
    expect(routeOf('/account', inputs).id).toBe('page-profile');
    expect(routeOf('/verify', inputs).id).toBe('page-login');
  });

  it('превью: все страницы из секций, и оформление (03.11); по id — и без секций', () => {
    const inputs = withLists({});
    expect(specialRoutes(inputs, 'preview').map((route) => route.id)).toEqual([
      'page-cart',
      'page-checkout',
      'page-checkout-result',
      'page-profile',
      'page-wishlist',
      'page-orders',
      'page-login',
    ]);
    expect(specialRoutes(inputs, 'live')).toEqual([]);
    expect(pageInfoById(inputs, 'page-orders')).toEqual({ id: 'page-orders', path: '/account/orders' });
  });

  it('сборка: файл копии — тот же HTML; в страницах манифеста копии нет', async () => {
    const inputs = withLists({ 'page-profile': [instance('p-1')] });
    const renderSection = (): Promise<string> => Promise.resolve('<p>кабинет</p>');
    const { manifest, files } = await buildStorefront(inputs, REFERENCES, THEME, ASSETS, renderSection);
    expect(text(files, 'account/index.html')).toBe(text(files, 'account/profile/index.html'));
    expect(text(files, 'account/profile/index.html')).toContain('data-path="/account/profile"');
    expect(manifest.pages.map((page) => page.path)).toEqual(['/', '/account/profile']);
    expect(Object.keys(manifest.files)).toEqual(
      expect.arrayContaining(['account/index.html', 'account/profile/index.html']),
    );
  });

  // 02.11.2026: служебные страницы (special-pages.json, index: false) — не для поиска.
  it('корзина, кабинет и оформление — с noindex; главная — без', async () => {
    const inputs = withLists({
      'page-cart': [instance('c-1')],
      'page-profile': [instance('p-1')],
      'page-checkout': [instance('ch-1')],
    });
    const renderSection = (): Promise<string> => Promise.resolve('<p>секция</p>');
    const { files } = await buildStorefront(inputs, REFERENCES, SECTIONS_THEME, ASSETS, renderSection);
    const noindex = '<meta name="robots" content="noindex">';
    for (const file of ['cart/index.html', 'account/profile/index.html', 'account/index.html', 'checkout/index.html'])
      expect(text(files, file), file).toContain(noindex);
    expect(text(files, 'index.html')).not.toContain('name="robots"');
  });

  // Оформление из секций (03.11): /checkout — только с видимым экземпляром; ключ DaData — в конфиге только его страницы,
  // адрес подсказок — в connect-src; без ключа — ни того, ни другого.
  it('оформление из секций: файл по экземпляру, ключ DaData — в конфиге /checkout и в политике', async () => {
    const lists = { 'page-checkout': [instance('ch-1')], 'page-cart': [instance('c-1')] };
    const renderSection = (): Promise<string> => Promise.resolve('<p>секция</p>');
    const keyed = codeInputs((inputs) => {
      inputs.code = { ...CODE, pages: { ...CODE.pages, ...lists } };
      inputs.env = { ...inputs.env, dadataToken: 'pub-dadata' };
    });
    const { manifest, files } = await buildStorefront(keyed, REFERENCES, SECTIONS_THEME, ASSETS, renderSection);
    expect(manifest.pages.map((page) => page.path)).toEqual(['/', '/cart', '/checkout']);
    expect(text(files, 'checkout/index.html')).toContain('"dadata":{"token":"pub-dadata"}');
    expect(text(files, 'cart/index.html')).not.toContain('dadata');
    expect(manifest.csp).toContain('https://suggestions.dadata.ru');
    const plain = await buildStorefront(withLists(lists), REFERENCES, SECTIONS_THEME, ASSETS, renderSection);
    expect(text(plain.files, 'checkout/index.html')).not.toContain('dadata');
    expect(plain.manifest.csp).not.toContain('dadata');
  });

  it('вход revision.checkout: четыре типа блоков; другой тип — inputs-invalid', () => {
    const header = { type: 'CheckoutHeader', props: { colorScheme: 'scheme-1', padding: { top: 32, bottom: 16 } } };
    const ok = rawInputs((json) => Object.assign(json.revision, { checkout: { blocks: [header] } }));
    expect(parseBuildInputs(ok).revision.checkout?.blocks).toEqual([header]);
    const bad = rawInputs((json) =>
      Object.assign(json.revision, { checkout: { blocks: [{ type: 'Footer', props: {} }] } }),
    );
    expect(errorOf(() => parseBuildInputs(bad)).code).toBe('inputs-invalid');
  });
});
