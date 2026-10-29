import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/inputs';
import {
  BLOG_ARTICLES_MAX,
  COLLECTION_PRODUCTS_MAX,
  COLOR_SWATCHES_MAX,
  POLICY_PAGES,
  RECORD_FIELDS,
  money,
  policyTextToHtml,
  publishedTextOf,
  recordIndexOf,
  recordPath,
  recordSlug,
  type BlogData,
  type CollectionData,
  type ProductData,
  type PublicationData,
} from '../src/records';

// Записи магазина (блок 8 «Секций и SDK», часть 8а): из сущностей входов сборки — записи с публичными полями, адреса,
// SEO и зависимости страниц записей (страницы — часть 8б).
const AT = '2026-10-20T10:00:00.000Z';
const LATER = '2026-10-21T10:00:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [P1, P2, P3] = [ID(101), ID(102), ID(103)];
const C1 = ID(201);
const B1 = ID(301);
const [A1, A2] = [ID(401), ID(402)];
const NO_SEO = { title: '', description: '' };

function product(id: string, data: Partial<ProductData> = {}, updatedAt = AT): Entity {
  const value: ProductData = {
    title: 'Шарф',
    handle: 'sharf',
    description: '<p>Тёплый   шарф</p> из льна',
    price: 190000,
    compareAtPrice: 250000,
    images: ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg'],
    available: true,
    options: [{ id: 'g-1', name: 'Цвет', values: [{ id: 'o-1', value: 'Синий', images: [], swatch: '#1d4ed8' }] }],
    variants: [
      { id: 'v-1', title: 'Синий', price: 190000, compareAtPrice: null, available: true, options: { Цвет: 'Синий' } },
    ],
    collectionIds: [C1],
    seo: NO_SEO,
    ...data,
  };
  return { type: 'product', id, updatedAt, data: value };
}

function collection(id: string, data: Partial<CollectionData> = {}, updatedAt = AT): Entity {
  const value: CollectionData = {
    title: 'Кашемир',
    handle: 'kashemir',
    description: 'Тёплые шарфы',
    images: ['https://s3.merfy.ru/c/1.jpg'],
    productIds: [P1],
    seo: NO_SEO,
    ...data,
  };
  return { type: 'collection', id, updatedAt, data: value };
}

function blog(id: string, data: Partial<BlogData> = {}): Entity {
  const value: BlogData = { title: 'Новости', handle: 'novosti', ...data };
  return { type: 'blog', id, updatedAt: AT, data: value };
}

function article(id: string, data: Partial<PublicationData> = {}, updatedAt = AT): Entity {
  const value: PublicationData = {
    title: 'Как ухаживать за льном',
    slug: 'linen',
    blogId: B1,
    blogHandle: 'novosti',
    excerpt: 'Стирка и глажка',
    content: '<p>Стирать при 30°</p>',
    publishedAt: '2026-10-19T10:00:00.000Z',
    cover: 'https://s3.merfy.ru/a/1.jpg',
    seo: NO_SEO,
    ...data,
  };
  return { type: 'publication', id, updatedAt, data: value };
}

const policy = (type: string, content: string): Entity => ({
  type: 'policy',
  id: type,
  updatedAt: AT,
  data: { content },
});
const broken = (id: string): Entity => ({ type: 'product', id, updatedAt: AT, data: { title: 'Без цены' } });

