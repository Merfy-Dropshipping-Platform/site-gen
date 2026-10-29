import type { CodeSection } from './inputs';
import {
  BLOG_ARTICLES_MAX,
  COLLECTION_PRODUCTS_MAX,
  cardOfRecord,
  recordPath,
  type ArticleCard,
  type ProductCard,
  type RecordEntry,
  type RecordEntryOf,
  type RecordIndex,
} from './records';
import type { MenuTree, MenuTreeItem, PageProps, PlacedSection } from './sections-render';
import type { PageInfo } from './special-pages';

// Поля с записями в настройках секции (блок 8 «Секций и SDK», часть 8г; design.md 8.3, 8.9): виды полей, объявление
// data для скрипта и, с задачи Б8г-3, записи полей при рендере секции. Пакет секций читает отсюда виды и правила data:
// сборка пакет секций не импортирует.
export const RECORD_FIELD_KINDS = ['product', 'collection', 'blog', 'policy'] as const;
export type RecordFieldKind = (typeof RECORD_FIELD_KINDS)[number];

// data секции (Р8г-6): имя — как имя свойства JS; from — запись страницы или поле с записью этой секции; fields —
// публичные поля записи (RECORD_FIELDS, records.ts), до DATA_FIELDS_MAX; имён — до DATA_ENTRIES_MAX.
export const DATA_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
export const DATA_FROM = /^(?:page\.record|settings\.[a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const DATA_FIELDS_MAX = 20;
export const DATA_ENTRIES_MAX = 10;

export interface SectionDataEntry {
  from: string;
  fields: string[];
}

// Значения полей с записями по id настройки: публичные поля записи (records.ts) или null.
export type SectionRecordValues = Readonly<Record<string, object | null>>;

// Записи полей одной секции (Р8г-3, Р8г-4): правила — в плане части 8г, Б8г-3; проверка — section-records.test.ts.
export interface SectionRecords {
  // id поля с записью → публичные поля записи или null; по recordFields экземпляра.
  values: SectionRecordValues;
  // Ключи «тип:id» показанных записей без повторов — в deps строки страницы. Записи страницы здесь нет: она уже в deps
  // страницы записи.
  deps: readonly string[];
  // data для тега входных данных (sectionData).
  data: SectionRecordValues;
  // Поля с записями в блоках (базовые секции, 29.10): id блока → id поля → публичные поля записи или null; по
  // blockRecordFields экземпляра. Правила — те же, что у полей секции (fieldRecords).
  blocks: Readonly<Record<string, SectionRecordValues>>;
}

// Виды полей с записями у типов блоков (базовые секции, 29.10): товар и коллекция — как «Тип» элемента «Галереи» на проде.
// Блог и политика — только у полей секции.
export const BLOCK_RECORD_KINDS = ['product', 'collection'] as const;
export type BlockRecordKind = (typeof BLOCK_RECORD_KINDS)[number];

// Поля с записями типов блоков: тип блока → id поля → вид.
export type BlockRecordFields = Readonly<Record<string, Readonly<Record<string, BlockRecordKind>>>>;

// Карточка товара — та же, что у товаров коллекции записей (records.ts).
const productCard = (found: RecordEntryOf<'product'>): ProductCard => cardOfRecord(found.record);

// Карточка статьи — те же поля, что у статей блога записей (records.ts).
const articleCard = (found: RecordEntryOf<'article'>): ArticleCard => ({
  id: found.record.id,
  title: found.record.title,
  url: found.record.url,
  publishedAt: found.record.publishedAt,
  cover: found.record.cover,
  excerpt: found.record.excerpt,
});

// Выбранная запись: по id или адресу, только того же вида (Р8г-3).
const chosenEntry = (index: RecordIndex, kind: RecordFieldKind, value: string): RecordEntry | null => {
  const found = index.find(kind, value) ?? index.atPath(recordPath[kind](value));
  return found?.type === kind ? found : null;
};

const uniqueDeps = (deps: readonly string[]): string[] => [...new Set(deps)];

// «Все товары» и «записи всех блогов» — показанные записи и их deps.
const shownProductsOf = (index: RecordIndex): readonly RecordEntryOf<'product'>[] =>
  index.products.slice(0, COLLECTION_PRODUCTS_MAX);

const byNewestArticle = (left: RecordEntryOf<'article'>, right: RecordEntryOf<'article'>): number => {
  const dateOf = (item: RecordEntryOf<'article'>): number => Date.parse(item.record.publishedAt ?? item.updatedAt);
  const difference = dateOf(right) - dateOf(left);
  if (difference !== 0) return difference;
  return left.id < right.id ? -1 : 1;
};

const shownArticlesOf = (index: RecordIndex): readonly RecordEntryOf<'article'>[] =>
  index.entries
    .filter((item): item is RecordEntryOf<'article'> => item.type === 'article')
    .sort(byNewestArticle)
    .slice(0, BLOG_ARTICLES_MAX);

// Пустое поле на странице не своего вида — как у секций пяти тем на проде (Р8г-3).
interface FieldRecords {
  value: object | null;
  deps: readonly string[];
}

const allProductsRule = (index: RecordIndex): FieldRecords => {
  const shown = shownProductsOf(index);
  if (shown.length === 0) return { value: null, deps: [] };
  const products = shown.map(productCard);
  const deps = uniqueDeps(shown.flatMap((found) => found.deps));
  return {
    value: {
      id: '',
      title: '',
      slug: '',
      url: '',
      description: '',
      images: [],
      productsCount: index.products.length,
      products,
    },
    deps,
  };
};

const allArticlesRule = (index: RecordIndex): FieldRecords => {
  const all = index.entries.filter((item) => item.type === 'article');
  if (all.length === 0) return { value: null, deps: [] };
  const shown = shownArticlesOf(index);
  return {
    value: {
      id: '',
      title: '',
      handle: '',
      url: '',
      articlesCount: all.length,
      articles: shown.map(articleCard),
    },
    deps: uniqueDeps(shown.flatMap((found) => found.deps)),
  };
};

const EMPTY_RULES: Readonly<Record<RecordFieldKind, (index: RecordIndex) => FieldRecords>> = {
  product: (index): FieldRecords => {
    const first = index.products[0];
    return first === undefined ? { value: null, deps: [] } : { value: first.record, deps: first.deps };
  },
  collection: allProductsRule,
  blog: allArticlesRule,
  policy: (): FieldRecords => ({ value: null, deps: [] }),
};

// Записи одного поля: выбранная запись, запись страницы или правило пустого поля (Р8г-3).
function fieldRecords(props: PageProps, kind: RecordFieldKind, value: unknown): FieldRecords {
  const index = props.records;
  if (index === undefined) return { value: null, deps: [] };
  if (typeof value === 'string' && value !== '') {
    const found = chosenEntry(index, kind, value);
    return found === null ? { value: null, deps: [] } : { value: found.record, deps: found.deps };
  }
  if (props.page.id === kind) return { value: props.page.record ?? null, deps: [] };
  return EMPTY_RULES[kind](index);
}

// Записи полей одного списка значений (настройки секции или блока) по его полям с записями.
function listRecords(
  props: PageProps,
  recordFields: Readonly<Record<string, RecordFieldKind>>,
  settings: Readonly<Record<string, unknown>>,
): { values: Record<string, object | null>; deps: string[] } {
  const entries = Object.entries(recordFields);
  const fields = entries.map(([id, kind]) => fieldRecords(props, kind, settings[id]));
  const values: Record<string, object | null> = {};
  entries.forEach(([id], index) => {
    values[id] = fields[index]?.value ?? null;
  });
  return { values, deps: fields.flatMap((field) => field.deps) };
}

// Записи полей блоков экземпляра: только у блоков, у типа которых есть поля с записями.
function blockRecords(
  placed: PlacedSection,
  props: PageProps,
): { blocks: Record<string, SectionRecordValues>; deps: string[] } {
  const blocks: Record<string, SectionRecordValues> = {};
  const deps: string[] = [];
  for (const block of placed.blocks ?? []) {
    const fields = placed.blockRecordFields?.[block.type];
    if (fields === undefined) continue;
    const found = listRecords(props, fields, block.settings);
    blocks[block.id] = found.values;
    deps.push(...found.deps);
  }
  return { blocks, deps };
}

export function sectionRecords(placed: PlacedSection, props: PageProps): SectionRecords {
  const own = listRecords(props, placed.recordFields ?? {}, placed.settings);
  const inBlocks = blockRecords(placed, props);
  return {
    values: own.values,
    deps: uniqueDeps([...own.deps, ...inBlocks.deps]),
    data: sectionData(placed, props.page, own.values),
    blocks: inBlocks.blocks,
  };
}

// deps записей всех секций страницы подряд — для строки страницы (page.ts); повторы убирает pageDeps.
export function recordDepsOf(placed: readonly PlacedSection[], props: PageProps): string[] {
  return placed.flatMap((section) => [...sectionRecords(section, props).deps]);
}

// Ссылки меню на записи — основным адресом (Р8г-5): адрес по id отвечает 301, в меню он не нужен.
function menuItemOf(index: RecordIndex, item: MenuTreeItem): MenuTreeItem {
  const found = index.atPath(item.url);
  return {
    ...item,
    ...(found === null ? {} : { url: found.path }),
    items: item.items.map((nested) => menuItemOf(index, nested)),
  };
}

export function menusWithRecordPaths(
  menus: Readonly<Record<string, MenuTree>>,
  index: RecordIndex | undefined,
): Readonly<Record<string, MenuTree>> {
  if (index === undefined) return menus;
  const menuOf = (menu: MenuTree): MenuTree => ({ ...menu, items: menu.items.map((item) => menuItemOf(index, item)) });
  return Object.fromEntries(Object.entries(menus).map(([id, menu]) => [id, menuOf(menu)]));
}

// recordFields и data секции из кода магазина — только если есть (placedSections, code.ts).
export function recordKeysOf(
  section: CodeSection | undefined,
): Pick<PlacedSection, 'recordFields' | 'blockRecordFields' | 'data'> {
  if (section === undefined) return {};
  return {
    ...(section.recordFields === undefined ? {} : { recordFields: section.recordFields }),
    ...(section.blockRecordFields === undefined ? {} : { blockRecordFields: section.blockRecordFields }),
    ...(section.data === undefined ? {} : { data: section.data }),
  };
}

// Значение одного поля записи: публичные поля записи по объявлению, по порядку fields.
function pickFields(record: object, fields: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    const value: unknown = Reflect.get(record, field);
    if (value !== undefined) picked[field] = value;
  }
  return picked;
}

// data секции для тега входных данных (Р8г-6): запись страницы или запись поля этой секции — только объявленные поля;
// записи нет — null. Поля проверил приём секции (data-field-private): в браузер идут только публичные поля.
export function sectionData(
  placed: Pick<PlacedSection, 'data'>,
  page: PageInfo,
  values: SectionRecordValues,
): Record<string, object | null> {
  const recordOf = (from: string): object | null =>
    from === 'page.record' ? (page.record ?? null) : (values[from.slice('settings.'.length)] ?? null);
  return Object.fromEntries(
    Object.entries(placed.data ?? {}).map(([name, entry]): [string, object | null] => {
      const record = recordOf(entry.from);
      return [name, record === null ? null : pickFields(record, entry.fields)];
    }),
  );
}
