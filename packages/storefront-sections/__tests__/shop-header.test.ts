import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSection, sha256, type PlacedSection, type SectionsRender, type SettingValues } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { resolveWrapperView } from '../src/wrapper';

// «Шапка» на витрине — сводная шапка пяти тем (базовые секции, 28.10): одна разметка, положение логотипа, тип меню,
// отметка открытой страницы, заглавные и объявление — параметрами. Рендер — настоящий процесс рендера; проверяется то,
// что видит покупатель и что читают проверки (признаки, ссылки, aria-current, окна, класс схемы меню).
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
const DEFAULTS = {
  'logo-position': 'top-left',
  'menu-type': 'dropdown',
  menu: 'main',
  'active-link': 'color',
  capitals: 'logo',
  announcement: '',
  link: '',
};

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
    settings: { ...DEFAULTS, ...variant.settings },
    blocks: variant.blocks ?? BLOCKS,
    menus: { menu: MENU },
    theme: variant.theme ?? {},
    shop: SHOP,
    page: variant.page ?? HOME,
  });

const tags = (source: string, pattern: string): string[] => source.match(new RegExp(`<${pattern}[^>]*>`, 'g')) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const hasFlag = (tag: string, name: string): boolean => new RegExp(`\\s${name}(?=[\\s=>/])`).test(tag);
const classesOf = (tag: string): string[] => (attr(tag, 'class') ?? '').split(/\s+/);
const dialogs = (source: string): string[] => tags(source, '[a-z][a-z0-9-]*\\b[^>]*data-behavior="dialog"');
const root = (source: string): string => tags(source, 'div\\b[^>]*data-logo-position=')[0] ?? '';
const current = (source: string): (string | null)[] =>
  tags(source, 'a\\b')
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => attr(tag, 'href'));

const POSITIONS = ['top-left', 'top-center', 'center-left', 'center-absolute'];
const TYPES = ['dropdown', 'mega-menu', 'sidebar'];

describe('«Шапка»: признаки настроек на корне', () => {
  it.each(POSITIONS)('положение логотипа %s — признак, центр и число строк', async (position) => {
    const tag = root(await html({ settings: { 'logo-position': position } }));
    expect(attr(tag, 'data-logo-position')).toBe(position);
    expect(attr(tag, 'data-logo-center')).toBe(String(position === 'top-center' || position === 'center-absolute'));
    expect(attr(tag, 'data-two-rows')).toBe(String(position.startsWith('top-')));
  });

  it.each(TYPES)('тип меню %s — признак на корне', async (type) => {
    expect(attr(root(await html({ settings: { 'menu-type': type } })), 'data-menu-type')).toBe(type);
  });

  it.each([
    ['active-link', 'color'],
    ['active-link', 'underline'],
    ['capitals', 'none'],
    ['capitals', 'logo'],
    ['capitals', 'all'],
  ])('%s = %s — признак на корне', async (id, value) => {
    expect(attr(root(await html({ settings: { [id]: value } })), `data-${id}`)).toBe(value);
  });

  it('раскладка — вариантами классов по признакам, без своего CSS', () => {
    const template = readFileSync(`${FOLDER}/template.astro`, 'utf8');
    for (const variant of [
      'md:in-data-[logo-center=true]:col-start-2',
      'md:in-data-[two-rows=false]:row-start-1',
      'in-data-[active-link=underline]:aria-[current=page]:underline',
      'in-data-[capitals=logo]:uppercase',
      'in-data-[capitals=all]:uppercase',
      'in-data-[menu-type=mega-menu]:grid-cols-4',
    ]) {
      expect(template).toContain(variant);
    }
    expect(template).not.toMatch(/\sstyle=|<style/);
  });
});

describe('«Шапка»: меню и окно', () => {
  it.each(TYPES)('%s: одно меню компьютера (nav-menu) и одно окно меню', async (type) => {
    const source = await html({ settings: { 'menu-type': type } });
    expect(source.match(/data-behavior="nav-menu"/g)?.length).toBe(1);
    expect(dialogs(source)).toHaveLength(1);
  });

  it('выпадающее и расширенное: окно под шапкой — немодальное, drop', async () => {
    for (const type of ['dropdown', 'mega-menu']) {
      const [panel = ''] = dialogs(await html({ settings: { 'menu-type': type } }));
      expect([attr(panel, 'data-modal'), attr(panel, 'data-transition')]).toEqual(['false', 'drop']);
    }
  });

  it('боковое: модальная панель слева (drawer), меню компьютера скрыто классом', async () => {
    const source = await html({ settings: { 'menu-type': 'sidebar' } });
    const [panel = ''] = dialogs(source);
    expect([attr(panel, 'data-modal'), attr(panel, 'data-side'), attr(panel, 'data-transition')]).toEqual(['true', 'left', 'drawer']);
    const nav = tags(source, 'nav\\b')[0] ?? '';
    expect(classesOf(nav)).toContain('md:in-data-[menu-type=sidebar]:hidden');
  });

  it('пункты с подпунктами: в окне — <details>, на компьютере — кнопка и список подпунктов с третьим уровнем', async () => {
    const source = await html();
    expect(tags(source, 'details\\b')).toHaveLength(2);
    expect(tags(source, 'button\\b[^>]*data-part="trigger"')).toHaveLength(2);
    expect(tags(source, 'div\\b[^>]*data-part="content"')).toHaveLength(2);
    expect(source.match(/href="\/catalog\/scarves\/cashmere"/g)).toHaveLength(2);
  });
});