describe('деньги, адреса, текст политики', () => {
  it('цена в копейках → «1 900 ₽»: целые рубли с округлением, тысячи — через неразрывный пробел', () => {
    expect(money(190000)).toEqual({ amount: 190000, currency: 'RUB', text: '1 900 ₽' });
    expect(money(99).text).toBe('1 ₽');
    expect(money(0).text).toBe('0 ₽');
    expect(money(123456789).text).toBe('1 234 568 ₽');
  });

  it('адрес записи: буквы, цифры, «-» и «_» до 200 знаков; иначе id', () => {
    expect(recordSlug('sharf-nova', P1)).toBe('sharf-nova');
    expect(recordSlug('шарф_лён', P1)).toBe('шарф_лён');
    expect(recordSlug('x'.repeat(200), P1)).toBe('x'.repeat(200));
    for (const bad of ['', 'a/../b', 'a b', '-a', 'a-', 'a?b', 'x'.repeat(201)]) expect(recordSlug(bad, P1)).toBe(P1);
  });

  it('адреса страниц — как у пяти тем и проекта «Публикации»', () => {
    expect([
      recordPath.product('sharf'),
      recordPath.collection('kashemir'),
      recordPath.blog('novosti'),
      recordPath.article('novosti', 'linen'),
      recordPath.policy('terms'),
    ]).toEqual(['/product/sharf', '/collections/kashemir', '/blogs/novosti', '/blogs/novosti/linen', '/legal/terms']);
  });

  it('политики — тип, адрес и название как на проде; текст — абзацы, переносы, экранирование', () => {
    expect(POLICY_PAGES).toEqual([
      { type: 'refund', slug: 'refund', title: 'Политика возврата' },
      { type: 'privacy', slug: 'privacy', title: 'Политика конфиденциальности' },
      { type: 'tos', slug: 'terms', title: 'Условия обслуживания' },
      { type: 'shipping', slug: 'shipping-policy', title: 'Политика доставки' },
    ]);
    expect(policyTextToHtml('  Абзац один\nстрока два\n\n\nАбзац <два> & три  ')).toBe(
      '<p>Абзац один<br>строка два</p><p>Абзац &lt;два&gt; &amp; три</p>',
    );
  });
});

describe('товар', () => {
  it('публичные поля, цены — Money, коллекции — ссылками; адрес по handle, адрес по id — второй', () => {
    const entry = recordIndexOf([product(P1), collection(C1)]).find('product', P1);
    expect(entry).toMatchObject({
      type: 'product',
      id: P1,
      path: '/product/sharf',
      aliases: ['/product/' + P1],
      entity: { type: 'product', id: P1 },
    });
    expect(entry?.record).toEqual({
      id: P1,
      title: 'Шарф',
      slug: 'sharf',
      url: '/product/sharf',
      description: '<p>Тёплый   шарф</p> из льна',
      price: money(190000),
      compareAtPrice: money(250000),
      images: ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg'],
      available: true,
      options: [{ id: 'g-1', name: 'Цвет', values: [{ id: 'o-1', value: 'Синий', images: [], swatch: '#1d4ed8' }] }],
      variants: [
        {
          id: 'v-1',
          title: 'Синий',
          price: money(190000),
          compareAtPrice: null,
          available: true,
          options: { Цвет: 'Синий' },
        },
      ],
      collections: [{ id: C1, title: 'Кашемир', url: '/collections/kashemir' }],
      updatedAt: AT,
    });
    expect(Object.keys(entry?.record ?? {}).sort()).toEqual([...RECORD_FIELDS.product].sort());
  });

  it('зависимости — сама запись и её коллекции; дата — последняя правка среди них', () => {
    const entry = recordIndexOf([product(P1), collection(C1, {}, LATER)]).find('product', P1);
    expect(entry?.deps).toEqual(['product:' + P1, 'collection:' + C1]);
    expect(entry?.updatedAt).toBe(LATER);
    const alone = recordIndexOf([product(P1)]).find('product', P1);
    expect(alone?.record).toMatchObject({ collections: [] });
    expect(alone?.deps).toEqual(['product:' + P1]);
  });

  it('SEO: заголовок и описание мерчанта; нет — название и описание без HTML до 160 знаков; картинка — первая', () => {
    const own = recordIndexOf([product(P1, { seo: { title: 'Купить шарф', description: 'Шарф из льна' } })]);
    expect(own.find('product', P1)?.seo).toEqual({
      title: 'Купить шарф',
      description: 'Шарф из льна',
      image: 'https://s3.merfy.ru/p/1.jpg',
    });
    const plain = recordIndexOf([product(P1, { images: [] })]).find('product', P1);
    expect(plain?.seo).toEqual({ title: 'Шарф', description: 'Тёплый шарф из льна', image: null });
    const long = recordIndexOf([product(P1, { description: 'я'.repeat(300) })]).find('product', P1);
    expect(long?.seo.description).toBe('я'.repeat(160));
  });

  it('один handle у двух товаров — первый по id получает его, второй — адрес по id без второго адреса', () => {
    const index = recordIndexOf([product(P2), product(P1)]);
    expect(index.find('product', P1)).toMatchObject({ path: '/product/sharf', aliases: ['/product/' + P1] });
    expect(index.find('product', P2)).toMatchObject({ path: '/product/' + P2, aliases: [] });
    expect(index.find('product', P2)?.record).toMatchObject({ slug: P2, url: '/product/' + P2 });
    expect(index.duplicates).toEqual([]);
  });

  it('заняты и адрес по handle, и адрес по id — у записи нет страницы, она в duplicates', () => {
    const index = recordIndexOf([product(P1), product(P2, { handle: P3 }), product(P3)]);
    expect(index.find('product', P2)?.path).toBe('/product/' + P3);
    expect(index.find('product', P3)).toBeNull();
    expect(index.duplicates).toEqual([{ type: 'product', id: P3, path: '/product/sharf' }]);
  });

  it('по адресу — основной и второй ведут к записи; чужой — null; данные не по форме — записи нет', () => {
    const index = recordIndexOf([product(P1), broken(P3)]);
    expect(index.atPath('/product/sharf')?.id).toBe(P1);
    expect(index.atPath('/product/' + P1)?.id).toBe(P1);
    expect(index.atPath('/product/nope')).toBeNull();
    expect(index.find('product', P3)).toBeNull();
    expect(index.find('product', 'nope')).toBeNull();
  });
});

