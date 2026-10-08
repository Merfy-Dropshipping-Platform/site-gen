import { canonicalJson, checkPageRow, sha256 } from '@merfy/storefront-build';
import { cacheClassOf, contentTypeOf } from './content-types';
import { StorefrontStorageError } from './errors';
import {
  FORMAT_VERSION,
  parseDrawnList,
  parseEntityList,
  type DrawnList,
  type EntityList,
  type FileRow,
} from './formats';
import { drawnKey, entitiesKey, hexOf } from './layout';
import { updateObject, type Decision } from './objects';
import type { ObjectStore } from './store';
import { uploadFiles } from './upload';

// Списки рядом со сборками (design.md блока 5). Список дорисовок — страницы, которые раздача дорисовала при промахе
// (Св-1 В): строка — та же, что у страницы в манифесте; список живёт при сборке — следующая сборка начинает с пустого,
// откат возвращает список той сборки (В5-1). Список адресов сущностей магазина: раздача зовёт рисовальщик только для
// адресов из него (В5-7 Б); адрес новой сущности дописывает сборщик, как только принял событие «создано» (блок 6).

export type ListOutcome = 'changed' | 'unchanged';

export interface DrawnPage {
  shop: string;
  // Живая сборка, при которой страница дорисована.
  build: number;
  // Строка страницы в формате манифеста блока 4: её отдаёт рисовальщик.
  row: unknown;
  content: Uint8Array;
}

const EMPTY_DRAWN: DrawnList = { v: FORMAT_VERSION, rows: {} };
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

const withRow =
  (path: string, row: FileRow) =>
  (current: DrawnList | null): Decision<DrawnList, ListOutcome> => {
    const list = current ?? EMPTY_DRAWN;
    if (same(list.rows[path], row)) return { outcome: 'unchanged', next: null };
    return { outcome: 'changed', next: { ...list, rows: { ...list.rows, [path]: row } } };
  };

export async function recordDrawnPage(store: ObjectStore, page: DrawnPage): Promise<ListOutcome> {
  const row = checkPageRow(page.row);
  if (sha256(page.content) !== row.hash)
    throw new StorefrontStorageError('object-invalid', 'содержимое не совпадает с отпечатком строки', {
      path: row.path,
    });
  await uploadFiles(store, [{ path: row.file, content: page.content }]);
  const fileRow = { h: hexOf(row.hash), t: contentTypeOf(row.file), c: cacheClassOf(row.file), m: row.dataUpdatedAt };
  const key = drawnKey(page.shop, page.build);
  return (await updateObject(store, key, parseDrawnList, withRow(row.path, fileRow))).outcome;
}

// Новый список адресов — без повторов, по алфавиту; проверка схемой до записи: адрес без «/» не попадёт в список.
const withPaths =
  (key: string, change: (paths: readonly string[]) => string[]) =>
  (current: EntityList | null): Decision<EntityList, ListOutcome> => {
    const paths = current?.paths ?? [];
    const next = [...new Set(change(paths))].sort();
    if (same(next, paths)) return { outcome: 'unchanged', next: null };
    return { outcome: 'changed', next: parseEntityList({ v: FORMAT_VERSION, paths: next }, key) };
  };

async function changeEntityPaths(store: ObjectStore, shop: string, change: (paths: readonly string[]) => string[]) {
  const key = entitiesKey(shop);
  return (await updateObject(store, key, parseEntityList, withPaths(key, change))).outcome;
}

export const addEntityPaths = (store: ObjectStore, shop: string, paths: readonly string[]): Promise<ListOutcome> =>
  changeEntityPaths(store, shop, (current) => [...current, ...paths]);

export const removeEntityPaths = (store: ObjectStore, shop: string, paths: readonly string[]): Promise<ListOutcome> =>
  changeEntityPaths(store, shop, (current) => current.filter((path) => !paths.includes(path)));
