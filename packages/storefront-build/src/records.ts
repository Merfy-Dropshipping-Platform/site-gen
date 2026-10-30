import type { Entity, EntityType } from './inputs';
import { z } from 'zod';

// Записи магазина (блок 8 «Секций и SDK», часть 8а): товар, коллекция, блог, статья и политика из сущностей входов
// сборки — публичные поля (design.md блока 8, 8.3), адрес, SEO и зависимости страницы. Их читают страницы записей
// (часть 8б) и поля секций с записями (часть 8г). Только входы сборки: сети и базы здесь нет.

export const RECORD_TYPES = ['product', 'collection', 'blog', 'article', 'policy'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

// Данные сущностей — их пишет сборщик (storefront-builder: catalog.ts, snapshot.ts). type, а не interface: такой объект
// присваивается полю data входов (JSON) без приведения. Цены — копейки.
export type RecordSeoData = { title: string; description: string };
export type ProductOptionData = {
  id: string;
  name: string;
  values: { id: string; value: string; images: string[]; swatch: string | null }[];
};
export type ProductVariantData = {
  id: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  options: Record<string, string>;
};
export type ProductData = {
  title: string;
  // Адрес из product.list: handle, нет — id. Годится ли он для страницы — recordSlug.
  handle: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  images: string[];
  available: boolean;
  // Остатка нет, заказ разрешён (product отдаёт preorder); без поля в данных — false.
  preorder: boolean;
  options: ProductOptionData[];
  variants: ProductVariantData[];
  collectionIds: string[];
  seo: RecordSeoData;
};
export type CollectionData = {
  title: string;
  handle: string;
  description: string;
  images: string[];
  // Товары по порядку мерчанта (position).
  productIds: string[];
  seo: RecordSeoData;
};
export type BlogData = { title: string; handle: string };
export type PublicationData = {
  title: string;
  slug: string;
  blogId: string;
  blogHandle: string;
  excerpt: string | null;
  // HTML, уже очищенный сборщиком (cleanArticleHtml пакета storefront-sections).
  content: string;
  publishedAt: string | null;
  cover: string | null;
  seo: RecordSeoData;
};

export interface Money {
  // Копейки.
  amount: number;
  currency: 'RUB';
  // «1 900 ₽»: целые рубли, тысячи — через неразрывный пробел.
  text: string;
}
export interface RecordLink {
  id: string;
  title: string;
  url: string;
}
export interface ProductOptionValue {
  id: string;
  value: string;
  images: string[];
  swatch: string | null;
}
export interface ProductOption {
  id: string;
  name: string;
  values: ProductOptionValue[];
}
export interface ProductVariant {
  id: string;
  title: string;
  price: Money;
  compareAtPrice: Money | null;
  available: boolean;
  options: Record<string, string>;
}
export interface ProductRecord {
  id: string;
  title: string;
  slug: string;
  url: string;
  description: string;
  price: Money;
  compareAtPrice: Money | null;
  images: string[];
  available: boolean;
  // Под заказ: остатка нет, заказ разрешён (available при этом true); без данных — false.
  preorder: boolean;
  options: ProductOption[];
  variants: ProductVariant[];
  // Коллекции товара, у которых есть запись.
  collections: RecordLink[];
  updatedAt: string;
}
// Образец цвета на карточке: значение группы вариантов с заливкой (swatch) — название и цвет `#rrggbb`.
export interface ProductColor {
  title: string;
  swatch: string;
}
export interface ProductCard {
  id: string;
  title: string;
  url: string;
  price: Money;
  compareAtPrice: Money | null;
  image: string | null;
  available: boolean;
  // Под заказ: остатка нет, заказ разрешён (как у товара).
  preorder: boolean;
  // Первые два фото — «второе фото при наведении» у карточек секций (поведение card-photos); image — первое.
  images: string[];
  // Сочетание по умолчанию (defaultVariantId): его кладёт в корзину «В корзину» на карточке; без вариантов — null.
  variantId: string | null;
  // Образцы цвета: первая группа вариантов, у значений которой есть заливка; до COLOR_SWATCHES_MAX; цветов нет — [].
  colors: ProductColor[];
}
export interface CollectionRecord {
  id: string;
  title: string;
  slug: string;
  url: string;
  description: string;
  images: string[];
  // Все товары коллекции с записью; в products — первые COLLECTION_PRODUCTS_MAX.
  productsCount: number;
  products: ProductCard[];
}
export interface ArticleCard {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  // Дата словами для вывода: «20 октября 2026 г.»; даты нет — пустая строка.
  publishedText: string;
  cover: string | null;
  excerpt: string;
}
export interface BlogRecord {
  id: string;
  title: string;
  handle: string;
  url: string;
  articlesCount: number;
  // Первые BLOG_ARTICLES_MAX, новые сверху.
  articles: ArticleCard[];
}
export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  url: string;
  publishedAt: string | null;
  // Дата словами для вывода: «20 октября 2026 г.»; даты нет — пустая строка.
  publishedText: string;
  cover: string | null;
  excerpt: string;
  html: string;
  blog: { title: string; url: string };
}
export interface PolicyRecord {
  type: string;
  title: string;
  url: string;
  html: string;
}
export interface RecordOf {
  product: ProductRecord;
  collection: CollectionRecord;
  blog: BlogRecord;
  article: ArticleRecord;
  policy: PolicyRecord;
}

