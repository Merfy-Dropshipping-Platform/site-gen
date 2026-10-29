import { fileURLToPath } from 'node:url';
import { sampleRecord, sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// «Публикации» и «Список коллекций» — сводные секции пяти тем (базовые секции, 29.10): панель прода в её порядке, новые
// параметры — после, в группе «Вид»; раскладка — признаками data-* на корне.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const NAMES = ['publications', 'collections'] as const;
type Name = (typeof NAMES)[number];

interface Loaded {
  manifest: SectionManifest;
  module: string;
  hash: string;
}
const loaded = new Map<Name, Loaded>();
let renderer: SectionRenderer;

beforeAll(async () => {
  for (const name of NAMES) {
    const files = await readSectionFolder(`${SHOP}/${name}`);
    const manifest = readManifest(files);
    if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
    const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    loaded.set(name, {
      manifest: manifest.value,
      module: checked.render,
      hash: sha256(Buffer.from(checked.render, 'utf8')),
    });
  }
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

// Плитка — блок с полем «Выбор коллекции»: запись приходит отдельно (blockRecords), по id блока. Выбранная коллекция —
// публичные поля записи; пустое поле при пустом магазине — null; при товарах магазина — запись «Все товары» без адреса.
const block = (id: string) => ({ id, type: 'tile', settings: {} });
const TILES = [block('t1'), block('t2'), block('t3'), block('t4')];
const collectionRecord = (title: string, slug: string, images: string[]) => ({
  id: `id-${slug}`,
  title,
  slug,
  url: `/collections/${slug}`,
  description: '',
  images,
  productsCount: 0,
  products: [],
});
const ALL_PRODUCTS = { ...collectionRecord('', '', []), id: '', url: '', productsCount: 2 };
const COLLECTION_RECORDS = {
  t1: { collection: collectionRecord('Шарфы', 'scarves', ['https://s3.merfy.ru/c/1.jpg', 'https://s3.merfy.ru/c/2.jpg']) },
  t2: { collection: collectionRecord('Пледы', 'pledy', []) },
  t3: { collection: ALL_PRODUCTS },
  t4: { collection: null },
};
const COLLECTIONS_SETTINGS = {
  heading: 'Коллекции',
  'heading-size': 'medium',
  text: '',
  'text-size': 'small',
  columns: 3,
  'aspect-ratio': 'square',
  'columns-mobile': '1',
  align: 'center',
  'caption-align': 'left',
  capitals: false,
};
const collections = async (
  settings: Record<string, string | number | boolean> = {},
  blocks: ReturnType<typeof block>[] = TILES,
  blockRecords: Record<string, Record<string, object | null>> = COLLECTION_RECORDS,
): Promise<string> => {
  const section = loaded.get('collections');
  if (section === undefined) throw new Error('collections');
  return renderer.render({
    section: 'shop:collections',
    hash: section.hash,
    module: section.module,
    settings: { ...COLLECTIONS_SETTINGS, ...settings },
    blocks,
    blockRecords,
    theme: {},
  });
};

const BLOG = sampleRecord('blog');
// Дату словами считает сборка (publishedText записи блога); секция выводит её как есть.
const TEXT_OF_DATE: Record<string, string> = {
  '2026-10-19T09:30:00.000Z': '19 октября 2026 г.',
  '2026-10-05T09:30:00.000Z': '5 октября 2026 г.',
  '2026-09-30T09:30:00.000Z': '30 сентября 2026 г.',
  '2026-09-01T09:30:00.000Z': '1 сентября 2026 г.',
};
const article = (id: string, title: string, publishedAt: string | null, cover: string | null, excerpt: string) => ({
  id,
  title,
  url: `/blogs/novosti/${id}`,
  publishedAt,
  publishedText: publishedAt === null ? '' : (TEXT_OF_DATE[publishedAt] ?? ''),
  cover,
  excerpt,
});
const ARTICLES = [
  article('a-1', 'Как стирать плед', '2026-10-19T09:30:00.000Z', 'https://s3.merfy.ru/b/1.jpg', 'Вручную, при 30°'),
  article('a-2', 'Новая коллекция', '2026-10-05T09:30:00.000Z', null, 'Осень в магазине'),
  article('a-3', 'Скидки', '2026-09-30T09:30:00.000Z', 'https://s3.merfy.ru/b/3.jpg', ''),
  article('a-4', 'Подарки', '2026-09-01T09:30:00.000Z', 'https://s3.merfy.ru/b/4.jpg', 'К празднику'),
];
const PUBLICATIONS_SETTINGS = {
  posts: null,
  cards: 3,
  heading: 'Публикации',
  'heading-size': 'medium',
  columns: 3,
  date: true,
  align: 'left',
  excerpt: false,
};
const publications = async (
  settings: Record<string, string | number | boolean | null> = {},
  posts: object | null = { ...BLOG, articles: ARTICLES, articlesCount: ARTICLES.length },
): Promise<string> => {
  const section = loaded.get('publications');
  if (section === undefined) throw new Error('publications');
  return renderer.render({
    section: 'shop:publications',
    hash: section.hash,
    module: section.module,
    settings: { ...PUBLICATIONS_SETTINGS, ...settings },
    records: { posts },
    theme: {},
  });
};

const attr = (source: string, name: string): string | null =>
  new RegExp(`\\sdata-${name}="([^"]*)"`).exec(source)?.[1] ?? null;
const count = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;
const order = (name: Name): string[] =>
  (loaded.get(name)?.manifest.settings ?? []).map((entry) =>
    'wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id,
  );
const groupOf = (name: Name, id: string): string | undefined => {
  const entry = (loaded.get(name)?.manifest.settings ?? []).find((item) => 'id' in item && item.id === id);
  return entry !== undefined && 'section' in entry ? entry.section : undefined;
};

describe('приём: без проблем и предупреждений', () => {
  it.each(NAMES)(
    '%s',
    async (name) => {
      const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(`${SHOP}/${name}`) });
      expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
    },
    30_000,
  );
});

describe('панель: поля прода в их порядке, новые — после, в группе «Вид»', () => {
  it('«Публикации»: выбор, карточки, содержание, колонки, дата, схема, отступы; потом «Вид»', () => {
    expect(order('publications')).toEqual([
      'posts',
      'cards',
      'heading',
      'heading-size',
      'columns',
      'date',
      'wrapper:scheme',
      'wrapper:padding',
      'align',
      'excerpt',
    ]);
    expect(groupOf('publications', 'heading')).toBe('Содержание');
    expect(groupOf('publications', 'align')).toBe('Вид');
    const fields = loaded.get('publications')?.manifest.settings ?? [];
    const range = (id: string) => fields.find((item) => 'id' in item && item.id === id);
    expect(range('cards')).toMatchObject({ setting: { kind: 'range', min: 1, max: 4, default: 3 } });
    expect(range('columns')).toMatchObject({ setting: { kind: 'range', min: 1, max: 4, default: 3 } });
    expect(range('date')).toMatchObject({ label: 'Дата и время', setting: { kind: 'toggle', default: true } });
    expect(range('posts')).toMatchObject({ label: 'Выбор публикации', setting: { kind: 'blog' } });
    // Размер заголовка по умолчанию — как у flux на проде («Большой»).
    expect(range('heading-size')).toMatchObject({ setting: { kind: 'select', default: 'large' } });
  });

  it('«Список коллекций»: содержание, колонки 1–6, схема, отступы; потом «Вид»', () => {
    expect(order('collections')).toEqual([
      'heading',
      'heading-size',
      'text',
      'text-size',
      'columns',
      'wrapper:scheme',
      'wrapper:padding',
      'aspect-ratio',
      'columns-mobile',
      'align',
      'caption-align',
      'capitals',
    ]);
    expect(groupOf('collections', 'heading')).toBe('Содержание');
    expect(groupOf('collections', 'aspect-ratio')).toBe('Вид');
    const columns = (loaded.get('collections')?.manifest.settings ?? []).find(
      (item) => 'id' in item && item.id === 'columns',
    );
    expect(columns).toMatchObject({ label: 'Колонки', setting: { kind: 'range', min: 1, max: 6, default: 3 } });
  });

  it('«Список коллекций»: до десяти коллекций, у плитки одно поле «Выбор коллекции» (как на проде), «Добавить коллекцию»', () => {
    const tile = loaded.get('collections')?.manifest.blocks?.tile;
    expect(tile?.limit).toBe(10);
    expect(tile?.title).toBe('Коллекция');
    expect(`Добавить ${tile?.addTitle ?? ''}`).toBe('Добавить коллекцию');
    expect(tile?.settings).toHaveLength(1);
    expect(tile?.settings[0]).toMatchObject({ id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } });
  });
});