describe('коллекция', () => {
  it('товары — по порядку мерчанта и только с записью; карточка — поля для списка', () => {
    const index = recordIndexOf([
      product(P1),
      product(P2, { title: 'Плед', handle: 'pled', compareAtPrice: null, images: [], available: false }),
      broken(P3),
      collection(C1, { productIds: [P2, P3, P1] }, LATER),
    ]);
    const entry = index.find('collection', C1);
    expect(entry).toMatchObject({
      path: '/collections/kashemir',
      aliases: ['/collections/' + C1],
      entity: { type: 'collection', id: C1 },
    });
    expect(entry?.record).toEqual({
      id: C1,
      title: 'Кашемир',
      slug: 'kashemir',
      url: '/collections/kashemir',
      description: 'Тёплые шарфы',
      images: ['https://s3.merfy.ru/c/1.jpg'],
      productsCount: 2,
      products: [
        {
          id: P2,
          title: 'Плед',
          url: '/product/pled',
          price: money(190000),
          compareAtPrice: null,
          image: null,
          available: false,
          images: [],
          variantId: 'v-1',
          colors: [{ title: 'Синий', swatch: '#1d4ed8' }],
        },
        {
          id: P1,
          title: 'Шарф',
          url: '/product/sharf',
          price: money(190000),
          compareAtPrice: money(250000),
          image: 'https://s3.merfy.ru/p/1.jpg',
          available: true,
          images: ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg'],
          variantId: 'v-1',
          colors: [{ title: 'Синий', swatch: '#1d4ed8' }],
        },
      ],
    });
    expect(Object.keys(entry?.record ?? {}).sort()).toEqual([...RECORD_FIELDS.collection].sort());
    expect(entry?.deps).toEqual(['collection:' + C1, 'product:' + P2, 'product:' + P1]);
    expect(entry?.updatedAt).toBe(LATER);
    expect(entry?.seo).toEqual({ title: 'Кашемир', description: 'Тёплые шарфы', image: 'https://s3.merfy.ru/c/1.jpg' });
  });

  it(`в записи — первые ${COLLECTION_PRODUCTS_MAX} товаров, в счётчике — все`, () => {
    const ids = Array.from({ length: 30 }, (_, n) => ID(1000 + n));
    const index = recordIndexOf([...ids.map((id) => product(id, { handle: '' })), collection(C1, { productIds: ids })]);
    const record = index.find('collection', C1)?.record;
    expect(record).toMatchObject({ productsCount: 30 });
    const cards = record !== undefined && 'products' in record ? record.products : [];
    expect(cards.map((card) => card.id)).toEqual(ids.slice(0, COLLECTION_PRODUCTS_MAX));
  });

  it('карточка товара — первые два фото, image — первое', () => {
    const images = ['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg', 'https://s3.merfy.ru/p/3.jpg'];
    const index = recordIndexOf([product(P1, { images }), collection(C1, { productIds: [P1] })]);
    const record = index.find('collection', C1)?.record;
    const card = record !== undefined && 'products' in record ? record.products[0] : undefined;
    expect(card?.images).toEqual(['https://s3.merfy.ru/p/1.jpg', 'https://s3.merfy.ru/p/2.jpg']);
    expect(card?.image).toBe('https://s3.merfy.ru/p/1.jpg');
  });

  it('карточка товара — образцы цвета: группа с заливкой, значения без заливки и лишние отпадают; сочетание — по умолчанию', () => {
    const swatch = (id: string, value: string, hex: string | null) => ({ id, value, images: [], swatch: hex });
    const options = [
      { id: 'g-size', name: 'Размер', values: [swatch('s-1', 'S', null), swatch('s-2', 'M', null)] },
      {
        id: 'g-color',
        name: 'Цвет',
        values: [
          swatch('c-1', 'Синий', '#1d4ed8'),
          swatch('c-2', 'Без заливки', null),
          ...Array.from({ length: COLOR_SWATCHES_MAX }, (_, n) => swatch(`c-${n + 3}`, `Цвет ${n}`, '#000000')),
        ],
      },
    ];
    const variants = [
      { id: 'v-s', title: 'S', price: 190000, compareAtPrice: null, available: false, options: { Размер: 'S' } },
      { id: 'v-m', title: 'M', price: 190000, compareAtPrice: null, available: true, options: { Размер: 'M' } },
    ];
    const index = recordIndexOf([product(P1, { options, variants }), collection(C1, { productIds: [P1] })]);
    const record = index.find('collection', C1)?.record;
    const card = record !== undefined && 'products' in record ? record.products[0] : undefined;
    expect(card?.colors).toHaveLength(COLOR_SWATCHES_MAX);
    expect(card?.colors[0]).toEqual({ title: 'Синий', swatch: '#1d4ed8' });
    expect(card?.colors.map((color) => color.title)).not.toContain('Без заливки');
    // Сочетания из первых значений групп (S и Синий) нет — берётся первое в наличии.
    expect(card?.variantId).toBe('v-m');
    const plain = recordIndexOf([product(P1, { options: [], variants: [] }), collection(C1, { productIds: [P1] })]);
    const plainRecord = plain.find('collection', C1)?.record;
    const plainCard = plainRecord !== undefined && 'products' in plainRecord ? plainRecord.products[0] : undefined;
    expect(plainCard).toMatchObject({ variantId: null, colors: [] });
  });
});

