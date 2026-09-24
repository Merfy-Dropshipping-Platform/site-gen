/**
 * Форма документа магазина — данными, а не ветками кода.
 *
 * Документ: `pages[]` (мета страниц), `pagesData{pageId: {content[], root,
 * zones}}` (содержимое), `themeSettings` и служебные поля. Движку нужно знать
 * только три вещи:
 *  - какие массивы — списки элементов с id (секции, страницы) — их элементы
 *    адресуются по id, а порядок — отдельным полем `order`;
 *  - какие объекты — словари элементов (`pagesData`, `zones`);
 *  - какие контейнеры «подняты»: их элементы адресуются прямо под родителем
 *    (`page:home/block:Hero-1`, а не `pagesData/home/content/Hero-1`).
 * Любой другой объект — обычная запись (поле за полем), любой другой массив —
 * одно значение (слайды, пункты меню, цветовые схемы).
 */
import { isPlainObject } from "./json";

export interface RecordShape {
  kind: "record";
  /** Контейнеры, адресуемые под своим ключом (`pages/<id>`, `pages/order`). */
  fields?: Readonly<Record<string, ContainerShape>>;
  /** Контейнеры, чьи элементы адресуются прямо под записью (`page:<id>`, `block:<id>`). */
  hoisted?: Readonly<Record<string, ContainerShape>>;
}

export interface ListShape {
  kind: "list";
  itemPrefix: string;
  idOf: (item: unknown) => unknown;
  item: RecordShape;
}

export interface MapShape {
  kind: "map";
  entryPrefix: string;
  entry: RecordShape | ListShape;
}

export type ContainerShape = ListShape | MapShape;
export type Shape = RecordShape | ContainerShape;

export const RECORD: RecordShape = { kind: "record" };

const blockId = (item: unknown): unknown =>
  isPlainObject(item) && isPlainObject(item.props) ? item.props.id : undefined;

const pageId = (item: unknown): unknown =>
  isPlainObject(item) ? item.id : undefined;

/** Секции страницы или зоны: Puck-блоки `{ type, props: { id, … } }`, ключ — `props.id`. */
const BLOCKS: ListShape = {
  kind: "list",
  itemPrefix: "block:",
  idOf: blockId,
  item: RECORD,
};

/** Содержимое страницы: `content` и `zones` подняты в адрес страницы. */
const PAGE_DATA: RecordShape = {
  kind: "record",
  hoisted: {
    content: BLOCKS,
    zones: { kind: "map", entryPrefix: "zone:", entry: BLOCKS },
  },
};

export const DOCUMENT: RecordShape = {
  kind: "record",
  fields: {
    pages: { kind: "list", itemPrefix: "", idOf: pageId, item: RECORD },
  },
  hoisted: {
    pagesData: { kind: "map", entryPrefix: "page:", entry: PAGE_DATA },
  },
};

/**
 * Служебные поля: навигация конструктора и счётчик, а не правки мерчанта.
 * При слиянии берётся входящее значение (если входящая сторона его меняла), в
 * `overwritten`/`conflicts` и в список изменений ревизии они не попадают.
 * `currentPageId` — открытая страница конструктора. `lockVersion` — счётчик
 * без роли в CAS (CAS идёт по указателю ревизии): в `src/` его увеличивает
 * только `pages.service` (+1 на правку страницы), конструктор возвращает как
 * прочитал, на чтении он лишь ставится в 1 у ревизий без него (миграция v1→v2
 * PageResolver).
 */
export const VOLATILE_PATHS: readonly string[] = [
  "currentPageId",
  "lockVersion",
];

/** Список «годится для адресации по id»: у каждого элемента непустой строковый id, id не повторяются. */
export function isKeyedList(
  shape: ListShape,
  value: unknown,
): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const ids = value.map(shape.idOf);
  const valid = ids.every((id) => typeof id === "string" && id !== "");
  return valid && new Set(ids).size === ids.length;
}

/** Значение можно разбирать по форме контейнера (иначе это одно значение). */
export function fitsShape(shape: Shape, value: unknown): boolean {
  if (shape.kind === "list") return isKeyedList(shape, value);
  return isPlainObject(value);
}

export function prefixOf(shape: ContainerShape): string {
  return shape.kind === "list" ? shape.itemPrefix : shape.entryPrefix;
}

export function childShape(record: RecordShape, key: string): Shape {
  return record.hoisted?.[key] ?? record.fields?.[key] ?? RECORD;
}

export function idsOf(shape: ListShape, list: unknown[]): string[] {
  return list.map((item) => shape.idOf(item) as string);
}