describe('«Список коллекций»', () => {
  it.each([1, 2, 3, 4, 5, 6])('колонок %i — признак на корне', async (columns) => {
    expect(attr(await collections({ columns }), 'columns')).toBe(String(columns));
  });

  it.each([
    ['columns-mobile', '2', 'columns-mobile'],
    ['aspect-ratio', 'portrait', 'aspect-ratio'],
    ['aspect-ratio', 'landscape', 'aspect-ratio'],
    ['align', 'left', 'align'],
    ['caption-align', 'center', 'caption-align'],
    ['heading-size', 'large', 'heading-size'],
    ['text-size', 'large', 'text-size'],
  ])('%s=%s — признак %s на корне', async (id, value, name) => {
    expect(attr(await collections({ [id]: value }), name)).toBe(value);
  });

  it('заглавные буквы — признак на корне', async () => {
    expect(attr(await collections({ capitals: true }), 'capitals')).toBe('true');
    expect(attr(await collections(), 'capitals')).toBe('false');
  });

  it('плитка выбранной коллекции: первая картинка, название и ссылка — из коллекции', async () => {
    const source = await collections();
    expect(count(source, /<li[ >]/g)).toBe(4);
    expect(source).toContain('href="/collections/scarves"');
    expect(source).toContain('src="https://s3.merfy.ru/c/1.jpg"');
    expect(source).not.toContain('https://s3.merfy.ru/c/2.jpg');
    expect(source).toContain('Шарфы');
    expect(source).toContain('href="/collections/pledy"');
    expect(source).toContain('Пледы');
  });

  it('коллекция без картинки — значок места; выбор не сделан — серая плитка «Коллекция» без ссылки', async () => {
    const source = await collections();
    expect(count(source, /<img /g)).toBe(1);
    expect(count(source, /<svg /g)).toBe(3);
    expect(count(source, /<a [^>]*href=/g)).toBe(2);
    expect(count(source, /<a /g)).toBe(4);
    expect(count(source, />Коллекция</g)).toBe(2);
  });

  it('заголовок и текст с начертаниями; пустые — не выводятся', async () => {
    const source = await collections({ heading: 'Наши <em>коллекции</em>', text: 'Подборки <strong>сезона</strong>' });
    expect(source).toContain('<em>коллекции</em>');
    expect(source).toContain('<strong>сезона</strong>');
    const bare = await collections({ heading: '', text: '' });
    expect(bare).not.toContain('<h2');
    expect(bare).not.toContain('<p ');
  });

  it('элементов нет — списка нет', async () => {
    expect(await collections({}, [])).not.toContain('<ul');
  });
});

