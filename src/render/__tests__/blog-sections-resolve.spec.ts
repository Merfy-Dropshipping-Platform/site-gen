import { applySectionPolicy } from '../section-policy';
import { normalizeCatalog, type Catalog } from '../catalog';

/**
 * PUB-1, PUB-2, PUB-3: записи блога доезжают до секций тем же путём, что
 * товары и коллекции — catalog → applySectionPolicy → __merfy.resolved.
 *
 *   «Блог» (BlogSection)             — опубликованные записи одного блога, новые сверху;
 *   «Запись блога» (BlogPostSection) — одна запись (адрес задаёт сборка страницы);
 *   «Публикации» (Publications)      — «Все записи блога» (blogId) или «Одна запись» (publicationId).
 */

const RAW = [
  {
    id: 'p-old',
    title: 'Старая новость',
    slug: 'staraya',
    blogId: 'b-novosti',
    blogHandle: 'novosti',
    blogTitle: 'Новости',
    excerpt: 'Анонс старой',
    content: '<p>Текст старой</p>',
    seoTitle: null,
    seoDescription: null,
    coverImageUrl: null,
    publishedAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'p-new',
    title: 'Свежая новость',
    slug: 'svezhaya',
    blogId: 'b-novosti',
    blogHandle: 'novosti',
    blogTitle: 'Новости',
    excerpt: 'Анонс свежей',
    content: '<p>Текст свежей</p>',
    seoTitle: 'SEO свежей',
    seoDescription: 'Описание свежей',
    coverImageUrl: 'https://cdn/new.jpg',
    publishedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'p-stati',
    title: 'Гид по размерам',
    slug: 'gid',
    blogId: 'b-stati',
    blogHandle: 'stati',
    blogTitle: 'Статьи',
    excerpt: '',
    content: '<p>Гид</p>',
    coverImageUrl: null,
    publishedAt: '2026-05-01T10:00:00.000Z',
  },
];

const catalog: Catalog = normalizeCatalog({ publications: RAW });

const resolve = (block: string, props: Record<string, unknown>, c: Catalog = catalog) =>
  applySectionPolicy(block, props, c, {}).publications;

describe('каталог несёт поля страницы записи', () => {
  it('название блога, текст и SEO-поля не теряются', () => {
    const p = catalog.publications.find((x) => x.id === 'p-new')!;
    expect(p.blogTitle).toBe('Новости');
    expect(p.content).toBe('<p>Текст свежей</p>');
    expect(p.seoTitle).toBe('SEO свежей');
    expect(p.seoDescription).toBe('Описание свежей');
  });

  it('пустые SEO-поля — null', () => {
    const p = catalog.publications.find((x) => x.id === 'p-stati')!;
    expect(p.seoTitle).toBeNull();
    expect(p.seoDescription).toBeNull();
  });
});

describe('секция «Блог» (BlogSection)', () => {
  it('записи блога по адресу, новые сверху, без обрезки (страницы листает блок)', () => {
    expect(resolve('BlogSection', { blogHandle: 'novosti' })?.map((p) => p.id)).toEqual([
      'p-new',
      'p-old',
    ]);
  });

  it('блог можно выбрать и по id', () => {
    expect(resolve('BlogSection', { blogId: 'b-stati' })?.map((p) => p.id)).toEqual(['p-stati']);
  });

  it('блог без записей — пусто, чужие записи не подмешиваются', () => {
    expect(resolve('BlogSection', { blogHandle: 'pustoj' })).toEqual([]);
  });

  it('в конструкторе (блог не задан) — блог по умолчанию «Новости»', () => {
    expect(resolve('BlogSection', {})?.map((p) => p.id)).toEqual(['p-new', 'p-old']);
  });

  it('нет «Новостей» — блог самой свежей записи', () => {
    const onlyStati = normalizeCatalog({ publications: RAW.filter((p) => p.blogHandle === 'stati') });
    expect(resolve('BlogSection', {}, onlyStati)?.map((p) => p.id)).toEqual(['p-stati']);
  });
});

describe('секция «Запись блога» (BlogPostSection)', () => {
  it('запись по id', () => {
    expect(resolve('BlogPostSection', { publicationId: 'p-stati' })?.map((p) => p.id)).toEqual([
      'p-stati',
    ]);
  });

  it('удалённая запись — пусто', () => {
    expect(resolve('BlogPostSection', { publicationId: 'net-takoj' })).toEqual([]);
  });

  it('в конструкторе (запись не задана) — самая свежая запись магазина', () => {
    expect(resolve('BlogPostSection', {})?.map((p) => p.id)).toEqual(['p-new']);
  });
});

describe('секция «Публикации»: «Все записи блога» или «Одна запись»', () => {
  it('«Все записи блога» — записи выбранного блога', () => {
    const out = resolve('Publications', {
      publicationSource: 'blog',
      blogId: 'b-novosti',
      cardsCount: 3,
    });
    expect(out?.map((p) => p.id).sort()).toEqual(['p-new', 'p-old']);
  });

  it('«Одна запись» — ровно выбранная запись', () => {
    const out = resolve('Publications', {
      publicationSource: 'publication',
      publicationId: 'p-stati',
    });
    expect(out?.map((p) => p.id)).toEqual(['p-stati']);
  });

  it('«Одна запись», запись удалена — пусто', () => {
    expect(
      resolve('Publications', { publicationSource: 'publication', publicationId: 'net' }),
    ).toEqual([]);
  });

  it('новые поля важнее старого publicationType', () => {
    const out = resolve('Publications', {
      publicationSource: 'blog',
      blogId: 'b-stati',
      publicationType: 'news',
    });
    expect(out?.map((p) => p.id)).toEqual(['p-stati']);
  });
});
