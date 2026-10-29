import type { Entity } from './inputs';
import { EMPTY_LIST_QUERY } from './list-query';
import { pageListOf, type ListInputs, type ListSource } from './page-list';
import { recordIndexOf, type RecordEntry, type RecordEntryOf, type RecordIndex, type RecordType } from './records';
import {
  sectionRecords,
  type BlockRecordFields,
  type RecordFieldKind,
  type SectionRecordValues,
} from './section-records';
import { shopPropsOf, type ShopProps } from './shop-props';
import { HOME_PAGE, type PageInfo } from './special-pages';
import type { RenderBlock, SettingValues } from './sections-render';

// Примеры данных магазина для пробного рендера секции при сохранении и для тестов (блок 2 «Секций и SDK», «Решил сам»
// п. 5, дополнение «Утечки в HTML»). Секция без записей, с пустым магазином и умолчаниями настроек не выполняет ветки,
// где выводятся цена, карточки и контакты: ошибка в них доходила до витрины. Здесь эти данные есть. Примеры — сущности
// входов сборки, записи из них строит recordIndexOf, а значения полей с записями — sectionRecords: те же механизмы, что у
// сборки, поэтому форма записей совпадает с боевой. Цена товара не 0 (иначе «0 ₽» не отличить от пустого значения), у
// товара есть старая цена, варианты и картинки. Только примеры: сети и базы здесь нет.

const AT = '2026-10-20T10:00:00.000Z';
const POSTED_AT = '2026-10-19T10:00:00.000Z';
const NO_SEO = { title: '', description: '' };
const image = (name: string): string => `https://s3.merfy.ru/p/${name}.jpg`;

export const SAMPLE_IDS = {
  product: 'p-2',
  collection: 'c-1',
  blog: 'b-1',
  article: 'a-1',
  policy: 'privacy',
} as const;

const entity = (type: Entity['type'], id: string, data: Entity['data']): Entity => ({ type, id, updatedAt: AT, data });

// Товары по порядку входов: главный (скидка, размеры, цвет), простой и распроданный.
export const SAMPLE_ENTITIES: readonly Entity[] = [
  entity('product', 'p-2', {
    title: 'Плед «Нова»',
    handle: 'pled',
    description: 'Тёплый и мягкий',
    price: 350000,
    compareAtPrice: 420000,
    images: [image('2'), image('2-b'), image('2-c')],
    available: true,
    options: [
      {
        id: 'o-size',
        name: 'Размер',
        values: [
          { id: 'v-s', value: 'S', images: [], swatch: null },
          { id: 'v-m', value: 'M', images: [image('2-b')], swatch: null },
        ],
      },
      {
        id: 'o-color',
        name: 'Цвет',
        values: [{ id: 'v-grey', value: 'Серый', images: [], swatch: '#9ca3af' }],
      },
    ],
    variants: [
      {
        id: 'var-s',
        title: 'S / Серый',
        price: 350000,
        compareAtPrice: 420000,
        available: true,
        options: { Размер: 'S', Цвет: 'Серый' },
      },
      {
        id: 'var-m',
        title: 'M / Серый',
        price: 390000,
        compareAtPrice: null,
        available: false,
        options: { Размер: 'M', Цвет: 'Серый' },
      },
    ],
    collectionIds: ['c-1'],
    seo: NO_SEO,
  }),
  entity('product', 'p-1', {
    title: 'Шарф «Север»',
    handle: 'sharf',
    description: 'Шерсть и кашемир',
    price: 190000,
    compareAtPrice: null,
    images: [image('1'), image('1-b')],
    available: true,
    options: [],
    variants: [],
    collectionIds: ['c-1'],
    seo: NO_SEO,
  }),
  entity('product', 'p-3', {
    title: 'Варежки «Иней»',
    handle: 'varezhki',
    description: 'Раскуплено',
    price: 120000,
    compareAtPrice: 150000,
    images: [image('3')],
    available: false,
    options: [],
    variants: [],
    collectionIds: [],
    seo: NO_SEO,
  }),
  entity('collection', 'c-1', {
    title: 'Пледы',
    handle: 'pledy',
    description: 'Для холодных вечеров',
    images: [image('c-1')],
    productIds: ['p-2', 'p-1'],
    seo: NO_SEO,
  }),
  entity('blog', 'b-1', { title: 'Новости', handle: 'novosti' }),
  entity('publication', 'a-1', {
    title: 'Как стирать плед',
    slug: 'kak-stirat',
    blogId: 'b-1',
    blogHandle: 'novosti',
    excerpt: 'Вручную, при 30°',
    content: '<p>Стирать вручную</p>',
    publishedAt: POSTED_AT,
    cover: image('a-1'),
    seo: NO_SEO,
  }),
  entity('policy', 'privacy', { content: 'Мы бережём данные' }),
  entity('contacts', 'contacts', {
    fields: [
      { label: 'Телефон', value: '+7 495 000-00-00', order: 1 },
      { label: 'Почта', value: 'shop@example.com', order: 2 },
      { label: 'Адрес', value: 'Москва, ул. Примерная, 1', order: 3 },
    ],
  }),
  entity('billing', 'billing', { online: true }),
];

