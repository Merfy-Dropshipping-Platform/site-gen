import { fileURLToPath } from 'node:url';
import { money, sha256, type ProductRecord, type RenderBlock } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { resolveSectionBlocks } from '../src/blocks';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { defaultSettings } from '../src/settings';
import type { SectionField, SectionValue } from '../src/fields';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// «Товар» — сводная секция пяти тем (базовые секции, 29.10): панель прода в её порядке (выбор товара, макет, размер,
// позиция фото, увеличение, динамическая кнопка, цветовая схема, отступы; подпанели прода — блоки), новые параметры —
// после, в группе «Вид»; макет, размер, счётчик и кнопки — признаками data-* на корне и вариантами in-data-[…] классов.
const FOLDER = fileURLToPath(new URL('../fixtures/shop/product', import.meta.url));
const PHOTOS = ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg', 'https://s3.merfy.ru/p/3.jpg'];

let manifest: SectionManifest;
let module: string;
let hash: string;
let renderer: SectionRenderer;

beforeAll(async () => {
  const files = await readSectionFolder(FOLDER);
  const read = readManifest(files);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  manifest = read.value;
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  module = checked.render;
  hash = sha256(Buffer.from(module, 'utf8'));
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

const SCARF: ProductRecord = {
  id: 'p-1',
  title: 'Шарф «Нова»',
  slug: 'sharf-nova',
  url: '/product/sharf-nova',
  description: 'Тёплый шарф\nиз шерсти',
  price: money(190000),
  compareAtPrice: money(250000),
  images: PHOTOS,
  available: true,
  options: [
    {
      id: 'g-color',
      name: 'Цвет',
      values: [
        { id: 'v-blue', value: 'Синий', images: [], swatch: '#1f3a93' },
        { id: 'v-red', value: 'Красный', images: [], swatch: '#c0392b' },
      ],
    },
    {
      id: 'g-size',
      name: 'Размер',
      values: [
        { id: 'v-s', value: 'S', images: [], swatch: null },
        { id: 'v-m', value: 'M', images: [], swatch: null },
      ],
    },
  ],
  variants: [],
  collections: [{ id: 'c-1', title: 'Зима', url: '/collection/zima' }],
  updatedAt: '2026-10-29T00:00:00.000Z',
};

// Значения полей — умолчания section.json, как их разбирает платформа: тест рисует то, что видит магазин без правок.
function defaultsOf(): Record<string, SectionValue> {
  const fieldsOnly = manifest.settings.filter((entry): entry is SectionField => 'id' in entry);
  return { ...defaultSettings(fieldsOnly), product: 'p-1' };
}

// Блоки по умолчанию из section.json (`defaultBlocks`); overrides — правки значений по типу блока, остальное — умолчания.
function blocksOf(overrides: Record<string, Record<string, SectionValue>> = {}): RenderBlock[] {
  const edits = (manifest.defaultBlocks ?? []).map((block, index) => ({
    id: `${block.type}-${index + 1}`,
    type: block.type,
    settings: { ...block.settings, ...overrides[block.type] },
  }));
  return resolveSectionBlocks(manifest, edits).blocks;
}

interface Options {
  settings?: Record<string, SectionValue>;
  blocks?: RenderBlock[];
  product?: Partial<ProductRecord>;
  pageId?: string;
  theme?: Record<string, SectionValue>;
}

const html = (options: Options = {}): Promise<string> =>
  renderer.render({
    section: 'shop:product',
    hash,
    module,
    settings: { ...defaultsOf(), ...options.settings },
    blocks: options.blocks ?? blocksOf(),
    records: { product: { ...SCARF, ...options.product } },
    page: { id: options.pageId ?? 'product', path: '/product/sharf-nova' },
    theme: options.theme ?? {},
  });

const root = (source: string): string => /<div[^>]*data-layout="[^"]*"[^>]*>/.exec(source)?.[0] ?? '';
const datum = (source: string, name: string): string | null => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(root(source))?.[1] ?? null;
const tagsOf = (source: string, tag: string): string[] => source.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? [];
const withAttr = (source: string, attr: string): string[] => source.match(new RegExp(`<[a-z]+\\b[^>]*\\b${attr}[^>]*>`, 'g')) ?? [];
const fields = () => manifest.settings.flatMap((entry) => ('wrapper' in entry ? [] : [entry]));
const order = (): string[] => manifest.settings.map((entry) => ('wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id));
const groupOf = (id: string): string | undefined => fields().find((field) => field.id === id)?.section;

describe('приём: без проблем и предупреждений', () => {
  it('product', async () => {
    const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(FOLDER) });
    expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
  }, 30_000);
});

describe('панель: поля прода в их порядке, новые — после, в группе «Вид»', () => {
  it('порядок полей и подписи', () => {
    expect(order()).toEqual([
      'product',
      'layout',
      'size',
      'image-position',
      'zoom',
      'buy-now',
      'wrapper:scheme',
      'wrapper:padding',
      'price',
      'counter',
      'button-size',
      'button-style',
      'discount-badge',
      'breadcrumbs',
      'favorite',
      'sold-out',
    ]);
    expect(fields().map((field) => field.label)).toEqual([
      'Выбор товара',
      'Макет',
      'Размер',
      'Позиция фото',
      'Увеличение',
      'Динамическая кнопка',
      'Стоимость',
      'Вид счётчика',
      'Размер кнопок',
      'Стиль кнопки',
      'Значок скидки',
      'Хлебные крошки',
      'Избранное',
      'Распроданное',
    ]);
    expect(groupOf('counter')).toBe('Вид');
    expect(groupOf('product')).toBeUndefined();
  });

  it('подпанели прода — блоки по одному: «Текст», «Название», «Варианты», «Количество», «Кнопки», «Описание», «Поделиться»', () => {
    const blocks = manifest.blocks ?? {};
    expect(Object.values(blocks).map((block) => block.title)).toEqual([
      'Текст',
      'Название',
      'Варианты',
      'Количество',
      'Кнопки',
      'Описание',
      'Поделиться',
    ]);
    expect(Object.values(blocks).every((block) => block.limit === 1)).toBe(true);
    expect(manifest.defaultBlocks?.map((block) => block.type)).toEqual(Object.keys(blocks));
  });

  it('поля блоков: подписи и группы как у подпанелей прода', () => {
    const labels = (type: string) => (manifest.blocks?.[type]?.settings ?? []).map((field) => [field.label, field.section]);
    expect(labels('text')).toEqual([['Текст', undefined], ['Размер текста', undefined]]);
    expect(labels('title')).toEqual([['Размер', undefined]]);
    expect(labels('variants')).toEqual([['Стиль', undefined], ['Вариации', undefined]]);
    expect(labels('buttons')).toEqual([
      ['Текст', 'Основная кнопка'],
      ['Текст', 'Динамическая кнопка'],
    ]);
    expect(labels('share')).toEqual([['Текст', undefined]]);
    expect(manifest.blocks?.text?.settings[0]?.setting).toMatchObject({ kind: 'text', ai: 'description' });
  });

  it('вид полей как на проде: макет и размер — список, позиция и увеличение — переключатель, динамическая кнопка — тумблер', () => {
    const spec = (id: string) => fields().find((field) => field.id === id)?.setting;
    expect(spec('layout')).toMatchObject({
      kind: 'select',
      default: 'stacked',
      options: [
        { value: 'stacked', label: 'Сложенный' },
        { value: 'two-columns', label: '2 колонки' },
        { value: 'carousel', label: 'Карусель' },
        { value: 'split', label: 'Миниатюрный' },
      ],
    });
    expect(spec('size')).toMatchObject({ kind: 'select', default: 'medium' });
    expect(spec('image-position')).toMatchObject({ kind: 'radio', default: 'left' });
    expect(spec('zoom')).toMatchObject({ kind: 'radio', default: 'hover' });
    expect(spec('buy-now')).toMatchObject({ kind: 'toggle', default: true });
    expect(spec('price')).toMatchObject({ kind: 'hint', title: 'Настройка недоступна' });
  });

  it('значения заготовки остаются валидными: у product только выбор товара, распроданное и увеличение', () => {
    const ids = fields().map((field) => field.id);
    for (const id of ['product', 'sold-out', 'zoom']) expect(ids).toContain(id);
  });
});

describe('умолчания — вид flux', () => {
  it('сложенный макет, фото слева, средний размер, счётчик без рамки, крупные кнопки: «Добавить в корзину» контуром, «Купить сейчас» залита', async () => {
    const source = await html();
    expect(datum(source, 'layout')).toBe('stacked');
    expect(datum(source, 'photo')).toBe('left');
    expect(datum(source, 'gallery-size')).toBe('medium');
    expect(datum(source, 'thumbs')).toBe('grid');
    expect(datum(source, 'counter')).toBe('inline');
    expect(datum(source, 'button-size')).toBe('large');
    expect(datum(source, 'button-style')).toBe('secondary');
    expect(source).toContain('>Добавить в корзину</button>');
    expect(source).toContain('>Купить сейчас</button>');
  });

  it('хлебных крошек и значка скидки нет, сердце есть', async () => {
    const source = await html();
    expect(source).not.toContain('Хлебные крошки');
    expect(source).not.toContain('data-ref="badge"');
    expect(source).toContain('data-action="favorites.toggle" data-product-id="p-1"');
  });
});

describe('галерея: макеты', () => {
  it('сложенный: главное фото, миниатюры сеткой — по кнопке на фото, первая текущая', async () => {
    const source = await html();
    expect(withAttr(source, 'data-action="pick"')).toHaveLength(3);
    expect(withAttr(source, 'aria-current="true"')).toHaveLength(1);
    expect(source).toContain('data-behavior="zoom" data-mode="hover"');
    expect(source).toContain(`data-photos="${PHOTOS.join(' ')}"`);
    expect(source).toContain('data-behavior="card-photos"');
    expect(source).toContain(`src="${PHOTOS[0]}"`);
  });

  it.each(['carousel', 'split'])('%s: главное фото и лента миниатюр', async (layout) => {
    const source = await html({ settings: { layout } });
    expect(datum(source, 'layout')).toBe(layout);
    expect(datum(source, 'thumbs')).toBe('row');
    expect(withAttr(source, 'data-action="pick"')).toHaveLength(3);
  });

  it('2 колонки: все фото плитками, миниатюр и стрелок-переключателей нет, свайпа нет, у каждой плитки — увеличение', async () => {
    const source = await html({ settings: { layout: 'two-columns' } });
    expect(withAttr(source, 'data-action="pick"')).toHaveLength(0);
    expect(source).not.toContain('data-behavior="card-photos"');
    expect(tagsOf(source, 'img').filter((tag) => tag.includes('data-part="image"'))).toHaveLength(3);
    expect(withAttr(source, 'data-behavior="zoom"')).toHaveLength(3);
    expect(withAttr(source, 'data-ref="photo"')).toHaveLength(1);
    expect(source).toContain('grid grid-cols-2');
  });

  it('одно фото — ни миниатюр, ни стрелок; без фото — плитка со значком и скрытая картинка для фото варианта', async () => {
    const single = await html({ product: { images: [PHOTOS[0]] } });
    expect(withAttr(single, 'data-action="pick"')).toHaveLength(0);
    expect(withAttr(single, 'data-action="prev"')).toHaveLength(0);
    const bare = await html({ product: { images: [] } });
    expect(bare).toMatch(/<img[^>]*data-ref="photo"[^>]*\bhidden\b/);
    expect(bare).toContain('<svg');
  });

  it('стрелки «Предыдущее фото» и «Следующее фото» — действия prev и next', async () => {
    const source = await html();
    expect(withAttr(source, 'data-action="prev"')).toHaveLength(1);
    expect(withAttr(source, 'data-action="next"')).toHaveLength(1);
  });

  it.each(['small', 'medium', 'large'])('размер %s — признак на корне', async (size) => {
    expect(datum(await html({ settings: { size } }), 'gallery-size')).toBe(size);
  });

  it.each(['left', 'right'])('позиция фото %s — признак на корне', async (position) => {
    expect(datum(await html({ settings: { 'image-position': position } }), 'photo')).toBe(position);
  });

  it.each(['click', 'hover'])('увеличение %s — режим у рамки фото', async (zoom) => {
    expect(await html({ settings: { zoom } })).toContain(`data-behavior="zoom" data-mode="${zoom}"`);
  });
});

describe('цена, скидка, наличие', () => {
  it('цена и старая цена; плашка скидки — по выключателю, процент от старой цены', async () => {
    const source = await html({ settings: { 'discount-badge': true } });
    expect(source).toContain(`data-ref="price">${money(190000).text}</span>`);
    expect(source).toContain('data-ref="compare"');
    expect(source).toContain(money(250000).text);
    expect(source).toMatch(/data-ref="badge"[^>]*>−24 %/);
  });

  it('скидки нет — старая цена скрыта, плашка скрыта', async () => {
    const source = await html({ settings: { 'discount-badge': true }, product: { compareAtPrice: null } });
    expect(source).toMatch(/<s[^>]*data-ref="compare"[^>]*\bhidden\b/);
    expect(source).toMatch(/data-ref="badge"[^>]*\bhidden\b|\bhidden\b[^>]*data-ref="badge"/);
  });

  it('наличие: «В наличии» и «Нет в наличии» с отключёнными кнопками покупки', async () => {
    expect(await html()).toContain('>В наличии</span>');
    const sold = await html({ product: { available: false } });
    expect(sold).toContain('>Нет в наличии</span>');
    for (const tag of withAttr(sold, 'data-action="cart.add"')) expect(tag).toContain('disabled');
    for (const tag of withAttr(sold, 'data-action="buy"')) expect(tag).toContain('disabled');
  });
});

describe('варианты', () => {
  it('список (умолчание): подпись группы, выпадающий список со значениями — действие variants.pick с id группы и значения', async () => {
    const source = await html();
    expect(source).toContain('<details');
    expect(source).toContain('<summary');
    const picks = withAttr(source, 'data-action="variants.pick"');
    expect(picks).toHaveLength(4);
    expect(picks[0]).toContain('data-product-id="p-1" data-group="g-color" data-value="v-blue"');
    expect(source).toContain('>Цвет</p>');
  });

  it('список: у каждого значения с цветом свой образец в строке выбранного, виден первый; fill скрипт не пишет', async () => {
    const source = await html({ blocks: blocksOf({ variants: { 'variants-style': 'list', 'variants-shape': 'circle' } }) });
    const swatches = withAttr(source, 'data-ref="current-swatch"');
    expect(swatches.map((tag) => /data-value="([^"]*)"/.exec(tag)?.[1])).toEqual(['v-blue', 'v-red']);
    expect(swatches[0]).not.toMatch(/\shidden[\s=>]/);
    expect(swatches[1]).toMatch(/\shidden[\s=>]/);
    expect(source).not.toContain('data-ref="current-fill"');
  });

  it.each([
    ['circle', 'rounded-full'],
    ['square', 'rounded-none'],
  ])('кнопки с образцами «%s»: значок цвета — SVG с заливкой, размер — текстом', async (shape, radius) => {
    const source = await html({ blocks: blocksOf({ variants: { 'variants-style': 'button', 'variants-shape': shape } }) });
    expect(source).not.toContain('<details');
    expect(source).toContain('data-variants-shape="' + shape + '"');
    expect(source).toContain('fill="#1f3a93"');
    expect(source).toContain(radius);
    expect(source).toContain('>S</span>');
  });

  it('кнопки без образцов — значения текстом', async () => {
    const source = await html({ blocks: blocksOf({ variants: { 'variants-style': 'button', 'variants-shape': 'none' } }) });
    expect(source).toContain('data-variants-shape="none"');
    expect(source).toContain('>Синий</span>');
  });

  it('товар без вариантов — блока вариантов в колонке нет', async () => {
    const source = await html({ product: { options: [] } });
    expect(source).not.toContain('variants.pick');
  });
});

describe('счётчик и кнопки покупки', () => {
  it.each(['inline', 'boxed', 'split'])('счётчик %s — признак на корне; «−» и «+» — действия less и more', async (counter) => {
    const source = await html({ settings: { counter } });
    expect(datum(source, 'counter')).toBe(counter);
    expect(withAttr(source, 'data-action="less"')).toHaveLength(1);
    expect(withAttr(source, 'data-action="more"')).toHaveLength(1);
    expect(source).toContain('data-ref="quantity"');
  });

  it('«В корзину» — cart.add с товаром и штуками, «Купить сейчас» — действие buy; обе кнопки — в месте блоков расширений', async () => {
    const source = await html();
    expect(source).toContain('data-ext-point="product" data-product-id="p-1"');
    expect(withAttr(source, 'data-action="cart.add"')[0]).toContain('data-product-id="p-1" data-quantity="1"');
    expect(withAttr(source, 'data-action="buy"')[0]).toContain('data-product-id="p-1" data-quantity="1"');
  });

  it('«Динамическая кнопка»: выключена — «Купить сейчас» нет; текст кнопок — из блока «Кнопки»', async () => {
    expect(await html({ settings: { 'buy-now': false } })).not.toContain('data-action="buy"');
    const source = await html({
      blocks: blocksOf({ buttons: { 'button-label': 'В корзину', 'button-second-label': 'Оформить сразу' } }),
    });
    expect(source).toContain('>В корзину</button>');
    expect(source).toContain('>Оформить сразу</button>');
  });

  it('пустой текст основной кнопки скрывает её, пустой текст динамической — её', async () => {
    const noAdd = await html({ blocks: blocksOf({ buttons: { 'button-label': '' } }) });
    expect(noAdd).not.toContain('data-action="cart.add"');
    expect(noAdd).toContain('data-action="buy"');
    const noBuy = await html({ blocks: blocksOf({ buttons: { 'button-second-label': '' } }) });
    expect(noBuy).toContain('data-action="cart.add"');
    expect(noBuy).not.toContain('data-action="buy"');
  });

  it('«Поделиться» — отдельный блок: кнопка с подписью из блока, действие share и текст после копирования; пустая подпись — кнопки нет', async () => {
    const source = await html();
    const button = withAttr(source, 'data-action="share"')[0] ?? '';
    expect(button).toContain('data-copied="Ссылка скопирована"');
    expect(source).toContain('<span data-ref="share-label">Поделиться</span>');
    expect(source).toMatch(/data-type="share"[^>]*data-no-share="false"/);
    const renamed = await html({ blocks: blocksOf({ share: { 'share-label': 'Отправить ссылку' } }) });
    expect(renamed).toContain('<span data-ref="share-label">Отправить ссылку</span>');
    const none = await html({ blocks: blocksOf({ share: { 'share-label': '' } }) });
    expect(none).not.toContain('data-action="share"');
    expect(none).toContain('data-action="cart.add"');
    expect(none).toMatch(/data-type="share"[^>]*data-no-share="true"/);
  });

  it('без блока «Поделиться» кнопки нет, остальные кнопки на месте', async () => {
    const source = await html({ blocks: blocksOf().filter((block) => block.type !== 'share') });
    expect(source).not.toContain('data-action="share"');
    expect(source).toContain('data-action="cart.add"');
  });

  it.each(['regular', 'large'])('размер кнопок %s и стиль — признаки на корне', async (size) => {
    const source = await html({ settings: { 'button-size': size, 'button-style': 'primary' } });
    expect(datum(source, 'button-size')).toBe(size);
    expect(datum(source, 'button-style')).toBe('primary');
  });
});

describe('блоки: нет блока — нет части', () => {
  const without = (type: string): RenderBlock[] => blocksOf().filter((block) => block.type !== type);

  it('без «Названия» нет заголовка, цены и наличия', async () => {
    const source = await html({ blocks: without('title') });
    expect(source).not.toContain('<h1');
    expect(source).not.toContain('data-ref="price"');
    expect(source).not.toContain('data-ref="stock"');
  });

  it('без «Кнопок», «Количества», «Описания», «Вариантов»', async () => {
    expect(await html({ blocks: without('buttons') })).not.toContain('cart.add');
    expect(await html({ blocks: without('quantity') })).not.toContain('data-ref="quantity"');
    expect(await html({ blocks: without('description') })).not.toContain('Тёплый шарф');
    expect(await html({ blocks: without('variants') })).not.toContain('variants.pick');
  });

  it('пустая часть не занимает место в колонке: «Текст» без текста, «Варианты» без вариантов, «Описание» без описания, «Кнопки» без кнопок', async () => {
    const marks = (source: string, type: string): string[] =>
      Array.from(source.match(new RegExp(`<div[^>]*data-type="${type}"[^>]*>`))?.[0].matchAll(/data-(no-[a-z]+)="(true|false)"/g) ?? [], (found) => `${found[1]}=${found[2]}`);
    const source = await html({
      product: { options: [], description: '' },
      blocks: blocksOf({ buttons: { 'button-label': '', 'button-second-label': '' } }),
    });
    expect(marks(source, 'text')).toContain('no-text=true');
    expect(marks(source, 'variants')).toContain('no-options=true');
    expect(marks(source, 'description')).toContain('no-description=true');
    expect(marks(source, 'buttons')).toContain('no-buttons=true');
    const filled = await html();
    expect(marks(filled, 'variants')).toContain('no-options=false');
    expect(marks(filled, 'description')).toContain('no-description=false');
    expect(marks(filled, 'buttons')).toContain('no-buttons=false');
    expect(source).toContain('data-[type=variants]:data-[no-options=true]:hidden');
  });

  it('порядок блоков — порядок частей колонки', async () => {
    const reversed = [...blocksOf()].reverse();
    const source = await html({ blocks: reversed });
    expect(source.indexOf('data-type="description"')).toBeLessThan(source.indexOf('data-type="title"'));
  });
});

describe('текст, название, описание', () => {
  it('название — h1 на странице товара, h2 на главной', async () => {
    expect(await html({ pageId: 'product' })).toMatch(/<h1[^>]*>Шарф «Нова»<\/h1>/);
    const home = await html({ pageId: 'home' });
    expect(home).not.toContain('<h1');
    expect(home).toMatch(/<h2[^>]*>Шарф «Нова»<\/h2>/);
  });

  it('текст с «К» и «Ж» — как есть, размеры названия и текста — признаками', async () => {
    const source = await html({
      blocks: blocksOf({
        text: { text: 'Новая <em>коллекция</em> <strong>2026</strong>', 'text-size': 'large' },
        title: { 'heading-size': 'small' },
      }),
    });
    expect(source).toContain('<em>коллекция</em> <strong>2026</strong>');
    expect(source).toContain('data-title-size="small"');
    expect(datum(source, 'text-size')).toBe('large');
  });

  it('пустой «Текст» ничего не рисует; описание — с переносами строк', async () => {
    const source = await html();
    expect(source).not.toContain('data-type="text"><p');
    expect(source).toContain('whitespace-pre-line');
    expect(source).toContain('Тёплый шарф\nиз шерсти');
  });

  it('товара нет — секция пуста', async () => {
    const source = await renderer.render({
      section: 'shop:product',
      hash,
      module,
      settings: { ...defaultsOf(), product: null },
      blocks: blocksOf(),
      records: {},
      page: { id: 'home', path: '/' },
      theme: {},
    });
    expect(source).not.toContain('data-layout');
  });
});

describe('хлебные крошки, избранное', () => {
  it('крошки — по выключателю: «Главная», коллекция товара, название', async () => {
    const source = await html({ settings: { breadcrumbs: true } });
    expect(source).toContain('aria-label="Хлебные крошки"');
    expect(source).toContain('href="/collection/zima"');
    expect(source).toContain('aria-current="page"');
  });

  it('товар без коллекций — крошка «Каталог»', async () => {
    expect(await html({ settings: { breadcrumbs: true }, product: { collections: [] } })).toContain('href="/catalog"');
  });

  it('сердце: «Избранное» выключено или избранное выключено в теме — сердца нет', async () => {
    expect(await html({ settings: { favorite: false } })).not.toContain('favorites.toggle');
    expect(await html({ theme: { 'wishlist-enabled': false } })).not.toContain('favorites.toggle');
  });
});