describe('«Шапка»: текущая страница', () => {
  it('на «Доставке» aria-current только у ссылок /delivery, ветки окна закрыты', async () => {
    const source = await html({ page: { id: 'page-custom-c1', path: '/delivery' } });
    expect([...new Set(current(source))]).toEqual(['/delivery']);
    expect(tags(source, 'details\\b').filter((tag) => hasFlag(tag, 'open'))).toEqual([]);
  });

  it('страница третьего уровня — отмечена в окне и в списке подпунктов', async () => {
    const source = await html({ page: { id: 'page-custom-c3', path: '/catalog/scarves/cashmere' } });
    expect(current(source)).toEqual(['/catalog/scarves/cashmere', '/catalog/scarves/cashmere']);
  });

  it('на главной, на странице вне меню и на странице 404 — aria-current нет', async () => {
    for (const page of [HOME, { id: 'page-custom-c9', path: '/elsewhere' }, { id: 'not-found', path: null }]) {
      expect(current(await html({ page }))).toEqual([]);
    }
  });
});

describe('«Шапка»: значки, поиск, логотип', () => {
  const ICONS = [
    { label: 'Поиск', element: 'button', path: 'm21 21-4.34-4.34' },
    { label: 'Избранное', element: 'a', path: 'M2 9.5a5.5 5.5 0 0 1 9.591' },
    { label: 'Корзина', element: 'a', path: 'M16 10a4 4 0 0 1-8 0' },
    { label: 'Профиль', element: 'a', path: 'M19 21v-2a4 4 0 0 0-4-4H9' },
  ] as const;
  const iconsOf = (source: string, label: string, element: string) =>
    [...source.matchAll(new RegExp(`(<${element}\\b[^>]*>)([\\s\\S]*?)</${element}>`, 'g'))]
      .filter((item) => attr(item[1] ?? '', 'aria-label') === label)
      .map((item) => ({ tag: item[1] ?? '', body: item[2] ?? '' }));

  it.each(TYPES)('%s: по одному значку на подпункт — Lucide в квадрате 44 px', async (type) => {
    const source = await html({ settings: { 'menu-type': type } });
    for (const { label, element, path } of ICONS) {
      const found = iconsOf(source, label, element);
      expect(found, label).toHaveLength(1);
      const [icon] = found;
      expect(classesOf(icon?.tag ?? ''), label).toEqual(expect.arrayContaining(['inline-flex', 'size-11', 'items-center', 'justify-center']));
      expect(icon?.body, label).toContain(path);
    }
  });

  it('поиск и «Профиль» — с 768 px (на телефоне — в окне меню), «Избранное» и «Корзина» — всегда', async () => {
    const holders = tags(await html(), 'div\\b[^>]*data-type=');
    const byType = Object.fromEntries(holders.map((tag) => [attr(tag, 'data-type'), classesOf(tag)]));
    for (const type of ['search', 'profile']) {
      expect(byType[type]).toEqual(expect.arrayContaining([`data-[type=${type}]:hidden`, `md:data-[type=${type}]:flex`]));
    }
    expect(Object.keys(byType).sort()).toEqual(['cart', 'profile', 'search', 'wishlist']);
  });

  it('значок поиска открывает панель поиска магазина (search.open), в окне меню — форма GET /catalog', async () => {
    const source = await html();
    const [search] = iconsOf(source, 'Поиск', 'button');
    expect(attr(search?.tag ?? '', 'data-action')).toBe('search.open');
    const form = tags(source, 'form\\b').find((tag) => attr(tag, 'action') === '/catalog');
    expect(form === undefined ? null : attr(form, 'method')).toBe('get');
    expect(source).toMatch(/<label\b[^>]*for="header-menu-search"/);
    expect(source).toContain('name="q"');
  });

  it('скрытый подпункт «Избранное» не выводится нигде', async () => {
    const source = await html({ blocks: BLOCKS.filter((block) => block.type !== 'wishlist') });
    expect(source).not.toContain('/wishlist');
    expect(source).not.toContain('aria-label="Избранное"');
    expect(source).toContain('href="/cart"');
  });

  it('скрытый «Поиск» — ни значка, ни формы', async () => {
    const source = await html({ blocks: BLOCKS.filter((block) => block.type !== 'search') });
    expect(source).not.toContain('name="q"');
    expect(source).not.toContain('aria-label="Поиск"');
  });

  it('скрытый «Профиль» — ни значка, ни ссылки в окне', async () => {
    const source = await html({ blocks: BLOCKS.filter((block) => block.type !== 'profile') });
    expect(source).not.toContain('data-ref="profile"');
  });

  it('корзина: cart.open и счётчик, скрытый до первого числа', async () => {
    const [cart] = iconsOf(await html(), 'Корзина', 'a');
    expect(attr(cart?.tag ?? '', 'data-action')).toBe('cart.open');
    expect(cart?.body).toMatch(/<span\b[^>]*data-ref="cart-count"[^>]*hidden/);
  });

  it('логотип: картинка темы или название магазина ссылкой на главную', async () => {
    expect(await html()).toMatch(/<a\b[^>]*href="\/"[^>]*>\s*<span class="truncate">Мой сайт<\/span>/);
    const withImage = await html({ theme: { 'logo-image': 'https://cdn.merfy.ru/logo.webp' } });
    expect(withImage).toContain('src="https://cdn.merfy.ru/logo.webp"');
  });

  it('нет style и скриптов', async () => {
    for (const type of TYPES) {
      const source = await html({ settings: { 'menu-type': type } });
      expect(source).not.toMatch(/\sstyle=/);
      expect(source).not.toContain('<script');
    }
  });
});

