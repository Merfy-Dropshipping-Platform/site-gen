import { fileURLToPath } from 'node:url';
import { renderSection, sha256, type PlacedSection, type SectionsRender, type SettingValues } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { resolveWrapperView } from '../src/wrapper';

// «Шапка» на витрине (блок 7, часть 7б, раздел 7 design.md): договор разметки plan-7b.md, 7б-3. Рендер — настоящий
// процесс рендера; проверяется то, что видит покупатель и что читают проверки (признаки, ссылки, aria-current, open,
// класс схемы меню).
const FOLDER = fileURLToPath(new URL('../fixtures/shop/header', import.meta.url));
const MENU = {
  title: 'Главное меню',
  items: [
    {
      label: 'Каталог',
      url: '/catalog',
      items: [
        {
          label: 'Шарфы',
          url: '/catalog/scarves',
          items: [
            { label: 'Кашемир', url: '/catalog/scarves/cashmere', items: [] },
            { label: 'Шерсть', url: '/catalog/scarves/wool', items: [] },
          ],
        },
      ],
    },
    {
      label: 'Покупателям',
      url: '/buyers',
      items: [
        { label: 'Доставка', url: '/delivery', items: [] },
        { label: 'О нас', url: '/about', items: [] },
      ],
    },
    { label: 'Контакты', url: '/contacts', items: [] },
  ],
};
const SHOP = {
  name: 'Мой сайт',
  contacts: { phone: '', email: '', fields: [] },
  policies: [],
  payments: { online: false },
};
const BLOCKS = ['search', 'wishlist', 'cart', 'profile'].map((type) => ({ id: `${type}-1`, type, settings: {} }));
const HOME = { id: 'home', path: '/' };

let renderer: SectionRenderer;
let sectionManifest: SectionManifest;
let module = '';
let hash = '';

