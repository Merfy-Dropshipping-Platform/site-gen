import type {
  ArticleCard,
  BlogRecord,
  CollectionRecord,
  Money,
  PolicyRecord,
  ProductCard,
  ProductRecord,
  RecordFieldKind,
  SectionRecordValues,
  ShopProps,
} from '@merfy/storefront-build';

// Чтения полей, которых у записи нет (28.11): слабая модель пишет `product.price.value`, у цены поля value нет — значок
// скидки не появится никогда, а в HTML пробного рендера нет ни undefined, ни [object Object], и render-leak молчит. На
// пробном рендере «на примерах данных магазина» записи полей секции и блоков и данные магазина отдаются шаблону под
// наблюдением: чтение ключа не из публичных полей вида записывается. Только там: процесс рендера включает наблюдение по
// ключу watch запроса (render-worker.ts), у витрины и превью этого ключа нет. Файл без импорта значений — его собирает
// процесс рендера, пакеты сборки он во время работы не загружает.

// Виды наблюдаемых объектов: записи полей с записями, их вложенные объекты и данные магазина.
export const SHAPE_NAMES = [
  'product',
  'collection',
  'blog',
  'policy',
  'money',
  'option',
  'optionValue',
  'variant',
  'link',
  'productCard',
  'color',
  'articleCard',
  'shop',
  'shopContacts',
  'shopContactField',
  'shopPolicy',
  'shopPayments',
] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];

// Ключи вида — ровно ключи его типа: новое поле записи без строки здесь не пройдёт typecheck. Значение — вид вложенного
// объекта (у массива — вид его элементов) или null: строка, число, список строк, словарь со своими ключами.
type Shape<T> = { readonly [K in keyof Required<T>]: ShapeName | null };
type Item<T extends readonly unknown[]> = T[number];

const product = {
  id: null,
  title: null,
  slug: null,
  url: null,
  description: null,
  price: 'money',
  compareAtPrice: 'money',
  images: null,
  available: null,
  preorder: null,
  options: 'option',
  variants: 'variant',
  collections: 'link',
  updatedAt: null,
} as const satisfies Shape<ProductRecord>;
const option = { id: null, name: null, values: 'optionValue' } as const satisfies Shape<Item<ProductRecord['options']>>;
const optionValue = { id: null, value: null, images: null, swatch: null } as const satisfies Shape<
  Item<Item<ProductRecord['options']>['values']>
>;
// options варианта — словарь «название опции → значение» с ключами мерчанта: не наблюдается.
const variant = {
  id: null,
  title: null,
  price: 'money',
  compareAtPrice: 'money',
  available: null,
  options: null,
} as const satisfies Shape<Item<ProductRecord['variants']>>;
const link = { id: null, title: null, url: null } as const satisfies Shape<Item<ProductRecord['collections']>>;
const money = { amount: null, currency: null, text: null } as const satisfies Shape<Money>;
const productCard = {
  id: null,
  title: null,
  url: null,
  price: 'money',
  compareAtPrice: 'money',
  image: null,
  available: null,
  preorder: null,
  images: null,
  variantId: null,
  colors: 'color',
} as const satisfies Shape<ProductCard>;
const color = { title: null, swatch: null } as const satisfies Shape<Item<ProductCard['colors']>>;
const collection = {
  id: null,
  title: null,
  slug: null,
  url: null,
  description: null,
  images: null,
  productsCount: null,
  products: 'productCard',
} as const satisfies Shape<CollectionRecord>;
const blog = {
  id: null,
  title: null,
  handle: null,
  url: null,
  articlesCount: null,
  articles: 'articleCard',
} as const satisfies Shape<BlogRecord>;
const articleCard = {
  id: null,
  title: null,
  url: null,
  publishedAt: null,
  publishedText: null,
  cover: null,
  excerpt: null,
} as const satisfies Shape<ArticleCard>;
const policy = { type: null, title: null, url: null, html: null } as const satisfies Shape<PolicyRecord>;
const shop = {
  name: null,
  contacts: 'shopContacts',
  policies: 'shopPolicy',
  payments: 'shopPayments',
  signature: null,
  catalogUrl: null,
} as const satisfies Shape<ShopProps>;
const shopContacts = { phone: null, email: null, fields: 'shopContactField' } as const satisfies Shape<
  ShopProps['contacts']
>;
const shopContactField = { label: null, value: null } as const satisfies Shape<Item<ShopProps['contacts']['fields']>>;
const shopPolicy = { type: null, title: null, url: null } as const satisfies Shape<Item<ShopProps['policies']>>;
const shopPayments = { online: null } as const satisfies Shape<ShopProps['payments']>;

export const RECORD_SHAPES: Readonly<Record<ShapeName, Readonly<Record<string, ShapeName | null>>>> = {
  product,
  collection,
  blog,
  policy,
  money,
  option,
  optionValue,
  variant,
  link,
  productCard,
  color,
  articleCard,
  shop,
  shopContacts,
  shopContactField,
  shopPolicy,
  shopPayments,
};

// Вид поля с записью у секции и блока — вид записи: имена совпадают (проверка типа).
const KIND_SHAPES: Readonly<Record<RecordFieldKind, ShapeName>> = {
  product: 'product',
  collection: 'collection',
  blog: 'blog',
  policy: 'policy',
};
type KindFields = Readonly<Record<string, RecordFieldKind>>;
const shapesOf = (fields: KindFields = {}): Record<string, ShapeName> =>
  Object.fromEntries(Object.entries(fields).map(([id, kind]) => [id, KIND_SHAPES[kind]]));