// Публичные поля по типам (design.md блока 8, 8.3): ровно ключи записи. Их же сверяет проверка data-field-private (8г).
export const RECORD_FIELDS = {
  product: [
    'id',
    'title',
    'slug',
    'url',
    'description',
    'price',
    'compareAtPrice',
    'images',
    'available',
    'preorder',
    'options',
    'variants',
    'collections',
    'updatedAt',
  ],
  collection: ['id', 'title', 'slug', 'url', 'description', 'images', 'productsCount', 'products'],
  blog: ['id', 'title', 'handle', 'url', 'articlesCount', 'articles'],
  article: ['id', 'title', 'slug', 'url', 'publishedAt', 'publishedText', 'cover', 'excerpt', 'html', 'blog'],
  policy: ['type', 'title', 'url', 'html'],
} as const satisfies { [T in RecordType]: readonly (keyof RecordOf[T])[] };

export const COLLECTION_PRODUCTS_MAX = 24;
export const BLOG_ARTICLES_MAX = 12;
const SEO_DESCRIPTION_MAX = 160;

// Политики магазина: тип в базе, адрес страницы и название — как у пяти тем на проде (подвал и страницы /legal).
export const POLICY_PAGES: readonly { type: string; slug: string; title: string }[] = [
  { type: 'refund', slug: 'refund', title: 'Политика возврата' },
  { type: 'privacy', slug: 'privacy', title: 'Политика конфиденциальности' },
  { type: 'tos', slug: 'terms', title: 'Условия обслуживания' },
  { type: 'shipping', slug: 'shipping-policy', title: 'Политика доставки' },
];

const SLUG = /^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u;
const SLUG_MAX = 200;

