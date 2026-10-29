import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_LIST_QUERY,
  money,
  sha256,
  type ListProductCard,
  type PageList,
  type RenderBlock,
  type SettingValues,
} from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveSectionBlocks } from '../src/blocks';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { settingFieldsOf } from '../src/fields';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// Карточка товара у «Каталога», «Коллекции» и «Коллекции товаров» — одна: параметры и вид у всех трёх одни, и у них
// одна разметка. В шаблоне секции нет ни `import`, ни общих кусков (template.md), поэтому разметку карточки держит
// проверка: любая правка карточки в одной секции без остальных — красный тест. Рендер — настоящий процесс рендера.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const SECTIONS = ['catalog', 'collection', 'collection-products'] as const;
type Name = (typeof SECTIONS)[number];

const read = (name: Name, file: string): string => readFileSync(`${SHOP}/${name}/${file}`, 'utf8');
const manifests = new Map<Name, SectionManifest>();
const manifestOf = (name: Name): SectionManifest => {
  const manifest = manifests.get(name);
  if (manifest === undefined) throw new Error(`manifest ${name}`);
  return manifest;
};

// Карточка — от `<li` после `.map((card) =>` до своего `</li>`: внутри неё вложенных списков нет. Отступы разные.
const flat = (source: string): string => source.replace(/^\s+/gm, '').trim();
function cardMarkup(name: Name): string {
  const template = read(name, 'template.astro');
  const start = template.search(/\.map\(\(card\) => \(\s*<li/);
  const end = template.indexOf('</li>', start);
  return flat(template.slice(start, end + '</li>'.length));
}
const scriptBody = (name: Name): string =>
  flat(read(name, 'script.ts').slice(read(name, 'script.ts').indexOf('const QUANTITY_MIN')));

const CARD_FIELDS = [
  'button-style',
  'aspect-ratio',
  'caption-case',
  'image-fit',
  'next-photo',
  'quick-add',
  'swatches',
  'favorite',
  'columns',
  'columns-mobile',
];
const shapeOf = (name: Name, id: string): unknown => {
  const field = settingFieldsOf(manifestOf(name).settings).find((item) => item.id === id);
  // Значение по умолчанию у секций своё (на главной кнопки нет, в каталоге есть) — остальное одно.
  const setting: Record<string, unknown> = { ...field?.setting };
  delete setting.default;
  if (id === 'columns') delete setting.max;
  return { label: field?.label, setting };
};

describe('карточка товара: одна на три секции', () => {
  it.each(SECTIONS.slice(1))('разметка карточки у «%s» такая же, как у «Каталога»', (name) => {
    expect(cardMarkup(name)).toBe(cardMarkup('catalog'));
    expect(cardMarkup('catalog')).toContain('data-ref="card"');
  });

  it('строка карточки несёт scheme-card: «Цветовая схема карточки товара» темы доходит до подложки', () => {
    expect(cardMarkup('catalog')).toMatch(/<li class="scheme-card group\/card /);
  });

  it.each(SECTIONS.slice(1))('скрипт карточки у «%s» такой же, как у «Каталога»', (name) => {
    expect(scriptBody(name)).toBe(scriptBody('catalog'));
  });

  it.each(SECTIONS.slice(1))('поля карточки у «%s» — те же подписи, виды и значения, что у «Каталога»', (name) => {
    for (const id of CARD_FIELDS) expect(shapeOf(name, id), id).toEqual(shapeOf('catalog', id));
  });

  it.each(SECTIONS)('«%s»: без `style`, `<style>` и своего CSS', (name) => {
    expect(read(name, 'template.astro')).not.toMatch(/\sstyle=|<style/);
  });

  it('образец цвета — SVG с заливкой атрибутом fill, а не style', () => {
    expect(cardMarkup('catalog')).toMatch(/<rect width="20" height="20" fill=\{color\.swatch\} \/>/);
  });
});

const CARDS: ListProductCard[] = [
  {
    id: 'p-1',
    title: 'Шарф «Нова»',
    url: '/product/sharf-nova',
    price: money(190000),
    compareAtPrice: money(250000),
    image: 'https://s3.merfy.ru/p/1.jpg',
    available: true,
    images: ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg'],
    variantId: 'v-1',
    colors: [
      { title: 'Синий', swatch: '#1d4ed8' },
      { title: 'Серый', swatch: '#9ca3af' },
    ],
    hasVariants: true,
  },
  {
    id: 'p-2',
    title: 'Варежки «Иней»',
    url: '/product/varezhki',
    price: money(120000),
    compareAtPrice: null,
    image: null,
    available: false,
    images: [],
    variantId: null,
    colors: [],
    hasVariants: false,
  },
  {
    id: 'p-3',
    title: 'Плед',
    url: '/product/pled',
    price: money(350000),
    compareAtPrice: null,
    image: 'https://s3.merfy.ru/p/3.jpg',
    available: true,
    images: ['https://s3.merfy.ru/p/3.jpg'],
    variantId: null,
    colors: [],
    hasVariants: false,
  },
];

const LIST = (overrides: Partial<PageList> = {}): PageList => ({
  kind: 'products',
  items: CARDS,
  total: 3,
  totalLabel: '3 товара',
  page: 1,
  pages: 1,
  perPage: 12,
  url: '/catalog',
  prev: null,
  next: null,
  links: [{ page: 1, url: '/catalog', current: true }],
  query: EMPTY_LIST_QUERY,
  sorts: [
    { value: 'popular', label: 'По популярности', selected: false },
    { value: 'newest', label: 'По новизне', selected: true },
    { value: 'price_asc', label: 'По возрастанию цены', selected: false },
  ],
  facets: {
    price: { min: money(120000), max: money(350000) },
    groups: [{ key: 'цвет', name: 'Цвет', values: [{ value: 'Синий', selected: false }] }],
    collections: [{ slug: 'pledy', title: 'Пледы', selected: false }],
  },
  ...overrides,
});

const COLLECTION = {
  id: 'c-1',
  title: 'Пледы',
  slug: 'pledy',
  url: '/collections/pledy',
  description: 'Для холодных вечеров',
  images: [],
  productsCount: 3,
  products: CARDS,
};
const ALL_PRODUCTS = { ...COLLECTION, id: '', title: '', slug: '', url: '', description: '' };
const BLOCKS: Record<Name, RenderBlock[]> = {
  catalog: [
    { id: 'filters-1', type: 'filters', settings: { 'filter-position': 'side' } },
    { id: 'sort-1', type: 'sort', settings: {} },
  ],
  collection: [],
  'collection-products': [
    {
      id: 'view-all-1',
      type: 'view-all',
      settings: { 'button-label': 'Смотреть все товары', 'button-style': 'primary' },
    },
  ],
};

const renderers = new Map<
  Name,
  { renderer: SectionRenderer; module: string; hash: string; manifest: SectionManifest }
>();
// Значения по умолчанию из section.json: у «Выбора коллекции» их нет — значение приходит записью (`records`).
function defaultsOf(manifest: SectionManifest): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const field of settingFieldsOf(manifest.settings)) {
    const value: unknown = 'default' in field.setting ? field.setting.default : undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[field.id] = value;
  }
  return values;
}

beforeAll(async () => {
  for (const name of SECTIONS) {
    const files = await readSectionFolder(`${SHOP}/${name}`);
    const manifest = readManifest(files);
    if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
    manifests.set(name, manifest.value);
    const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    renderers.set(name, {
      renderer: startSectionRenderer(),
      module: checked.render,
      hash: sha256(Buffer.from(checked.render, 'utf8')),
      manifest: manifest.value,
    });
  }
});

afterAll(async () => {
  await Promise.all([...renderers.values()].map((item) => item.renderer.close()));
});

interface Variant {
  settings?: SettingValues;
  theme?: SettingValues;
  list?: PageList;
  page?: { id: string; path: string };
  blocks?: RenderBlock[];
  collection?: object | null;
}

async function html(name: Name, variant: Variant = {}): Promise<string> {
  const item = renderers.get(name);
  if (item === undefined) throw new Error(name);
  const onList = name === 'catalog';
  return item.renderer.render({
    section: `shop:${name}`,
    hash: item.hash,
    module: item.module,
    settings: { ...defaultsOf(item.manifest), ...variant.settings },
    blocks: variant.blocks ?? BLOCKS[name],
    theme: variant.theme ?? {},
    page: variant.page ?? {
      id: onList ? 'catalog' : 'home',
      path: onList ? '/catalog' : '/',
      ...(onList ? { list: variant.list ?? LIST() } : {}),
    },
    records: { collection: variant.collection === undefined ? COLLECTION : variant.collection },
  });
}

const tags = (source: string, pattern: string): string[] => source.match(new RegExp(`<${pattern}[^>]*>`, 'g')) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const gridOf = (source: string): string => tags(source, 'ul\\b[^>]*data-columns=')[0] ?? '';
const cardTags = (source: string): string[] => tags(source, 'li\\b[^>]*data-ref="card"');
const buttons = (source: string, action: string): string[] =>
  tags(source, `(?:button|a)\\b[^>]*data-action="${action}"`);

describe.each(SECTIONS)('«%s»: параметры карточки', (name) => {
  it.each([
    ['aspect-ratio', ['portrait', 'square', 'landscape', 'auto']],
    ['image-fit', ['cover', 'contain']],
    ['button-style', ['primary', 'secondary', 'link']],
    ['caption-case', ['normal', 'uppercase']],
    ['swatches', ['none', 'square', 'circle']],
    ['columns-mobile', ['1', '2']],
  ] as const)('%s — признак на сетке и вариант класса для каждого значения', async (id, values) => {
    const template = read(name, 'template.astro');
    for (const value of values) {
      expect(attr(gridOf(await html(name, { settings: { [id]: value } })), `data-${id}`), `${id}=${value}`).toBe(value);
    }
    // Вид по значению — вариантами классов на потомках, без ветвления в шаблоне.
    const variants = values.filter((value) => template.includes(`data-[${id}=${value}]:`));
    expect(variants.length, id).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('колонки на компьютере %s — признак и классы сетки', async (columns) => {
    const grid = gridOf(await html(name, { settings: { columns } }));
    expect(attr(grid, 'data-columns')).toBe(String(columns));
    const classes = (attr(grid, 'class') ?? '').split(/\s+/);
    expect(classes).toContain(`md:data-[columns=${columns}]:grid-cols-${Math.min(columns, 3)}`);
  });

  it('карточки одной высоты: flex-колонка на всю ячейку, фото в рамке пропорций, название в две строки', async () => {
    const source = await html(name);
    const [first = ''] = cardTags(source);
    expect((attr(first, 'class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'h-full', 'flex-col']));
    expect(source).toMatch(/in-data-\[aspect-ratio=square\]:aspect-square/);
    expect(source).toContain('line-clamp-2');
  });

  it('цена, старая цена и «−N %»: скидка только у товара со старой ценой', async () => {
    const source = await html(name);
    expect(source).toContain(money(190000).text);
    expect(source).toContain(`<s class="text-sm text-price-old">${money(250000).text}</s>`);
    expect(source.match(/−24 %/g)).toHaveLength(1);
  });

  it('«Нет в наличии»: бейдж у каждой карточки, виден только при data-available="false"', async () => {
    const source = await html(name);
    expect(cardTags(source).map((tag) => attr(tag, 'data-available'))).toEqual(['true', 'false', 'true']);
    expect(source.match(/Нет в наличии/g)).toHaveLength(3);
    expect(source).toContain('in-data-[available=true]:hidden');
  });

  it('фото: второе фото при наведении — признак data-hover-next из «Следующего фото»', async () => {
    for (const value of [true, false]) {
      const source = await html(name, { settings: { 'next-photo': value } });
      expect(source).toContain(`data-hover-next="${String(value)}"`);
    }
    expect(await html(name)).toContain('data-photos="https://s3.merfy.ru/p/1.jpg https://s3.merfy.ru/p/2.jpg"');
  });

  it('товар без фото — заглушка, а не битая картинка', async () => {
    const source = await html(name);
    expect(source.match(/<img /g)).toHaveLength(2);
  });

  it('образцы цветов: у товара с цветами — SVG-заливка каждого цвета, «Нет» — ни одного', async () => {
    const withColors = await html(name, { settings: { swatches: 'circle' } });
    expect(withColors).toContain('fill="#1d4ed8"');
    expect(withColors).toContain('fill="#9ca3af"');
    expect(withColors).not.toMatch(/\sstyle=/);
    const none = await html(name, { settings: { swatches: 'none' } });
    expect(none).not.toContain('fill="#1d4ed8"');
  });

  // Проверка вёрстки look: ссылка короче 44 px на телефоне — находка tap-small.
  it('название товара — ссылка не ниже 44 px на телефоне', async () => {
    const source = await html(name);
    const links = source.match(/<a class="line-clamp-2[^"]*"/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toContain('min-h-11');
  });

  // Квадрат — без скругления: радиус «бейджа» у темы бывает 12 px, на образце 20 px это уже круг.
  it('образцы цветов: кружок — rounded-full, у квадрата нет класса скругления', async () => {
    const source = await html(name, { settings: { swatches: 'square' } });
    const swatch = source.match(/<span class="[^"]*size-5[^"]*" role="listitem"/)?.[0] ?? '';
    expect(swatch).toContain('in-data-[swatches=circle]:rounded-full');
    expect(swatch).not.toContain('rounded-badge');
  });

  it('сердечко: действие favorites.toggle с id товара, aria-pressed="false" до скрипта', async () => {
    const source = await html(name, { theme: { 'wishlist-enabled': true } });
    const hearts = buttons(source, 'favorites.toggle');
    expect(hearts.map((tag) => attr(tag, 'data-product-id'))).toEqual(['p-1', 'p-2', 'p-3']);
    for (const heart of hearts) {
      expect(attr(heart, 'aria-pressed')).toBe('false');
      expect(attr(heart, 'aria-label')).toBe('В избранное');
      expect(attr(heart, 'data-ref')).toBe('heart');
    }
  });

  it('сердечко скрыто: «Избранное» — «Скрыть» или избранное выключено в «Настройках темы»', async () => {
    expect(buttons(await html(name, { settings: { favorite: false } }), 'favorites.toggle')).toEqual([]);
    expect(buttons(await html(name, { theme: { 'wishlist-enabled': false } }), 'favorites.toggle')).toEqual([]);
  });

  it('быстрое добавление «Нет»: кнопок «В корзину» нет', async () => {
    expect(buttons(await html(name, { settings: { 'quick-add': 'none' } }), 'cart.add')).toEqual([]);
  });

  it.each(['standard', 'count'])(
    'быстрое добавление «%s»: кнопка с товаром и сочетанием по умолчанию, штуки — data-quantity',
    async (mode) => {
      const source = await html(name, { settings: { 'quick-add': mode } });
      const adds = buttons(source, 'cart.add');
      expect(adds.map((tag) => attr(tag, 'data-product-id'))).toEqual(['p-1', 'p-2', 'p-3']);
      expect(attr(adds[0] ?? '', 'data-variant-id')).toBe('v-1');
      expect(attr(adds[2] ?? '', 'data-variant-id')).toBeNull();
      expect(adds.every((tag) => attr(tag, 'data-quantity') === '1' && attr(tag, 'data-ref') === 'buy')).toBe(true);
      // Распроданному кнопка скрыта признаком карточки (класс варианта у обёртки), а не удалена из разметки.
      expect(source).toContain('in-data-[available=false]:hidden');
      expect(source.includes('data-action="less"')).toBe(mode === 'count');
      expect(source.includes('data-action="more"')).toBe(mode === 'count');
    },
  );

  it('быстрое добавление «Плюс на фото» и «На фото при наведении»: кнопка внутри рамки фото', async () => {
    const plus = await html(name, { settings: { 'quick-add': 'button' } });
    expect(buttons(plus, 'cart.add')).toHaveLength(3);
    expect(plus).toContain('aria-label="В корзину: Шарф «Нова»"');
    const hover = await html(name, { settings: { 'quick-add': 'hover' } });
    expect(buttons(hover, 'cart.add')).toHaveLength(3);
    expect(hover).toContain('md:group-hover/card:opacity-100');
    expect(hover).toContain('focus-visible:opacity-100');
  });

  it.each(['button', 'hover'])('«Стиль кнопки» действует и в режиме «%s»: вид кнопки по значению у сетки', async (mode) => {
    const [add = ''] = buttons(await html(name, { settings: { 'quick-add': mode } }), 'cart.add');
    const classes = attr(add, 'class') ?? '';
    for (const style of ['primary', 'secondary', 'link'])
      expect(classes, style).toContain(`in-data-[button-style=${style}]:bg-`);
    // Заливка и рамка основной кнопки не заданы без значения: иначе стиль «Ссылка» остался бы с заливкой.
    expect(classes.split(/\s+/)).not.toContain('bg-primary');
  });

  it('кнопки на телефоне не ниже 44 px: у быстрого добавления h-11, у сердечка size-11', async () => {
    const source = await html(name, { settings: { 'quick-add': 'count' } });
    for (const tag of [
      ...buttons(source, 'cart.add'),
      ...buttons(source, 'favorites.toggle'),
      ...buttons(source, 'less'),
    ]) {
      expect(attr(tag, 'class') ?? '').toMatch(/\b(?:h-11|size-11)\b/);
    }
  });
});

describe('«Каталог»: список страницы', () => {
  it('фильтры сбоку — признак на корне, форма и список делят колонки; сверху — признак false', async () => {
    const side = await html('catalog');
    expect(attr(tags(side, 'div\\b[^>]*data-behavior="catalog"')[0] ?? '', 'data-filters-side')).toBe('true');
    expect(side).toContain('md:in-data-[filters-side=true]:col-span-1');
    expect(side).toContain('md:in-data-[filters-side=true]:col-span-3');
    const top = await html('catalog', {
      blocks: [
        { id: 'filters-1', type: 'filters', settings: { 'filter-position': 'top' } },
        { id: 'sort-1', type: 'sort', settings: {} },
      ],
    });
    expect(attr(tags(top, 'div\\b[^>]*data-behavior="catalog"')[0] ?? '', 'data-filters-side')).toBe('false');
  });

  it('фильтры на телефоне — шторка dialog: кнопка открытия, окно с крестиком и «Показать» внутри формы filters', async () => {
    const source = await html('catalog');
    const form = source.indexOf('data-part="filters"');
    const wrapper = source.indexOf('data-behavior="dialog"');
    const dialog = source.indexOf('<dialog');
    expect(form).toBeGreaterThan(-1);
    expect(form).toBeLessThan(wrapper);
    expect(wrapper).toBeLessThan(dialog);
    expect(tags(source, 'button\\b[^>]*data-part="open"')).toHaveLength(1);
    expect(tags(source, 'button\\b[^>]*data-part="close"')).toHaveLength(1);
    expect(tags(source, 'button\\b[^>]*type="submit"')).toHaveLength(1);
    expect(source).toContain('data-transition="drawer"');
    expect(source).toContain('data-side="left"');
    // На компьютере кнопка, заголовок шторки и «Показать» скрыты, окно стоит в потоке.
    expect(attr(tags(source, 'button\\b[^>]*data-part="open"')[0] ?? '', 'class')).toContain('md:hidden');
    expect(attr(tags(source, 'dialog\\b[^>]*')[0] ?? '', 'class')).toContain('md:static');
  });

  it('без блоков «Фильтры» и «Сортировка» формы нет — как «Каталог» на главной заготовки', async () => {
    const source = await html('catalog', { blocks: [] });
    expect(source).not.toContain('data-part="filters"');
    expect(source).not.toContain('name="sort"');
    expect(source).toContain('data-part="list"');
  });

  const radios = (source: string, name: string): string[] =>
    tags(source, `input\\b[^>]*type="radio"[^>]*name="${name}"`);
  const groupOf = (source: string, group: string): string =>
    tags(source, `details\\b[^>]*data-group="${group}"`)[0] ?? '';
  const GROUPS = ['sort', 'availability', 'price', 'filter.цвет', 'collections'];

  it('фильтры — сворачиваемые группы как у flux: заголовок со шевроном и пункты-радио; порядок блоков не важен', async () => {
    const source = await html('catalog');
    const found = tags(source, 'details\\b[^>]*data-group=').map((tag) => attr(tag, 'data-group'));
    expect([...found].sort()).toEqual([...GROUPS].sort());
    // Заголовок группы — summary с подписью и шевроном; сортировка в узкой колонке и в шторке — первой.
    for (const title of ['Сортировать', 'Наличие', 'Стоимость', 'Цвет', 'Коллекции'])
      expect(source).toMatch(new RegExp(`<summary[^>]*>\\s*<span>${title}</span>\\s*<svg`));
    expect(source).toContain('data-type="sort"');
    expect(source).toContain('data-type="filters"');
    expect(source).toContain('data-behavior="accordion"');
    expect(source).toContain('data-part="content"');
  });

  it('сортировка — радио с пунктами страницы, выбран текущий; «Наличие» — Все, В наличии, Распродано', async () => {
    const source = await html('catalog');
    expect(radios(source, 'sort').map((tag) => attr(tag, 'value'))).toEqual(['popular', 'newest', 'price_asc']);
    expect(radios(source, 'sort').map((tag) => /\schecked/.test(tag))).toEqual([false, true, false]);
    expect(radios(source, 'availability').map((tag) => attr(tag, 'value'))).toEqual(['', 'in_stock', 'sold_out']);
    expect(radios(source, 'availability').map((tag) => /\schecked/.test(tag))).toEqual([true, false, false]);
    for (const title of ['Все', 'В наличии', 'Распродано']) expect(source).toContain(`<span>${title}</span>`);
    expect(source).not.toContain('<select');
  });

  it('цена — два поля с подчёркиванием, подсказка — границы каталога в рублях, знак ₽; применяются по Enter и потере фокуса', async () => {
    const source = await html('catalog');
    const [min = '', max = ''] = tags(source, 'input\\b[^>]*name="m(?:in|ax)_price"');
    expect(attr(min, 'placeholder')).toBe('1200');
    expect(attr(max, 'placeholder')).toBe('3500');
    // Текстовое поле без стрелок; применение — событие change формы (Enter, уход фокуса), не каждое нажатие.
    expect(attr(min, 'type')).toBe('text');
    expect(attr(min, 'inputmode')).toBe('numeric');
    expect(source.match(/<span aria-hidden="true">₽<\/span>/g)).toHaveLength(2);
    expect(source).toContain('border-b border-border');
  });

  it('значения цены и наличия выбраны из адреса', async () => {
    const source = await html('catalog', {
      list: LIST({ query: { ...EMPTY_LIST_QUERY, minPrice: 1500, maxPrice: 3000, availability: 'in_stock' } }),
    });
    expect(source).toMatch(/name="min_price"[^>]*value="1500"/);
    expect(source).toMatch(/name="max_price"[^>]*value="3000"/);
    expect(radios(source, 'availability').map((tag) => /\schecked/.test(tag))).toEqual([false, true, false]);
  });

  it('группы вариантов — пункты-флажки в виде кружков (несколько значений), коллекции — радио с «Все»', async () => {
    const source = await html('catalog');
    expect(tags(source, 'input\\b[^>]*type="checkbox"[^>]*name="filter\\.цвет"')).toHaveLength(1);
    expect(radios(source, 'collection').map((tag) => attr(tag, 'value'))).toEqual(['', 'pledy']);
    expect(radios(source, 'collection').map((tag) => /\schecked/.test(tag))).toEqual([true, false]);
    const chosen = await html('catalog', {
      list: LIST({
        facets: {
          price: null,
          groups: [{ key: 'цвет', name: 'Цвет', values: [{ value: 'Синий', selected: true }] }],
          collections: [{ slug: 'pledy', title: 'Пледы', selected: true }],
        },
      }),
    });
    expect(tags(chosen, 'input\\b[^>]*name="filter\\.цвет"').map((tag) => /\schecked/.test(tag))).toEqual([true]);
    expect(radios(chosen, 'collection').map((tag) => /\schecked/.test(tag))).toEqual([false, true]);
    // Нет границ цены — нет и группы «Стоимость».
    expect(chosen).not.toContain('data-group="price"');
  });

  it('сбоку группы раскрыты; сверху свёрнуты и открываются панелью (вид rose, satin, bloom)', async () => {
    const side = await html('catalog');
    for (const group of GROUPS) expect(groupOf(side, group), group).toMatch(/\sopen[\s>=]/);
    const top = await html('catalog', {
      blocks: [
        { id: 'filters-1', type: 'filters', settings: { 'filter-position': 'top' } },
        { id: 'sort-1', type: 'sort', settings: {} },
      ],
    });
    for (const group of GROUPS) expect(groupOf(top, group), group).not.toMatch(/\sopen[\s>=]/);
    expect(top).toContain('md:in-data-[filters-side=false]:absolute');
  });

  it('только сортировка — форма и группа «Сортировать» есть, групп фильтров нет; только фильтры — наоборот', async () => {
    const onlySort = await html('catalog', { blocks: [{ id: 'sort-1', type: 'sort', settings: {} }] });
    expect(onlySort).toContain('data-group="sort"');
    expect(onlySort).not.toContain('data-group="availability"');
    const onlyFilters = await html('catalog', {
      blocks: [{ id: 'filters-1', type: 'filters', settings: { 'filter-position': 'side' } }],
    });
    expect(onlyFilters).not.toContain('data-group="sort"');
    expect(onlyFilters).toContain('data-group="availability"');
  });

  it('подзаголовок — поле секции под заголовком, вне формы фильтров и шторки; с «К» и «Ж»; пустой — абзаца нет', async () => {
    const source = await html('catalog', { settings: { subheading: 'Подберите <em>товар</em>' } });
    const subtitle = /<p class="[^"]*text-muted-foreground[^"]*">Подберите <em>товар<\/em><\/p>/.exec(source);
    expect(subtitle).not.toBeNull();
    const formAt = source.indexOf('data-part="filters"');
    expect(formAt).toBeGreaterThan(0);
    expect(subtitle?.index).toBeLessThan(formAt);
    expect(source.indexOf('Подберите', formAt)).toBe(-1);
    expect(await html('catalog')).not.toContain('Подберите');
  });

  it('старая копия: блок «Подзаголовок» ушёл из типов — его пропускают с пометкой, фильтры и сортировка целы', () => {
    const manifest = manifestOf('catalog');
    expect(Object.keys(manifest.blocks ?? {})).toEqual(['filters', 'sort']);
    const resolved = resolveSectionBlocks(manifest, [
      { id: 'subheading-1', type: 'subheading', settings: { heading: 'Подберите товар' } },
      { id: 'sort-1', type: 'sort', settings: {} },
    ]);
    expect(resolved.blocks.map((block) => block.type)).toEqual(['sort']);
    expect(resolved.invalid).toEqual(['blocks.0.type: типа subheading у секции нет']);
  });

  it('поиск ?q=: строка «Результаты поиска» и скрытое поле q в форме — фильтры его не теряют', async () => {
    const source = await html('catalog', { list: LIST({ query: { ...EMPTY_LIST_QUERY, q: 'фут' } }) });
    expect(source).toContain('Результаты поиска: «фут»');
    expect(source).toMatch(/<input type="hidden" name="q" value="фут"/);
    expect(await html('catalog')).not.toContain('Результаты поиска');
  });

  it('пустой результат: сообщение и ссылка «Показать все товары», списка карточек нет', async () => {
    const source = await html('catalog', { list: LIST({ items: [], total: 0, links: [] }) });
    expect(source).toContain('data-part="empty"');
    expect(source).toContain('Ничего не нашли');
    expect(source).toContain('Показать все товары');
    expect(cardTags(source)).toEqual([]);
  });

  it.each([
    ['pages', 'data-part="pages"'],
    ['more', 'data-part="next"'],
    ['scroll', 'data-part="next"'],
  ])('«Как листать» %s: поведение catalog с data-paging и частями списка', async (paging, part) => {
    const list = LIST({
      pages: 2,
      next: '/catalog/page/2',
      links: [
        { page: 1, url: '/catalog', current: true },
        { page: 2, url: '/catalog/page/2', current: false },
      ],
    });
    const source = await html('catalog', { settings: { paging }, list });
    expect(source).toContain(`data-behavior="catalog"`);
    expect(attr(tags(source, 'div\\b[^>]*data-behavior="catalog"')[0] ?? '', 'data-paging')).toBe(paging);
    expect(source).toContain(part);
  });

  it('число товаров — «3 товара» под списком, слева; заголовок: на /catalog — h1, на главной — h2, с «К» и «Ж»', async () => {
    const onCatalog = await html('catalog', { settings: { heading: 'Всё <strong>сразу</strong>' } });
    expect(onCatalog).toMatch(/<\/ul>\s*<p class="[^"]*">3 товара<\/p>/);
    expect(onCatalog).not.toContain('Товаров: 3');
    expect(onCatalog).toMatch(/<h1[^>]*>Всё <strong>сразу<\/strong><\/h1>/);
    const onHome = await html('catalog', {
      settings: { heading: 'Всё <strong>сразу</strong>' },
      page: { id: 'home', path: '/' },
    });
    expect(onHome).toMatch(/<h2[^>]*>Всё <strong>сразу<\/strong><\/h2>/);
    expect(onHome).not.toContain('<h1');
  });

  it('значения заготовки на главной — заголовок «Товары», 4 колонки, без блоков — рисуются без отказа', async () => {
    const source = await html('catalog', { settings: { heading: 'Товары', columns: 4 }, blocks: [] });
    expect(attr(gridOf(source), 'data-columns')).toBe('4');
    expect(source).toContain('Товары');
  });
});

describe('«Коллекция товаров»', () => {
  it('«Карточки» режут список: 2 из 3; вся коллекция — при 24', async () => {
    expect(cardTags(await html('collection-products', { settings: { cards: 2 } }))).toHaveLength(2);
    expect(cardTags(await html('collection-products', { settings: { cards: 24 } }))).toHaveLength(3);
  });

  it('заголовок и текст с «К» и «Ж»; размеры — признаками на корне', async () => {
    const source = await html('collection-products', {
      settings: {
        heading: 'Топ <em>недели</em>',
        text: 'Только <strong>лучшее</strong>',
        'heading-size': 'large',
        'text-size': 'medium',
      },
    });
    expect(source).toMatch(/<h2[^>]*>Топ <em>недели<\/em><\/h2>/);
    expect(source).toContain('Только <strong>лучшее</strong>');
    expect(source).toContain('data-heading-size="large"');
    expect(source).toContain('data-text-size="medium"');
  });

  it('пустые заголовок и текст — блока заголовка нет', async () => {
    const source = await html('collection-products', { settings: { heading: '', text: '' } });
    expect(source).not.toContain('<h2');
  });

  it('«Смотреть все»: блок ведёт в выбранную коллекцию, без коллекции — в /catalog; блока нет — ссылки нет', async () => {
    const chosen = await html('collection-products');
    expect(chosen).toMatch(/<a [^>]*href="\/collections\/pledy"[^>]*>Смотреть все товары<\/a>/);
    const all = await html('collection-products', { collection: ALL_PRODUCTS });
    expect(all).toMatch(/<a [^>]*href="\/catalog"[^>]*>Смотреть все товары<\/a>/);
    expect(await html('collection-products', { blocks: [] })).not.toContain('Смотреть все товары');
  });

  it.each(['primary', 'secondary', 'link'])('«Смотреть все»: стиль кнопки %s — признак на блоке', async (style) => {
    const source = await html('collection-products', {
      blocks: [{ id: 'view-all-1', type: 'view-all', settings: { 'button-label': 'Ещё', 'button-style': style } }],
    });
    expect(source).toContain(`data-button-style="${style}"`);
    expect(source).toContain('>Ещё</a>');
  });

  it('у коллекции нет товаров — сообщение вместо сетки и без кнопки «Смотреть все»', async () => {
    const source = await html('collection-products', { collection: { ...COLLECTION, products: [], productsCount: 0 } });
    expect(source).toContain('В этой коллекции пока нет товаров');
    expect(source).not.toContain('data-columns=');
    expect(source).not.toContain('Смотреть все товары');
  });

  it('магазин без товаров: поле коллекции пустое — секция не ломается', async () => {
    const source = await html('collection-products', { collection: null });
    expect(source).not.toContain('data-columns=');
  });
});

describe('«Коллекция»: страница коллекции', () => {
  it('название, описание и число товаров из записи, затем сетка карточек', async () => {
    const source = await html('collection');
    expect(source).toMatch(/<h1[^>]*>Пледы<\/h1>/);
    expect(source).toContain('Для холодных вечеров');
    expect(source).toContain('Товаров: 3');
    expect(cardTags(source)).toHaveLength(3);
  });

  it('у коллекции нет товаров — сообщение', async () => {
    const source = await html('collection', { collection: { ...COLLECTION, products: [], productsCount: 0 } });
    expect(source).toContain('В этой коллекции пока нет товаров');
  });
});
