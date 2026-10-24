import type { Entity } from './inputs';
import {
  recordIndexOf,
  type BlogData,
  type CollectionData,
  type ProductData,
  type PublicationData,
  type RecordEntry,
  type RecordIndex,
  type RecordType,
} from './records';

// Превью шаблонов записей (блок 8 «Секций и SDK», часть 8б-2; design.md 8.9, Р8б-14): страницы всех шаблонов, запись
// по id или адресу, запись по умолчанию и примеры платформы для видов без записей. Только превью конструктора: в
// сборку и дорисовку примеры не идут — там маршруты в режиме live.

// Блог по умолчанию — «Новости»: он есть у каждого магазина (контракт «Публикаций», факт 21 design.md).
export const DEFAULT_BLOG_HANDLE = 'novosti';

// Дата правки примеров: у сущности входов она обязательна, примеры не меняются.
const EXAMPLE_AT = '1970-01-01T00:00:00.000Z';
const NO_SEO = { title: '', description: '' };

// Картинка-заглушка примера: серый прямоугольник 4:5 data:-адресом — в превью файлы платформы с адреса шлюза не
// раздаются.
export const EXAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#ececec"/></svg>',
)}`;

export const EXAMPLE_IDS = {
  product: 'example-product',
  collection: 'example-collection',
  blog: 'example-blog',
  article: 'example-article',
  policy: 'privacy',
} as const;

const EXAMPLE_PRODUCT: ProductData = {
  title: 'Пример товара',
  handle: 'primer-tovara',
  description: 'Так выглядит товар на этой странице. Это пример: в магазине пока нет товаров.',
  price: 0,
  compareAtPrice: null,
  images: [EXAMPLE_IMAGE],
  available: true,
  options: [],
  variants: [],
  collectionIds: [],
  seo: NO_SEO,
};

// productIds — товары превью: записи товаров магазина, нет их — пример товара.
const EXAMPLE_COLLECTION: Omit<CollectionData, 'productIds'> = {
  title: 'Пример коллекции',
  handle: 'primer-kollekcii',
  description: 'Так выглядит коллекция на этой странице. Это пример: в магазине пока нет коллекций.',
  images: [],
  seo: NO_SEO,
};

const EXAMPLE_BLOG: BlogData = { title: 'Пример блога', handle: 'primer-bloga' };

// blogId и blogHandle — блог по умолчанию (defaultRecord), блогов нет — пример блога.
const EXAMPLE_ARTICLE: Omit<PublicationData, 'blogId' | 'blogHandle'> = {
  title: 'Пример записи',
  slug: 'primer-zapisi',
  excerpt: 'Так выглядит запись блога на этой странице.',
  content: '<p>Так выглядит запись блога на этой странице. Это пример: в блоге пока нет записей.</p>',
  publishedAt: null,
  cover: null,
  seo: NO_SEO,
};

const EXAMPLE_POLICY_TEXT =
  'Так выглядит политика на этой странице. Это пример: тексты политик магазина пока не заполнены.';

const entriesOf = (index: RecordIndex, type: RecordType): readonly RecordEntry[] =>
  index.entries.filter((entry) => entry.type === type);

// Самая свежая статья: наибольшая publishedAt ?? updatedAt, при равенстве — меньший id.
function newestArticleOf(index: RecordIndex): RecordEntry | null {
  const articles = entriesOf(index, 'article');
  const dated = (entry: RecordEntry): string =>
    entry.type === 'article' ? (entry.record.publishedAt ?? entry.updatedAt) : '';
  return (
    [...articles].sort((left, right) => {
      const byDate = dated(right).localeCompare(dated(left));
      if (byDate !== 0) return byDate;
      return left.id < right.id ? -1 : 1;
    })[0] ?? null
  );
}

// Блог по умолчанию — как превью пяти тем на проде: «Новости» со статьями; пуст — блог самой свежей записи; нет и
// его — «Новости» без статей; нет и его — первый блог.
function defaultBlogOf(index: RecordIndex): RecordEntry | null {
  const blogs = entriesOf(index, 'blog');
  if (blogs.length === 0) return null;
  const news = blogs.find(
    (blog) => blog.type === 'blog' && blog.record.handle === DEFAULT_BLOG_HANDLE && blog.record.articlesCount > 0,
  );
  if (news !== undefined) return news;
  const newest = newestArticleOf(index);
  const blogOfArticle = newest?.type === 'article' ? index.atPath(newest.record.blog.url) : null;
  if (blogOfArticle?.type === 'blog') return blogOfArticle;
  return blogs.find((blog) => blog.type === 'blog' && blog.record.handle === DEFAULT_BLOG_HANDLE) ?? blogs[0] ?? null;
}

// Запись шаблона по умолчанию (правила — в __tests__/record-preview.test.ts): записей вида нет — null; пример
// подставит recordExamples.
const DEFAULT_RECORD: Readonly<Record<RecordType, (index: RecordIndex) => RecordEntry | null>> = {
  product: (index) => index.products[0] ?? null,
  collection: (index) => entriesOf(index, 'collection')[0] ?? null,
  blog: defaultBlogOf,
  article: newestArticleOf,
  policy: (index) => entriesOf(index, 'policy')[0] ?? null,
};

export function defaultRecord(index: RecordIndex, type: RecordType): RecordEntry | null {
  return DEFAULT_RECORD[type](index);
}

const exampleEntity = (id: string, type: Entity['type'], data: Entity['data']): Entity => ({
  type,
  id,
  updatedAt: EXAMPLE_AT,
  data,
});

// Сущности-примеры — только для видов, у которых в index нет ни одной записи: товар, коллекция, блог, запись, политика.
export function recordExamples(index: RecordIndex): Entity[] {
  const has = (type: RecordType): boolean => index.entries.some((entry) => entry.type === type);
  const examples: Entity[] = [];
  if (!has('product')) examples.push(exampleEntity(EXAMPLE_IDS.product, 'product', EXAMPLE_PRODUCT));
  if (!has('collection')) {
    const productIds = index.products.map((product) => product.id);
    examples.push(
      exampleEntity(EXAMPLE_IDS.collection, 'collection', {
        ...EXAMPLE_COLLECTION,
        productIds: productIds.length > 0 ? productIds : [EXAMPLE_IDS.product],
      }),
    );
  }
  if (!has('blog')) examples.push(exampleEntity(EXAMPLE_IDS.blog, 'blog', EXAMPLE_BLOG));
  if (!has('article')) {
    const blog = defaultRecord(index, 'blog');
    examples.push(
      exampleEntity(EXAMPLE_IDS.article, 'publication', {
        ...EXAMPLE_ARTICLE,
        blogId: blog?.id ?? EXAMPLE_IDS.blog,
        blogHandle: blog?.type === 'blog' ? blog.record.handle : EXAMPLE_BLOG.handle,
      }),
    );
  }
  if (!has('policy')) examples.push(exampleEntity(EXAMPLE_IDS.policy, 'policy', { content: EXAMPLE_POLICY_TEXT }));
  return examples;
}

// Записи превью: сущности магазина плюс примеры — один индекс на сущности (WeakMap), как recordIndex у сборки.
const previewIndexes = new WeakMap<readonly Entity[], RecordIndex>();

export function previewRecordIndex(entities: readonly Entity[], index: RecordIndex): RecordIndex {
  const known = previewIndexes.get(entities);
  if (known !== undefined) return known;
  const preview = recordIndexOf([...entities, ...recordExamples(index)]);
  previewIndexes.set(entities, preview);
  return preview;
}
