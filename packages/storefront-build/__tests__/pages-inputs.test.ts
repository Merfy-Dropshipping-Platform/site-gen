import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { buildKey, dataKey } from '../src/key';
import { renderPlacedSections, type PageRender, type SectionRenderRequest } from '../src/sections-render';
import { EMPTY_SHOP } from '../src/shop-props';
import { changedInputs, errorOf } from './support';

// Входы сборки части 4 (блок 1 «Секций и SDK», Р1-4-3, Р1-4-8, Р1-4-10): настройки темы и свои страницы ревизии,
// деревья меню у экземпляра, removable и uses у секции; menus, theme и shop в запросе рендера.
const MODULE = 'export default "шапка";';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const MENU = { title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas', items: [] }] };
const PAGE = { id: 'page-custom-1', slug: '/o-nas', name: 'О нас', seo: { title: '', description: '', keywords: '' } };
const HEADER = {
  name: 'shop:header',
  kind: 'section' as const,
  hash: sha256('правка шапки'),
  render: HASH,
  script: null,
  removable: false as const,
  uses: ['theme' as const, 'shop' as const],
};

const part4 = (inputs: BuildInputs): void => {
  inputs.revision = { tokens: {}, settings: { 'social-telegram': 'https://t.me/scarves' }, pages: [PAGE] };
  inputs.code = {
    sections: [HEADER],
    pages: { header: [{ id: 'header-1', section: 'shop:header', settings: { menu: 'main' }, menus: { menu: MENU } }] },
    globals: [],
  };
};

describe('входы: свои страницы, настройки темы, меню, флаги секции', () => {
  it('входы части 4 проходят схему как есть', () => {
    const inputs = changedInputs(part4);
    expect(parseBuildInputs(inputs)).toEqual(inputs);
  });

  it('id страницы — не главная, шапка или подвал, один раз; адрес — один раз, не стенд темы, по правилу', () => {
    const withPage = (page: typeof PAGE) => () =>
      parseBuildInputs(
        changedInputs((inputs) => {
          part4(inputs);
          inputs.revision.pages = [PAGE, page];
        }),
      );
    expect(errorOf(withPage({ ...PAGE, id: 'header', slug: '/shapka' }))).toMatchObject({
      code: 'inputs-invalid',
      path: 'revision.pages.1.id',
    });
    expect(errorOf(withPage({ ...PAGE, id: 'page-custom-2' }))).toMatchObject({ path: 'revision.pages.1.slug' });
    expect(errorOf(withPage({ ...PAGE, id: 'page-custom-2', slug: '/theme-stand' }))).toMatchObject({
      path: 'revision.pages.1.slug',
    });
    expect(errorOf(withPage({ ...PAGE, id: 'page-custom-2', slug: '/О-нас' }))).toMatchObject({
      code: 'inputs-invalid',
    });
  });

  it('ключ сборки и ключ данных: правка настроек темы, своей страницы или меню — другой ключ', () => {
    const base = changedInputs(part4);
    const edits: ((inputs: BuildInputs) => void)[] = [
      (inputs) => (inputs.revision.settings = { 'social-telegram': 'https://t.me/other' }),
      (inputs) => (inputs.revision.pages = [{ ...PAGE, name: 'Про нас' }]),
      (inputs) => (inputs.code.pages.header = [{ id: 'header-1', section: 'shop:header', settings: { menu: 'main' } }]),
    ];
    for (const edit of edits) {
      const changed = structuredClone(base);
      edit(changed);
      expect(buildKey(changed)).not.toBe(buildKey(base));
      expect(dataKey(changed)).not.toBe(dataKey(base));
    }
  });
});

describe('menus, theme и shop в запросе рендера', () => {
  const placed = (name: string, extra: object = {}) => ({
    id: `${name}-1`,
    name: `shop:${name}`,
    hash: HASH,
    settings: {},
    ...extra,
  });
  function pageOf(requests: SectionRenderRequest[]): PageRender {
    return {
      sections: {
        modules: new Map([[HASH, MODULE]]),
        render: (request) => {
          requests.push(request);
          return Promise.resolve(`<p>${request.section}</p>`);
        },
      },
      mode: 'live',
      props: {
        theme: { 'social-telegram': 'https://t.me/scarves' },
        shop: { ...EMPTY_SHOP, name: 'Шарфы' },
        page: { id: 'home', path: '/' },
      },
    };
  }

  it('меню — у секции с menus; theme и shop — только тем, кто их объявил в uses', async () => {
    const requests: SectionRenderRequest[] = [];
    const list = [
      placed('header', { menus: { menu: MENU }, uses: ['theme', 'shop'] }),
      placed('footer', { uses: ['shop'] }),
      placed('hero'),
    ];
    await renderPlacedSections(list, platformDictionary, pageOf(requests));
    expect(requests.map(({ menus, theme, shop }) => [menus, theme, shop?.name])).toEqual([
      [{ menu: MENU }, { 'social-telegram': 'https://t.me/scarves' }, 'Шарфы'],
      [undefined, undefined, 'Шарфы'],
      [undefined, undefined, undefined],
    ]);
  });

  it('страница без props — пустые настройки темы и пустой магазин у секции с uses', async () => {
    const requests: SectionRenderRequest[] = [];
    const page = { ...pageOf(requests), props: undefined };
    await renderPlacedSections([placed('footer', { uses: ['theme', 'shop'] })], platformDictionary, page);
    expect([requests[0]?.theme, requests[0]?.shop]).toEqual([{}, EMPTY_SHOP]);
  });
});

describe('особые страницы заняты (блок 7 «Секций и SDK», часть 7а)', () => {
  it('своя страница с id not-found или адресом /404 — inputs-invalid', () => {
    const withPage = (page: typeof PAGE) => () =>
      parseBuildInputs(
        changedInputs((inputs) => {
          part4(inputs);
          inputs.revision.pages = [page];
        }),
      );
    expect(errorOf(withPage({ ...PAGE, id: 'not-found', slug: '/stranica' }))).toMatchObject({
      code: 'inputs-invalid',
      path: 'revision.pages.0.id',
    });
    expect(errorOf(withPage({ ...PAGE, slug: '/404' }))).toMatchObject({ path: 'revision.pages.0.slug' });
  });
});