beforeAll(async () => {
  const files = await readSectionFolder(FOLDER);
  const manifest = readManifest(files);
  if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
  sectionManifest = manifest.value;
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  module = checked.render;
  hash = sha256(Buffer.from(module, 'utf8'));
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

interface Variant {
  settings?: Record<string, string>;
  page?: { id: string; path: string | null };
  blocks?: typeof BLOCKS;
  theme?: SettingValues;
}

const html = (variant: Variant = {}): Promise<string> =>
  renderer.render({
    section: 'shop:header',
    hash,
    module,
    settings: { 'logo-position': 'top-left', 'menu-type': 'dropdown', menu: 'main', ...variant.settings },
    blocks: variant.blocks ?? BLOCKS,
    menus: { menu: MENU },
    theme: variant.theme ?? {},
    shop: SHOP,
    page: variant.page ?? HOME,
  });

const tags = (source: string, pattern: string): string[] => source.match(new RegExp(`<${pattern}[^>]*>`, 'g')) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const hasFlag = (tag: string, name: string): boolean => new RegExp(`\\s${name}(?=[\\s=>/])`).test(tag);
const dialogs = (source: string): string[] => tags(source, '[a-z][a-z0-9-]*\\b[^>]*data-behavior="dialog"');
const current = (source: string): (string | null)[] =>
  tags(source, 'a\\b')
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => attr(tag, 'href'));
const openBranches = (source: string): number =>
  tags(source, 'details\\b').filter((tag) => hasFlag(tag, 'open')).length;

const POSITIONS = ['top-left', 'top-center', 'center-left', 'center-absolute'];
const TYPES = ['dropdown', 'mega-menu', 'sidebar'];

describe('«Шапка»: признаки настроек', () => {
  it.each(POSITIONS)('положение логотипа %s — признак на корне', async (position) => {
    expect(await html({ settings: { 'logo-position': position } })).toContain(`data-logo-position="${position}"`);
  });

  it.each(TYPES)('тип меню %s — признак на корне', async (type) => {
    expect(await html({ settings: { 'menu-type': type } })).toContain(`data-menu-type="${type}"`);
  });
});

describe('«Шапка»: меню и окна', () => {
  it.each([
    ['dropdown', 1],
    ['mega-menu', 1],
    ['sidebar', 0],
  ] as const)('%s: меню на компьютере (nav-menu) — %i', async (type, count) => {
    const source = await html({ settings: { 'menu-type': type } });
    expect(source.match(/data-behavior="nav-menu"/g)?.length ?? 0).toBe(count);
  });

  it('выпадающее и расширенное: бургер-меню под шапкой (немодальное, drop) и поиск (немодальное, fade)', async () => {
    for (const type of ['dropdown', 'mega-menu']) {
      const found = dialogs(await html({ settings: { 'menu-type': type } }));
      expect(found.map((tag) => [attr(tag, 'data-modal'), attr(tag, 'data-transition')]).sort()).toEqual([
        ['false', 'drop'],
        ['false', 'fade'],
      ]);
    }
  });

  it('боковое: модальная панель слева (drawer) и немодальный поиск', async () => {
    const found = dialogs(await html({ settings: { 'menu-type': 'sidebar' } }));
    expect(found).toHaveLength(2);
    const panel = found.find((tag) => attr(tag, 'data-side') === 'left');
    expect(panel === undefined ? null : attr(panel, 'data-transition')).toBe('drawer');
    expect(panel === undefined ? null : attr(panel, 'data-modal')).toBeNull();
  });

  it.each(TYPES)('%s: меню в три уровня <details>', async (type) => {
    expect(tags(await html({ settings: { 'menu-type': type } }), 'details\\b')).toHaveLength(3);
  });
});

describe('«Шапка»: текущая страница', () => {
  it('на «Доставке» aria-current только у ссылок /delivery, открыта одна ветка', async () => {
    const source = await html({ page: { id: 'page-custom-c1', path: '/delivery' } });
    expect([...new Set(current(source))]).toEqual(['/delivery']);
    expect(openBranches(source)).toBe(1);
  });

  it('на странице третьего уровня открыты обе ветки', async () => {
    const source = await html({ page: { id: 'page-custom-c3', path: '/catalog/scarves/cashmere' } });
    expect([...new Set(current(source))]).toEqual(['/catalog/scarves/cashmere']);
    expect(openBranches(source)).toBe(2);
  });

  it('на главной, на странице вне меню и на странице 404 — ни aria-current, ни open', async () => {
    for (const page of [HOME, { id: 'page-custom-c9', path: '/elsewhere' }, { id: 'not-found', path: null }]) {
      const source = await html({ page });
      expect(current(source)).toEqual([]);
      expect(openBranches(source)).toBe(0);
    }
  });
});

describe('«Шапка»: значки, поиск, логотип', () => {
  it('все четыре подпункта: ссылки и подписи', async () => {
    const source = await html();
    for (const name of ['Поиск', 'Избранное', 'Корзина', 'Профиль']) expect(source).toContain(`aria-label="${name}"`);
    for (const href of ['/wishlist', '/cart', '/login']) expect(source).toContain(`href="${href}"`);
  });

  it('скрытый подпункт «Избранное» не выводится нигде', async () => {
    const source = await html({ blocks: BLOCKS.filter((block) => block.type !== 'wishlist') });
    expect(source).not.toContain('/wishlist');
    expect(source).not.toContain('aria-label="Избранное"');
    expect(source).toContain('href="/cart"');
  });

  it('скрытый «Поиск» — ни окна поиска, ни поля q', async () => {
    const source = await html({ blocks: BLOCKS.filter((block) => block.type !== 'search') });
    expect(source).not.toContain('name="q"');
    expect(source).not.toContain('aria-label="Поиск"');
  });

  it('боковое: значок поиска и «Профиль» — в ряду шапки с 768 px, как у flux', async () => {
    const source = await html({ settings: { 'menu-type': 'sidebar' } });
    const search = tags(source, 'button\\b').filter((tag) => attr(tag, 'aria-label') === 'Поиск');
    const profile = tags(source, 'a\\b').filter((tag) => attr(tag, 'aria-label') === 'Профиль');
    expect(search).toHaveLength(1);
    expect(profile).toHaveLength(1);
    const fromTablet = (tag: string): boolean => {
      const names = (attr(tag, 'class') ?? '').split(/\s+/);
      return names.includes('hidden') && names.some((name) => name.startsWith('md:'));
    };
    expect(search.every(fromTablet)).toBe(true);
    expect(profile.every(fromTablet)).toBe(true);
  });

  it('форма поиска: GET в /catalog, поле q, кнопка «Найти»', async () => {
    const source = await html();
    const form = tags(source, 'form\\b').find((tag) => attr(tag, 'action') === '/catalog');
    expect(form === undefined ? null : attr(form, 'method')).toBe('get');
    expect(source).toContain('name="q"');
    expect(source).toContain('Найти');
  });

  it('логотип: картинка темы или название магазина ссылкой на главную', async () => {
    expect(await html()).toMatch(/<a\b[^>]*href="\/"[^>]*>[^<]*Мой сайт/);
    const withImage = await html({ theme: { 'logo-image': 'https://cdn.merfy.ru/logo.webp' } });
    expect(withImage).toContain('src="https://cdn.merfy.ru/logo.webp"');
  });

  it('нет style, скриптов и счётчиков', async () => {
    for (const type of TYPES) {
      const source = await html({ settings: { 'menu-type': type } });
      expect(source).not.toMatch(/\sstyle=/);
      expect(source).not.toContain('<script');
      expect(source).not.toContain('data-cart-count');
    }
  });
});

describe('«Шапка»: цветовая схема меню', () => {
  // Как на проде (Р7б-8): класс схемы — на ряду меню и на окне бургер-меню; остальная шапка — в схеме обёртки.
  const MENU_SCHEME = { 'color-scheme': 'scheme-2' };
  const elements = (source: string): { name: string; tag: string }[] =>
    [...source.matchAll(/<([a-z][\w-]*)\b[^>]*>/g)].map((item) => ({ name: item[1] ?? '', tag: item[0] }));
  const hasClass = (tag: string, name: string): boolean => (attr(tag, 'class') ?? '').split(/\s+/).includes(name);
  const carriers = (source: string, name: string): string[] =>
    elements(source)
      .filter(({ tag }) => hasClass(tag, name))
      .map((element) => element.name)
      .sort();
  const windows = (source: string): { tag: string; body: string }[] =>
    [...source.matchAll(/(<dialog\b[^>]*>)([\s\S]*?)<\/dialog>/g)].map((item) => ({
      tag: item[1] ?? '',
      body: item[2] ?? '',
    }));

  it.each([
    ['dropdown', ['dialog', 'nav']],
    ['mega-menu', ['dialog', 'nav']],
    ['sidebar', ['dialog']],
  ] as const)('%s: схема меню 2 — color-scheme-2 только на ряду меню и на окне бургер-меню', async (type, names) => {
    const source = await html({ settings: { 'menu-type': type, ...MENU_SCHEME } });
    expect(carriers(source, 'color-scheme-2')).toEqual(names);
  });

  it.each(TYPES)('%s: класс схемы — на окне с пунктами меню, не на окне поиска', async (type) => {
    const found = windows(await html({ settings: { 'menu-type': type, ...MENU_SCHEME } }));
    const menu = found.filter(({ body }) => body.includes('<details'));
    const search = found.filter(({ body }) => !body.includes('<details'));
    expect(menu.map(({ tag }) => hasClass(tag, 'color-scheme-2'))).toEqual([true]);
    expect(search.map(({ tag }) => hasClass(tag, 'color-scheme-2'))).toEqual([false]);
  });

  it('схема меню не задана — класса color-scheme нет нигде, шапка целиком в схеме обёртки', async () => {
    for (const type of TYPES) {
      expect(await html({ settings: { 'menu-type': type } })).not.toContain('color-scheme-');
      expect(await html({ settings: { 'menu-type': type, 'color-scheme': '' } })).not.toContain('color-scheme-');
    }
  });

  it('схема обёртки 1, схема меню 2: color-scheme-1 только на <merfy-section>, color-scheme-2 на ряду меню и окне', async () => {
    const sections: SectionsRender = {
      modules: new Map([[hash, module]]),
      render: () => html({ settings: MENU_SCHEME }),
    };
    const placed: PlacedSection = {
      id: 'header-1',
      name: 'shop:header',
      hash,
      settings: {},
      wrapper: resolveWrapperView(sectionManifest, { scheme: 'scheme-1' }).view,
    };
    const page = await renderSection(placed, sections, 'live');
    expect(carriers(page, 'color-scheme-1')).toEqual(['merfy-section']);
    expect(carriers(page, 'color-scheme-2')).toEqual(['dialog', 'nav']);
  });
});

describe('«Шапка»: «Избранное» включено и выключено (блок 10, часть 10б, Р10б-13)', () => {
  // Находка проверки dev 25.10: при wishlist-enabled:false в ряду компьютера top-left ссылка /wishlist оставалась —
  // ветка без условия. Здесь — каждый ряд шапки: выключено — ссылки нет нигде, включено — у каждой ссылки число.
  it.each(POSITIONS)('положение %s: «Избранное» выключено — ссылки /wishlist нет нигде', async (position) => {
    const source = await html({ settings: { 'logo-position': position }, theme: { 'wishlist-enabled': false } });
    expect(source).not.toContain('/wishlist');
    expect(source).not.toContain('aria-label="Избранное"');
  });

  it.each(POSITIONS)('положение %s: выключено — «Корзина» и «Профиль» на месте', async (position) => {
    const source = await html({ settings: { 'logo-position': position }, theme: { 'wishlist-enabled': false } });
    expect(source).toContain('href="/cart"');
    expect(source).toContain('aria-label="Корзина"');
    expect(source).toContain('aria-label="Профиль"');
  });

  it.each(POSITIONS)('положение %s: включено — у каждой ссылки /wishlist число favorites-count', async (position) => {
    const source = await html({ settings: { 'logo-position': position } });
    const links = source.match(/href="\/wishlist"/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(source.match(/data-ref="favorites-count"/g)?.length).toBe(links.length);
  });
});