// Что наблюдать: вид записи по id поля секции и по id блока → id поля.
export interface FieldWatch {
  records: Readonly<Record<string, ShapeName>>;
  blockRecords: Readonly<Record<string, Readonly<Record<string, ShapeName>>>>;
}

// Наблюдение по полям с записями секции (sectionRecordKeys) и блокам секции: у блока — поля его типа.
export function recordWatchOf(
  recordFields: KindFields | undefined,
  blockRecordFields: Readonly<Record<string, KindFields>> | undefined,
  blocks: readonly { id: string; type: string }[],
): FieldWatch {
  return {
    records: shapesOf(recordFields),
    blockRecords: Object.fromEntries(blocks.map((block) => [block.id, shapesOf(blockRecordFields?.[block.type])])),
  };
}

// Чтение ключа, которого у вида нет: путь объекта в шаблоне («settings.product.price»), его вид и ключ («value»).
export interface FieldRead {
  path: string;
  shape: ShapeName;
  key: string;
}

// Не поля записи: обещание (then), JSON, проверки рендерера Astro у значения в разметке (render, «astro:jsx», $$slot,
// isAstroComponentFactory), служебное JS — ключи прототипов объекта, массива и строки (constructor, toString, length,
// map…). Их читают рендерер и код JS, а не автор по ошибке. Ключ не из букв, цифр, _ и $ («astro:jsx») или с $$ в начале —
// тоже служебный: поле записи так не называется, а шаблон с obj['a:b'] пропустить безопаснее, чем отказать ложно.
const SERVICE_KEYS: ReadonlySet<string> = new Set(['then', 'toJSON', 'render', 'isAstroComponentFactory']);
const FIELD_NAME = /^(?!\$\$)[A-Za-z_$][\w$]*$/;
const isServiceKey = (key: string): boolean =>
  SERVICE_KEYS.has(key) ||
  !FIELD_NAME.test(key) ||
  key in Object.prototype ||
  key in Array.prototype ||
  key in String.prototype;

// Сколько разных чтений хранит один рендер: ответ процесса не растёт от шаблона, который читает чужое в цикле.
export const FIELD_READS_MAX = 20;

class ReadLog {
  readonly reads: FieldRead[] = [];
  private readonly seen = new Set<string>();

  note(path: string, shape: ShapeName, key: string): void {
    const id = `${path}|${key}`;
    if (this.seen.has(id) || this.reads.length >= FIELD_READS_MAX) return;
    this.seen.add(id);
    this.reads.push({ path, shape, key });
  }
}

const nestedOf = (shape: ShapeName, key: string): ShapeName | null =>
  Object.hasOwn(RECORD_SHAPES[shape], key) ? (RECORD_SHAPES[shape][key] ?? null) : null;

const isUnknownKey = (shape: ShapeName, key: string | symbol): key is string =>
  typeof key === 'string' && !Object.hasOwn(RECORD_SHAPES[shape], key) && !isServiceKey(key);

// Объект под наблюдением — Proxy над ним же: get пишет в журнал ключ не из вида и отдаёт то же значение, что без
// наблюдения; вложенный объект своего вида (цена, варианты, карточки) — тоже под наблюдением, один раз на ключ: у
// product.price при каждом чтении один и тот же объект.
function watchedObject<T extends object>(value: T, shape: ShapeName, path: string, log: ReadLog): T {
  const inner = new Map<string, unknown>();
  const nestedValue = (key: string, found: unknown, nested: ShapeName): unknown => {
    if (!inner.has(key)) inner.set(key, watched(found, nested, `${path}.${key}`, log));
    return inner.get(key);
  };
  return new Proxy(value, {
    get(target, key, receiver) {
      const found: unknown = Reflect.get(target, key, receiver);
      if (isUnknownKey(shape, key)) log.note(path, shape, key);
      const nested = typeof key === 'string' ? nestedOf(shape, key) : null;
      return nested === null || typeof key !== 'string' ? found : nestedValue(key, found, nested);
    },
  });
}

// Значение под наблюдением: массив — копия с наблюдаемыми элементами («путь[]»), объект — watchedObject, остальное
// (строка, число, null) — как есть.
function watched(value: unknown, shape: ShapeName, path: string, log: ReadLog): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => watched(item, shape, `${path}[]`, log));
  return value !== null && typeof value === 'object' ? watchedObject(value, shape, path, log) : value;
}

const watchedValues = (
  values: SectionRecordValues,
  shapes: Readonly<Record<string, ShapeName>>,
  path: string,
  log: ReadLog,
): SectionRecordValues =>
  Object.fromEntries(
    Object.entries(values).map(([id, record]) => {
      const shape = shapes[id];
      const plain = record === null || shape === undefined;
      return [id, plain ? record : watchedObject(record, shape, `${path}.${id}`, log)];
    }),
  );

export interface WatchedInput {
  records: SectionRecordValues;
  blockRecords?: Readonly<Record<string, SectionRecordValues>>;
  shop: ShopProps;
}

// Записи и данные магазина под наблюдением и журнал чтений. Путь — как его пишет шаблон: settings.<id>,
// block.settings.<id>, shop.
export function watchProps(input: WatchedInput, watch: FieldWatch): { values: WatchedInput; reads: FieldRead[] } {
  const log = new ReadLog();
  const blockRecords = Object.fromEntries(
    Object.entries(input.blockRecords ?? {}).map(([block, values]) => [
      block,
      watchedValues(values, watch.blockRecords[block] ?? {}, 'block.settings', log),
    ]),
  );
  const values = {
    records: watchedValues(input.records, watch.records, 'settings', log),
    blockRecords,
    shop: watchedObject(input.shop, 'shop', 'shop', log),
  };
  // Журнал заполняется во время рендера: reads читать после него.
  return { values, reads: log.reads };
}