describe('дата публикации словами', () => {
  it('«20 октября 2026 г.»: число без нуля, месяц в родительном падеже', () => {
    expect(publishedTextOf('2026-10-20T10:00:00.000Z')).toBe('20 октября 2026 г.');
    expect(publishedTextOf('2026-03-05T10:00:00.000Z')).toBe('5 марта 2026 г.');
  });

  it('день — по Москве: 22:30 UTC уже следующее число', () => {
    expect(publishedTextOf('2026-12-31T22:30:00.000Z')).toBe('1 января 2027 г.');
  });

  it('даты нет или она не читается — пустая строка', () => {
    expect(publishedTextOf(null)).toBe('');
    expect(publishedTextOf('не дата')).toBe('');
  });

  it('статья без даты — publishedAt null и publishedText пустой, и в записи, и в карточке блога', () => {
    const index = recordIndexOf([blog(B1), article(A1, { publishedAt: null })]);
    expect(index.find('article', A1)?.record).toMatchObject({ publishedAt: null, publishedText: '' });
    const cards = index.find('blog', B1)?.record;
    expect(cards !== undefined && 'articles' in cards ? cards.articles[0] : undefined).toMatchObject({
      publishedAt: null,
      publishedText: '',
    });
  });
});

describe('блог и статьи', () => {
  it('статья: текст, обложка, дата, блог — ссылкой; SEO мерчанта; зависимости — статья и блог', () => {
    const index = recordIndexOf([blog(B1), article(A1, { seo: { title: 'Уход за льном', description: '' } })]);
    const entry = index.find('article', A1);
    expect(entry).toMatchObject({ path: '/blogs/novosti/linen', aliases: [], entity: { type: 'publication', id: A1 } });
    expect(entry?.record).toEqual({
      id: A1,
      title: 'Как ухаживать за льном',
      slug: 'linen',
      url: '/blogs/novosti/linen',
      publishedAt: '2026-10-19T10:00:00.000Z',
      publishedText: '19 октября 2026 г.',
      cover: 'https://s3.merfy.ru/a/1.jpg',
      excerpt: 'Стирка и глажка',
      html: '<p>Стирать при 30°</p>',
      blog: { title: 'Новости', url: '/blogs/novosti' },
    });
    expect(Object.keys(entry?.record ?? {}).sort()).toEqual([...RECORD_FIELDS.article].sort());
    expect(entry?.seo).toEqual({
      title: 'Уход за льном',
      description: 'Стирка и глажка',
      image: 'https://s3.merfy.ru/a/1.jpg',
    });
    expect(entry?.deps).toEqual(['publication:' + A1, 'blog:' + B1]);
  });

  it(`блог: первые ${BLOG_ARTICLES_MAX} статей, новые сверху; нет даты публикации — по дате правки`, () => {
    const dated = Array.from({ length: 15 }, (_, n) =>
      article(ID(500 + n), {
        title: `Статья ${n}`,
        slug: `statya-${n}`,
        publishedAt: `2026-10-${String(n + 1).padStart(2, '0')}T10:00:00.000Z`,
      }),
    );
    const undated = article(A2, { title: 'Без даты', slug: 'bez-daty', publishedAt: null }, '2026-10-31T10:00:00.000Z');
    const entry = recordIndexOf([blog(B1), ...dated, undated]).find('blog', B1);
    expect(entry).toMatchObject({ path: '/blogs/novosti', aliases: [], entity: { type: 'blog', id: B1 } });
    const record = entry?.record;
    expect(record).toMatchObject({
      id: B1,
      title: 'Новости',
      handle: 'novosti',
      url: '/blogs/novosti',
      articlesCount: 16,
    });
    expect(Object.keys(record ?? {}).sort()).toEqual([...RECORD_FIELDS.blog].sort());
    const cards = record !== undefined && 'articles' in record ? record.articles : [];
    expect(cards.map((card) => card.title)).toEqual([
      'Без даты',
      ...Array.from({ length: 11 }, (_, n) => `Статья ${14 - n}`),
    ]);
    expect(cards[1]).toEqual({
      id: ID(514),
      title: 'Статья 14',
      url: '/blogs/novosti/statya-14',
      publishedAt: '2026-10-15T10:00:00.000Z',
      publishedText: '15 октября 2026 г.',
      cover: 'https://s3.merfy.ru/a/1.jpg',
      excerpt: 'Стирка и глажка',
    });
    expect(entry?.seo).toEqual({ title: 'Новости', description: '', image: null });
    expect(entry?.deps.slice(0, 3)).toEqual(['blog:' + B1, 'publication:' + A2, 'publication:' + ID(514)]);
  });

  it('статья без своего блога во входах — записи нет и в счётчик блога она не идёт', () => {
    const index = recordIndexOf([blog(B1), article(A1), article(A2, { blogId: ID(399), slug: 'chuzhaya' })]);
    expect(index.find('article', A2)).toBeNull();
    expect(index.find('blog', B1)?.record).toMatchObject({ articlesCount: 1 });
  });
});