export const SAMPLE_RECORDS: RecordIndex = recordIndexOf(SAMPLE_ENTITIES);

// Данные магазина с контактами, политикой и онлайн-оплатой: «uses: shop».
export const SAMPLE_SHOP: ShopProps = shopPropsOf('Магазин «Нова»', SAMPLE_ENTITIES, '/catalog');

// Настройки темы с заполненными адресами и картинками: «uses: theme». Ключи — сквозные настройки панели темы
// (generated/shared-settings.json); тест сверяет, что для каждой есть пример. Панель сам src не импортирует (Р3.4).
export const SAMPLE_THEME: SettingValues = {
  'logo-image': image('logo'),
  'social-telegram': 'https://t.me/example',
  'social-vk': 'https://vk.com/example',
  'social-dzen': 'https://dzen.ru/example',
  'social-youtube': 'https://youtube.com/@example',
  'social-tiktok': 'https://tiktok.com/@example',
  'social-max': 'https://max.ru/example',
  'cart-type': 'drawer',
  'cookie-banner-enabled': true,
  'wishlist-enabled': true,
};

// Запись-пример вида: публичные поля, как их видит шаблон (ProductRecord, CollectionRecord …).
export function sampleRecord<T extends RecordType>(type: T): RecordEntryOf<T>['record'] {
  const entry = SAMPLE_RECORDS.find(type, SAMPLE_IDS[type]);
  const isOf = (found: RecordEntry | null): found is RecordEntry & RecordEntryOf<T> => found?.type === type;
  if (!isOf(entry)) throw new Error(`в примерах нет записи ${type}`);
  return entry.record;
}

// Значения полей с записями секции: поле выбрано на пример своего вида. Запись приходит из sectionRecords — как у сборки.
export function sampleRecordValues(
  recordFields: Readonly<Record<string, RecordFieldKind>> | undefined,
): SectionRecordValues {
  if (recordFields === undefined) return {};
  const settings: SettingValues = Object.fromEntries(
    Object.entries(recordFields).map(([id, kind]): [string, string] => [id, SAMPLE_IDS[kind]]),
  );
  const placed = { id: 'sample', name: 'sample', hash: 'sample', settings, recordFields };
  return sectionRecords(placed, { theme: SAMPLE_THEME, shop: SAMPLE_SHOP, page: HOME_PAGE, records: SAMPLE_RECORDS })
    .values;
}

// Значения полей с записями в блоках (базовые секции, 29.10): у каждого блока поле выбрано на пример своего вида; id
// блока → id поля → запись. Тип блока без таких полей — блока в ответе нет.
export function sampleBlockRecords(
  blockRecordFields: BlockRecordFields | undefined,
  blocks: readonly RenderBlock[],
): Readonly<Record<string, SectionRecordValues>> {
  if (blockRecordFields === undefined) return {};
  const sampled = blocks.map((block) => {
    const fields = blockRecordFields[block.type] ?? {};
    const ids = Object.entries(fields).map(([id, kind]): [string, string] => [id, SAMPLE_IDS[kind]]);
    return { ...block, settings: { ...block.settings, ...Object.fromEntries(ids) } };
  });
  const placed = { id: 'sample', name: 'sample', hash: 'sample', settings: {}, blocks: sampled, blockRecordFields };
  return sectionRecords(placed, { theme: SAMPLE_THEME, shop: SAMPLE_SHOP, page: HOME_PAGE, records: SAMPLE_RECORDS })
    .blocks;
}

const LIST_INPUTS: ListInputs = { data: { entities: [...SAMPLE_ENTITIES] } };
const PER_PAGE = 24;

function listOf(source: ListSource): PageInfo['list'] {
  return pageListOf(SAMPLE_RECORDS, LIST_INPUTS, source, EMPTY_LIST_QUERY, null);
}

// Страница, на которой стоит секция, — запись и список, как их видит секция на странице записи.
function recordPage(id: keyof typeof SAMPLE_IDS, list?: ListSource): PageInfo {
  const entry = SAMPLE_RECORDS.find(id, SAMPLE_IDS[id]);
  if (entry === null) throw new Error(`в примерах нет записи ${id}`);
  return { id, path: entry.path, record: entry.record, ...(list === undefined ? {} : { list: listOf(list) }) };
}

// Страницы пробного рендера сверх главной: каталог со списком товаров, страницы записей всех видов (коллекция и блог
// — со своим списком). Какой странице принадлежит секция, проверка не знает: она рисует секцию на каждой.
export const SAMPLE_PAGES: readonly PageInfo[] = [
  {
    id: 'catalog',
    path: '/catalog',
    record: null,
    list: listOf({
      kind: 'products',
      url: '/catalog',
      pages: 'built',
      collectionId: null,
      catalog: true,
      perPage: PER_PAGE,
    }),
  },
  recordPage('product'),
  recordPage('collection', {
    kind: 'products',
    url: '/collections/pledy',
    pages: 'built',
    collectionId: SAMPLE_IDS.collection,
    catalog: false,
    perPage: PER_PAGE,
  }),
  recordPage('blog', { kind: 'articles', url: '/blogs/novosti', pages: 'built', blogId: SAMPLE_IDS.blog, perPage: 12 }),
  recordPage('article'),
  recordPage('policy'),
];