describe('«Публикации»', () => {
  it('записи выбранного блога: ссылка, название, дата словами, картинка', async () => {
    const source = await publications();
    expect(count(source, /<li[ >]/g)).toBe(3);
    expect(source).toContain('href="/blogs/novosti/a-1"');
    expect(source).toContain('Как стирать плед');
    expect(source).toContain('>19 октября 2026 г.</time>');
    expect(source).toContain('>5 октября 2026 г.</time>');
    expect(source).not.toContain('19.10.2026');
    expect(source).toContain('datetime="2026-10-19T09:30:00.000Z"');
    expect(source).toContain('src="https://s3.merfy.ru/b/1.jpg"');
    expect(source).not.toContain('Подарки');
  });

  it.each([1, 2, 4])('карточек %i — столько записей', async (cards) => {
    expect(count(await publications({ cards }), /<li[ >]/g)).toBe(cards);
  });

  it('запись без обложки — рамка без img', async () => {
    const source = await publications({ cards: 2 });
    expect(count(source, /<img /g)).toBe(1);
  });

  it('дата скрыта — даты нет; запись без даты — без даты', async () => {
    expect(await publications({ date: false })).not.toContain('<time');
    const posts = { ...BLOG, articles: [article('a-5', 'Черновик', null, null, '')], articlesCount: 1 };
    expect(await publications({}, posts)).not.toContain('<time');
  });

  it('анонс — только когда включён и есть у записи', async () => {
    expect(await publications()).not.toContain('Осень в магазине');
    const source = await publications({ excerpt: true, cards: 3 });
    expect(source).toContain('Вручную, при 30°');
    expect(source).toContain('Осень в магазине');
  });

  it.each([1, 2, 3, 4])('колонок %i — признак на корне', async (columns) => {
    expect(attr(await publications({ columns }), 'columns')).toBe(String(columns));
  });

  it.each([
    ['align', 'center'],
    ['align', 'right'],
    ['heading-size', 'small'],
    ['heading-size', 'large'],
  ])('%s=%s — признак на корне', async (id, value) => {
    expect(attr(await publications({ [id]: value }), id)).toBe(value);
  });

  it('записей нет — подсказка вместо списка; заголовок остаётся', async () => {
    for (const posts of [null, { ...BLOG, articles: [], articlesCount: 0 }]) {
      const source = await publications({}, posts);
      expect(source).toContain('Публикаций пока нет');
      expect(source).not.toContain('<ul');
      expect(source).toContain('Публикации');
    }
  });

  it('заголовок с начертаниями', async () => {
    expect(await publications({ heading: 'Наши <em>новости</em>' })).toContain('<em>новости</em>');
  });
});