// Цена в копейках → Money; текст — как у пяти тем на проде.
export const money = (amount: number): Money => ({
  amount,
  currency: 'RUB',
  text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽`,
});

// Дата публикации словами, как у пяти тем на проде: «20 октября 2026 г.». День — по московскому времени: запись,
// опубликованную в 01:30 по Москве, не показывать вчерашним числом. Даты нет или она не читается — пустая строка.
const PUBLISHED_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export function publishedTextOf(publishedAt: string | null): string {
  if (publishedAt === null) return '';
  const time = Date.parse(publishedAt);
  return Number.isNaN(time) ? '' : PUBLISHED_FORMAT.format(time);
}

// Адрес записи (Р8а-10): handle — если это буквы, цифры, «-» и «_», до 200 знаков; иначе id.
export const recordSlug = (handle: string, id: string): string =>
  handle.length <= SLUG_MAX && SLUG.test(handle) ? handle : id;

export const recordPath = {
  product: (slug: string): string => `/product/${slug}`,
  collection: (slug: string): string => `/collections/${slug}`,
  blog: (handle: string): string => `/blogs/${handle}`,
  article: (blog: string, slug: string): string => `/blogs/${blog}/${slug}`,
  policy: (slug: string): string => `/legal/${slug}`,
} as const;

// Текст политики из админки → HTML, как на проде (site-gen origin/prod, src/render/page-transclude.ts:60-73): пустая
// строка — новый абзац, перенос — <br>, знаки &, <, > экранируются.
export function policyTextToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

export interface RecordSeo {
  // <title>: SEO-заголовок записи, нет — название.
  title: string;
  // SEO-описание; нет — описание (у статьи — анонс) без HTML до 160 знаков; у блога и политики — пусто.
  description: string;
  // Первая картинка, у статьи — обложка; нет — null.
  image: string | null;
}

export interface RecordEntryOf<T extends RecordType> {
  type: T;
  // id сущности; у политики — её тип (refund).
  id: string;
  // Основной адрес страницы записи.
  path: string;
  // У товара и коллекции с адресом по handle — адрес по id (301 на основной, часть 8б); иначе пусто.
  aliases: string[];
  // Сущность страницы для строки манифеста: product, collection, blog, publication, policy.
  entity: { type: EntityType; id: string };
  record: RecordOf[T];
  seo: RecordSeo;
  // Ключи «тип:id» сущностей, из которых собрана запись; сама запись — первой.
  deps: string[];
  // Последняя правка среди deps — lastmod карты сайта.
  updatedAt: string;
}
export type RecordEntry = { [T in RecordType]: RecordEntryOf<T> }[RecordType];

export interface RecordDuplicate {
  type: RecordType;
  id: string;
  // Адрес по handle, который заняла другая запись.
  path: string;
}

export interface RecordIndex {
  // По RECORD_TYPES, внутри типа — по id.
  entries: readonly RecordEntry[];
  // Товары по порядку сущностей входов — как product.list на проде: новые сверху. Товар по умолчанию в превью шаблона
  // (8б-2) и у пустого поля товара в секции (8г) — первый из них.
  products: readonly RecordEntryOf<'product'>[];
  find(type: RecordType, id: string): RecordEntry | null;
  // По основному адресу или адресу из aliases.
  atPath(path: string): RecordEntry | null;
  // Записи без страницы: заняты и адрес по handle, и адрес по id.
  duplicates: readonly RecordDuplicate[];
}

// Разбор данных сущностей (Р8а-15): та же форма, что тип данных; лишнее поле — не ошибка, не прошла — записи нет.
const seoDataSchema = z.object({ title: z.string(), description: z.string() });
const productDataSchema = z.object({
  title: z.string(),
  handle: z.string(),
  description: z.string(),
  price: z.number(),
  compareAtPrice: z.number().nullable(),
  images: z.array(z.string()),
  available: z.boolean(),
  // Записи, сохранённые до поля, и каталог без него — не под заказ.
  preorder: z.boolean().catch(false),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      values: z.array(
        z.object({ id: z.string(), value: z.string(), images: z.array(z.string()), swatch: z.string().nullable() }),
      ),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      compareAtPrice: z.number().nullable(),
      available: z.boolean(),
      options: z.record(z.string(), z.string()),
    }),
  ),
  collectionIds: z.array(z.string()),
  seo: seoDataSchema,
});
const collectionDataSchema = z.object({
  title: z.string(),
  handle: z.string(),
  description: z.string(),
  images: z.array(z.string()),
  productIds: z.array(z.string()),
  seo: seoDataSchema,
});
const blogDataSchema = z.object({ title: z.string(), handle: z.string() });
const publicationDataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  blogId: z.string(),
  blogHandle: z.string(),
  excerpt: z.string().nullable(),
  content: z.string(),
  publishedAt: z.string().nullable(),
  cover: z.string().nullable(),
  seo: seoDataSchema,
});
const policyDataSchema = z.object({ content: z.string() });

type ProductItem = z.infer<typeof productDataSchema>;
type CollectionItem = z.infer<typeof collectionDataSchema>;
type PublicationItem = z.infer<typeof publicationDataSchema>;

interface Source<D> {
  entity: Entity;
  data: D;
}

interface Placed<D> extends Source<D> {
  slug: string;
  path: string;
}

// Сущность с данными по форме; данные не по формату — null, записи нет (Р8а-15).
function parseOf<D>(schema: z.ZodType<D>, entity: Entity): D | null {
  const parsed = schema.safeParse(entity.data);
  return parsed.success ? parsed.data : null;
}

function sourcesOf<D>(schema: z.ZodType<D>, entities: readonly Entity[], type: Entity['type']): Source<D>[] {
  return entities.flatMap((entity): Source<D>[] => {
    const data = parseOf(schema, entity);
    return entity.type === type && data !== null ? [{ entity, data }] : [];
  });
}

// Адреса внутри типа (Р8а-10): по id; адрес по handle занят основным адресом раньше — адрес по id, занят и он — записи
// нет, строка в duplicates с адресом по handle.
function placeAll<D, I extends Source<D>>(
  type: RecordType,
  items: readonly I[],
  slugOf: (item: I) => string,
  pathOf: (slug: string, id: string, item: I) => string,
): { placed: (I & { slug: string; path: string })[]; duplicates: RecordDuplicate[] } {
  const taken = new Set<string>();
  const duplicates: RecordDuplicate[] = [];
  const placed: (I & { slug: string; path: string })[] = [];
  const byId = [...items].sort((left, right) => (left.entity.id < right.entity.id ? -1 : 1));
  for (const item of byId) {
    const id = item.entity.id;
    const handleSlug = slugOf(item);
    const handlePath = pathOf(handleSlug, id, item);
    const idPath = pathOf(id, id, item);
    if (taken.has(handlePath) && taken.has(idPath)) {
      duplicates.push({ type, id, path: handlePath });
    } else if (taken.has(handlePath)) {
      taken.add(idPath);
      placed.push({ ...item, slug: id, path: idPath });
    } else {
      taken.add(handlePath);
      placed.push({ ...item, slug: handleSlug, path: handlePath });
    }
  }
  return { placed, duplicates };
}

// Адрес по id у товара и коллекции — второй адрес (301), если он не основной и не основной адрес другой записи.
const aliasesOf = (idPath: string, path: string, mainPaths: ReadonlySet<string>): string[] =>
  idPath !== path && !mainPaths.has(idPath) ? [idPath] : [];

// SEO-описание без HTML: теги — пробел, пробелы подряд — один, края обрезаны, до 160 знаков.
function seoDescriptionOf(text: string): string {
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(plain).slice(0, SEO_DESCRIPTION_MAX).join('');
}

const seoOfData = (
  data: { title: string; description: string; seo: { title: string; description: string } },
  image: string | null,
): RecordSeo => ({
  title: data.seo.title !== '' ? data.seo.title : data.title,
  description: data.seo.description !== '' ? data.seo.description : seoDescriptionOf(data.description),
  image,
});

const firstImage = (images: readonly string[]): string | null => images[0] ?? null;
const latestOf = (dates: readonly string[]): string => dates.reduce((latest, at) => (at > latest ? at : latest));
const depOf = (entity: Entity): string => `${entity.type}:${entity.id}`;

// Деньги варианта и товара: старая цена null — её нет.
const priceOf = (amount: number): Money => money(amount);
const compareAtOf = (amount: number | null): Money | null => (amount === null ? null : money(amount));

// Товар: цены — Money, коллекции — ссылками на записи.
function productRecordOf(item: Placed<ProductItem>, collections: readonly RecordLink[]): ProductRecord {
  const { entity, data, slug } = item;
  const variantOf = (variant: ProductItem['variants'][number]): ProductVariant => ({
    ...variant,
    price: priceOf(variant.price),
    compareAtPrice: compareAtOf(variant.compareAtPrice),
  });
  return {
    id: entity.id,
    title: data.title,
    slug,
    url: recordPath.product(slug),
    description: data.description,
    price: priceOf(data.price),
    compareAtPrice: compareAtOf(data.compareAtPrice),
    images: data.images,
    available: data.available,
    preorder: data.preorder,
    options: data.options,
    variants: data.variants.map(variantOf),
    collections: [...collections],
    updatedAt: entity.updatedAt,
  };
}

// Сочетание по умолчанию — правило прода (site-gen origin/prod, packages/theme-base/runtime/variant-default.ts,
// pickDefaultCombination): сочетание первых значений групп — в наличии, иначе любое; нет — первое в наличии; нет —
// первое; вариантов нет — null.
export function defaultVariantId(product: ProductRecord): string | null {
  const firsts = product.options
    .filter((group) => group.values.length > 0)
    .map((group) => ({ name: group.name, value: group.values[0]?.value ?? '' }));
  const byFirst = product.variants.find((variant) =>
    firsts.every(({ name, value }) => variant.options[name] === value),
  );
  if (byFirst !== undefined) return byFirst.id;
  const inStock = product.variants.find((variant) => variant.available);
  return (inStock ?? product.variants[0])?.id ?? null;
}

export const COLOR_SWATCHES_MAX = 6;

// Образцы цвета карточки: первая группа, у значений которой есть заливка; значения без заливки в образцы не идут.
function colorsOf(product: ProductRecord): ProductColor[] {
  const group = product.options.find((option) => option.values.some((value) => value.swatch !== null));
  if (group === undefined) return [];
  return group.values
    .flatMap((value) => (value.swatch === null ? [] : [{ title: value.value, swatch: value.swatch }]))
    .slice(0, COLOR_SWATCHES_MAX);
}

// Карточка товара — одна на все места, где секция показывает список: товары коллекции записи, список страницы
// (page-list.ts) и поля с записями секции (section-records.ts).
export function cardOfRecord(record: ProductRecord): ProductCard {
  return {
    id: record.id,
    title: record.title,
    url: record.url,
    price: record.price,
    compareAtPrice: record.compareAtPrice,
    image: firstImage(record.images),
    available: record.available,
    preorder: record.preorder,
    images: record.images.slice(0, 2),
    variantId: defaultVariantId(record),
    colors: colorsOf(record),
  };
}

const productCardOf = (item: Placed<ProductItem>): ProductCard => cardOfRecord(productRecordOf(item, []));

// Коллекция: товары по порядку мерчанта, только с записью; в записи — первые COLLECTION_PRODUCTS_MAX.
function collectionOf(
  item: Placed<CollectionItem>,
  products: readonly Placed<ProductItem>[],
): { record: CollectionRecord; cards: Placed<ProductItem>[] } {
  const { entity, data, slug } = item;
  const byId = new Map(products.map((product): [string, Placed<ProductItem>] => [product.entity.id, product]));
  const cards = data.productIds.flatMap((id) => {
    const product = byId.get(id);
    return product === undefined ? [] : [product];
  });
  const record: CollectionRecord = {
    id: entity.id,
    title: data.title,
    slug,
    url: recordPath.collection(slug),
    description: data.description,
    images: data.images,
    productsCount: cards.length,
    products: cards.slice(0, COLLECTION_PRODUCTS_MAX).map(productCardOf),
  };
  return { record, cards };
}

// Статья блога: текст уже очищен сборщиком, блог — ссылкой.
function articleRecordOf(item: Placed<PublicationItem>, blog: Placed<BlogData>): ArticleRecord {
  const { entity, data, slug } = item;
  return {
    id: entity.id,
    title: data.title,
    slug,
    url: recordPath.article(blog.slug, slug),
    publishedAt: data.publishedAt,
    publishedText: publishedTextOf(data.publishedAt),
    cover: data.cover,
    excerpt: data.excerpt ?? '',
    html: data.content,
    blog: { title: blog.data.title, url: recordPath.blog(blog.slug) },
  };
}

// Статьи блога — новые сверху по publishedAt ?? updatedAt, при равенстве — по id.
function byNewest(left: Source<PublicationItem>, right: Source<PublicationItem>): number {
  const dateOf = (item: Source<PublicationItem>): number => Date.parse(item.data.publishedAt ?? item.entity.updatedAt);
  const difference = dateOf(right) - dateOf(left);
  if (difference !== 0) return difference;
  return left.entity.id < right.entity.id ? -1 : 1;
}

// Записи товаров: ссылки на коллекции, deps и дата правки — по записям коллекций товара.
function productEntriesOf(
  items: readonly Placed<ProductItem>[],
  collections: readonly Placed<CollectionItem>[],
): RecordEntryOf<'product'>[] {
  const byId = new Map(collections.map((item): [string, Placed<CollectionItem>] => [item.entity.id, item]));
  return items.map((item) => {
    const links = item.data.collectionIds.flatMap((id) => {
      const collection = byId.get(id);
      return collection === undefined
        ? []
        : [{ id, title: collection.data.title, url: recordPath.collection(collection.slug) }];
    });
    const depItems = item.data.collectionIds.flatMap((id) => {
      const collection = byId.get(id);
      return collection === undefined ? [] : [collection.entity];
    });
    const deps = [item.entity, ...depItems];
    return {
      type: 'product',
      id: item.entity.id,
      path: item.path,
      aliases: aliasesOf(recordPath.product(item.entity.id), item.path, new Set(items.map((other) => other.path))),
      entity: { type: 'product', id: item.entity.id },
      record: productRecordOf(item, links),
      seo: seoOfData(item.data, firstImage(item.data.images)),
      deps: deps.map(depOf),
      updatedAt: latestOf(deps.map((dep) => dep.updatedAt)),
    };
  });
}

// Записи коллекций: товары карточек — deps и дата правки.
function collectionEntriesOf(
  items: readonly Placed<CollectionItem>[],
  products: readonly Placed<ProductItem>[],
): RecordEntryOf<'collection'>[] {
  return items.map((item) => {
    const { record, cards } = collectionOf(item, products);
    const deps = [item.entity, ...cards.map((card) => card.entity)];
    return {
      type: 'collection',
      id: item.entity.id,
      path: item.path,
      aliases: aliasesOf(recordPath.collection(item.entity.id), item.path, new Set(items.map((other) => other.path))),
      entity: { type: 'collection', id: item.entity.id },
      record,
      seo: seoOfData(item.data, firstImage(item.data.images)),
      deps: deps.map(depOf),
      updatedAt: latestOf(deps.map((dep) => dep.updatedAt)),
    };
  });
}

// Статьи блога — только его, новые сверху, первые BLOG_ARTICLES_MAX.
function blogArticlesOf(blogId: string, articles: readonly Placed<PublicationItem>[]): Placed<PublicationItem>[] {
  return articles
    .filter((article) => article.data.blogId === blogId)
    .sort(byNewest)
    .slice(0, BLOG_ARTICLES_MAX);
}

// Карточка статьи для списка блога.
function articleCardOf(blogSlug: string, article: Placed<PublicationItem>): ArticleCard {
  return {
    id: article.entity.id,
    title: article.data.title,
    url: recordPath.article(blogSlug, article.slug),
    publishedAt: article.data.publishedAt,
    publishedText: publishedTextOf(article.data.publishedAt),
    cover: article.data.cover,
    excerpt: article.data.excerpt ?? '',
  };
}

// Запись блога: первые BLOG_ARTICLES_MAX статей, счётчик — все статьи блога с записью.
function blogEntryOf(
  item: Placed<BlogData>,
  own: readonly Placed<PublicationItem>[],
  total: number,
): RecordEntryOf<'blog'> {
  const deps = [item.entity, ...own.map((article) => article.entity)];
  return {
    type: 'blog',
    id: item.entity.id,
    path: item.path,
    aliases: [],
    entity: { type: 'blog', id: item.entity.id },
    record: {
      id: item.entity.id,
      title: item.data.title,
      handle: item.data.handle,
      url: recordPath.blog(item.slug),
      articlesCount: total,
      articles: own.map((article) => articleCardOf(item.slug, article)),
    },
    seo: { title: item.data.title, description: '', image: null },
    deps: deps.map(depOf),
    updatedAt: latestOf(deps.map((dep) => dep.updatedAt)),
  };
}

// Записи блогов: статьи карточек — новые сверху, deps и дата правки.
function blogEntriesOf(
  items: readonly Placed<BlogData>[],
  articles: readonly Placed<PublicationItem>[],
): RecordEntryOf<'blog'>[] {
  return items.map((item) => {
    const own = blogArticlesOf(item.entity.id, articles);
    const total = articles.filter((article) => article.data.blogId === item.entity.id).length;
    return blogEntryOf(item, own, total);
  });
}

// Записи статей: SEO — заголовок мерчанта или название, описание — анонс; deps — статья и блог.
function articleEntriesOf(
  items: readonly Placed<PublicationItem>[],
  blogs: readonly Placed<BlogData>[],
): RecordEntryOf<'article'>[] {
  const byId = new Map(blogs.map((item): [string, Placed<BlogData>] => [item.entity.id, item]));
  return items.flatMap((item) => {
    const blog = byId.get(item.data.blogId);
    if (blog === undefined) return [];
    const deps = [item.entity, blog.entity];
    return [
      {
        type: 'article',
        id: item.entity.id,
        path: item.path,
        aliases: [],
        entity: { type: 'publication', id: item.entity.id },
        record: articleRecordOf(item, blog),
        seo: {
          title: item.data.seo.title !== '' ? item.data.seo.title : item.data.title,
          description:
            item.data.seo.description !== '' ? item.data.seo.description : seoDescriptionOf(item.data.excerpt ?? ''),
          image: item.data.cover,
        },
        deps: deps.map(depOf),
        updatedAt: latestOf(deps.map((dep) => dep.updatedAt)),
      },
    ];
  });
}

// Записи политик: адрес и название — из POLICY_PAGES, текст — HTML из абзацев.
function policyEntriesOf(items: readonly { entity: Entity; content: string }[]): RecordEntryOf<'policy'>[] {
  return items.flatMap((item) => {
    const page = POLICY_PAGES.find((candidate) => candidate.type === item.entity.id);
    if (page === undefined) return [];
    return [
      {
        type: 'policy',
        id: page.type,
        path: recordPath.policy(page.slug),
        aliases: [],
        entity: { type: 'policy', id: page.type },
        record: {
          type: page.type,
          title: page.title,
          url: recordPath.policy(page.slug),
          html: policyTextToHtml(item.content),
        },
        seo: { title: page.title, description: '', image: null },
        deps: [depOf(item.entity)],
        updatedAt: item.entity.updatedAt,
      },
    ];
  });
}

const TYPE_ORDER: Record<RecordType, number> = {
  product: 0,
  collection: 1,
  blog: 2,
  article: 3,
  policy: 4,
};

function byOrder(left: RecordEntry, right: RecordEntry): number {
  const byType = TYPE_ORDER[left.type] - TYPE_ORDER[right.type];
  if (byType !== 0) return byType;
  return left.id < right.id ? -1 : 1;
}

const sortEntries = (entries: readonly RecordEntry[]): RecordEntry[] => [...entries].sort(byOrder);

interface PlacedSet {
  products: ReturnType<typeof placeAll<ProductItem, Source<ProductItem>>>['placed'];
  collections: ReturnType<typeof placeAll<CollectionItem, Source<CollectionItem>>>['placed'];
  blogs: ReturnType<typeof placeAll<BlogData, Source<BlogData>>>['placed'];
  articles: ReturnType<
    typeof placeAll<PublicationItem, Source<PublicationItem> & { blog: Placed<BlogData> }>
  >['placed'];
  policies: { entity: Entity; content: string }[];
  duplicates: RecordDuplicate[];
}

// Политики с текстом из списка POLICY_PAGES (Р8а-12).
function policySourcesOf(entities: readonly Entity[]): { entity: Entity; content: string }[] {
  return entities.flatMap((entity): { entity: Entity; content: string }[] => {
    if (entity.type !== 'policy' || !POLICY_PAGES.some((page) => page.type === entity.id)) return [];
    const data = parseOf(policyDataSchema, entity);
    return data !== null && data.content.trim() !== '' ? [{ entity, content: data.content }] : [];
  });
}

// Статьи — только при своём блоге во входах (blogId); адрес — внутри блога.
function placeArticles(entities: readonly Entity[], blogs: readonly Placed<BlogData>[]) {
  const blogById = new Map(blogs.map((item): [string, Placed<BlogData>] => [item.entity.id, item]));
  const sources = sourcesOf(publicationDataSchema, entities, 'publication').flatMap(
    (item): (Source<PublicationItem> & { blog: Placed<BlogData> })[] => {
      const blog = blogById.get(item.data.blogId);
      return blog === undefined ? [] : [{ ...item, blog }];
    },
  );
  return placeAll(
    'article',
    sources,
    (item) => recordSlug(item.data.slug, item.entity.id),
    (slug, id, item) => recordPath.article(item.blog.slug, slug),
  );
}

// Сущности входов → записи с адресами каждого типа.
function placeEntities(entities: readonly Entity[]): PlacedSet {
  const products = placeAll(
    'product',
    sourcesOf(productDataSchema, entities, 'product'),
    (item) => recordSlug(item.data.handle, item.entity.id),
    recordPath.product,
  );
  const collections = placeAll(
    'collection',
    sourcesOf(collectionDataSchema, entities, 'collection'),
    (item) => recordSlug(item.data.handle, item.entity.id),
    recordPath.collection,
  );
  const blogs = placeAll(
    'blog',
    sourcesOf(blogDataSchema, entities, 'blog'),
    (item) => recordSlug(item.data.handle, item.entity.id),
    recordPath.blog,
  );
  const articles = placeArticles(entities, blogs.placed);
  return {
    products: products.placed,
    collections: collections.placed,
    blogs: blogs.placed,
    articles: articles.placed,
    policies: policySourcesOf(entities),
    duplicates: [...products.duplicates, ...collections.duplicates, ...blogs.duplicates, ...articles.duplicates],
  };
}

// Товары по порядку сущностей входов — как product.list на проде: новые сверху.
function productsInInputOrder(
  entities: readonly Entity[],
  entries: readonly RecordEntry[],
): RecordEntryOf<'product'>[] {
  return sourcesOf(productDataSchema, entities, 'product').flatMap((source) => {
    const entry = entries.find((candidate) => candidate.type === 'product' && candidate.id === source.entity.id);
    return entry !== undefined && entry.type === 'product' ? [entry] : [];
  });
}

// Поиск записи: по ключу «тип:id» и по основному адресу или адресу из aliases.
function lookupOf(entries: readonly RecordEntry[]): Pick<RecordIndex, 'find' | 'atPath'> {
  const byPath = new Map<string, RecordEntry>();
  for (const entry of entries) {
    byPath.set(entry.path, entry);
    for (const alias of entry.aliases) byPath.set(alias, entry);
  }
  const byId = new Map(entries.map((entry): [string, RecordEntry] => [`${entry.type}:${entry.id}`, entry]));
  return {
    find: (type, id) => byId.get(`${type}:${id}`) ?? null,
    atPath: (path) => byPath.get(path) ?? null,
  };
}

// Все записи сборки из сущностей входов; правила — в __tests__/records.test.ts.
export function recordIndexOf(entities: readonly Entity[]): RecordIndex {
  const placed = placeEntities(entities);
  const entries = sortEntries([
    ...productEntriesOf(placed.products, placed.collections),
    ...collectionEntriesOf(placed.collections, placed.products),
    ...blogEntriesOf(placed.blogs, placed.articles),
    ...articleEntriesOf(placed.articles, placed.blogs),
    ...policyEntriesOf(placed.policies),
  ]);
  return {
    entries,
    products: productsInInputOrder(entities, entries),
    ...lookupOf(entries),
    duplicates: placed.duplicates,
  };
}