describe('«Шапка»: объявление', () => {
  it('пусто — строки объявления нет', async () => {
    expect(await html()).not.toContain('bg-foreground text-background');
  });

  it('текст с начертаниями без ссылки — абзац над шапкой, <em> и <strong> остаются', async () => {
    const source = await html({ settings: { announcement: 'Доставка <strong>бесплатно</strong> от <em>5 000 ₽</em>' } });
    expect(source).toMatch(/<p\b[^>]*>Доставка <strong>бесплатно<\/strong> от <em>5 000 ₽<\/em><\/p>/);
    expect(source.indexOf('Доставка')).toBeLessThan(source.indexOf('data-behavior="dialog"'));
  });

  it('со ссылкой — вся строка ссылкой не ниже 48 px', async () => {
    const source = await html({ settings: { announcement: 'Скидки недели', link: '/catalog' } });
    const link = tags(source, 'a\\b').find((tag) => source.includes(`${tag}Скидки недели`));
    expect(link === undefined ? null : attr(link, 'href')).toBe('/catalog');
    expect(classesOf(link ?? '')).toContain('min-h-12');
  });
});

describe('«Шапка»: цветовая схема меню', () => {
  // Как на проде (Р7б-8): класс схемы — на ряду меню и на окне бургер-меню; остальная шапка — в схеме обёртки.
  const MENU_SCHEME = { 'color-scheme': 'scheme-2' };
  const elements = (source: string): { name: string; tag: string }[] =>
    [...source.matchAll(/<([a-z][\w-]*)\b[^>]*>/g)].map((item) => ({ name: item[1] ?? '', tag: item[0] }));
  const carriers = (source: string, name: string): string[] =>
    elements(source)
      .filter(({ tag }) => classesOf(tag).includes(name))
      .map((element) => element.name)
      .sort();

  it.each(TYPES)('%s: схема меню 2 — color-scheme-2 только на ряду меню и на окне меню', async (type) => {
    const source = await html({ settings: { 'menu-type': type, ...MENU_SCHEME } });
    expect(carriers(source, 'color-scheme-2')).toEqual(['dialog', 'nav']);
  });

  it('схема меню не задана — класса color-scheme нет нигде, шапка целиком в схеме обёртки', async () => {
    for (const type of TYPES) {
      expect(await html({ settings: { 'menu-type': type } })).not.toContain('color-scheme-');
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

  it('«Отступы» секции — классы обёртки, без правки — отступ темы', () => {
    expect(resolveWrapperView(sectionManifest, { padding: { top: 8, bottom: 8 } }).view.classes).toEqual(
      expect.arrayContaining(['pt-2', 'pb-2']),
    );
    expect(resolveWrapperView(sectionManifest, {}).view.classes).toContain('py-section');
  });
});

describe('«Шапка»: «Избранное» включено и выключено (блок 10, часть 10б, Р10б-13)', () => {
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

  it.each(POSITIONS)('положение %s: включено — у ссылки /wishlist число favorites-count', async (position) => {
    const source = await html({ settings: { 'logo-position': position } });
    const links = source.match(/href="\/wishlist"/g) ?? [];
    expect(links).toHaveLength(1);
    expect(source.match(/data-ref="favorites-count"/g)?.length).toBe(1);
  });
});