describe('политики и порядок записей', () => {
  it('запись — у политики с текстом; адрес и название — из POLICY_PAGES, текст — HTML', () => {
    const index = recordIndexOf([
      policy('tos', 'Условия'),
      policy('privacy', '  '),
      policy('refund', 'Возврат за 14 дней'),
    ]);
    expect(index.entries.filter((entry) => entry.type === 'policy').map((entry) => entry.id)).toEqual([
      'refund',
      'tos',
    ]);
    const entry = index.atPath('/legal/terms');
    expect(entry).toMatchObject({
      type: 'policy',
      id: 'tos',
      aliases: [],
      entity: { type: 'policy', id: 'tos' },
      deps: ['policy:tos'],
      updatedAt: AT,
    });
    expect(entry?.record).toEqual({
      type: 'tos',
      title: 'Условия обслуживания',
      url: '/legal/terms',
      html: '<p>Условия</p>',
    });
    expect(entry?.seo).toEqual({ title: 'Условия обслуживания', description: '', image: null });
  });

  it('порядок — по типам RECORD_TYPES, внутри типа — по id; products — товары по порядку входов', () => {
    const index = recordIndexOf([
      policy('refund', 'Текст'),
      article(A1),
      blog(B1),
      collection(C1),
      product(P2, { handle: 'pled' }),
      product(P1),
    ]);
    expect(index.entries.map((entry) => `${entry.type}:${entry.id}`)).toEqual([
      'product:' + P1,
      'product:' + P2,
      'collection:' + C1,
      'blog:' + B1,
      'article:' + A1,
      'policy:refund',
    ]);
    expect(index.products.map((entry) => entry.id)).toEqual([P2, P1]);
  });
});
