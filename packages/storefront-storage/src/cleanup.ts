import { parseDrawnList, parsePointer, parseRoutesTable, type Pointer } from './formats';
import { STOREFRONT_PREFIX, drawnKey, manifestKey, routesKey } from './layout';
import { readObject } from './objects';
import type { ListedObject, ObjectStore } from './store';

// Уборка раз в сутки (design.md блока 5, раздел 4, «Хранение и уборка») по схеме «пометить и вымести». Храним у
// магазина последние 5 сборок, последнюю сборку каждой из 3 последних пар «рендер + тема», всё моложе суток и всё, на
// что смотрит указатель: живую, ждущую и историю — на них откатываются. Файлы, на которые не ссылается ни одна хранимая
// сборка (таблица раздачи и список дорисовок), удаляем, если они старше суток: свежий файл могла залить выкладка,
// которая ещё идёт. Решения — чистые функции buildsToKeep и blobsToRemove, ввод-вывод — planCleanup и runCleanup.

export const KEEP_LAST_BUILDS = 5;
export const KEEP_VERSION_PAIRS = 3;
export const KEEP_YOUNGER_MS = 24 * 60 * 60 * 1000;

const ROUTES_PREFIX = `${STOREFRONT_PREFIX}routes/`;
const ROUTES_KEY = /^storefront\/routes\/([^/]+)\/(\d+)\.json$/;

export interface StoredBuild {
  shop: string;
  build: number;
  // Когда записана таблица раздачи сборки, ISO UTC.
  writtenAt: string;
}

export interface CleanupPlan {
  keptBuilds: StoredBuild[];
  removedBuilds: StoredBuild[];
  // Ключи файлов storefront/blobs/….
  removedBlobs: string[];
}

const isYoung = (writtenAt: string, now: string): boolean => Date.parse(now) - Date.parse(writtenAt) < KEEP_YOUNGER_MS;
function pointerBuilds(pointer: Pointer | undefined): number[] {
  if (pointer === undefined) return [];
  const pending = pointer.pending === null ? [] : [pointer.pending];
  return [pointer.build, ...pending, ...pointer.history];
}

// Последняя сборка каждой из первых KEEP_VERSION_PAIRS пар; pairs — «сборка → пара», от новых сборок к старым.
function newestOfPairs(pairs: ReadonlyMap<number, string>): number[] {
  const firstOfPair = new Map<string, number>();
  pairs.forEach((pair, build) => firstOfPair.set(pair, firstOfPair.get(pair) ?? build));
  return [...firstOfPair.values()].slice(0, KEEP_VERSION_PAIRS);
}

export function buildsToKeep(
  builds: readonly StoredBuild[],
  pairs: ReadonlyMap<number, string>,
  pointer: Pointer | undefined,
  now: string,
): Set<number> {
  const newest = [...builds].sort((left, right) => right.build - left.build).slice(0, KEEP_LAST_BUILDS);
  const young = builds.filter((build) => isYoung(build.writtenAt, now));
  const byRules = [...newest, ...young].map((build) => build.build);
  return new Set([...byRules, ...newestOfPairs(pairs), ...pointerBuilds(pointer)]);
}

export function blobsToRemove(blobs: readonly ListedObject[], marked: ReadonlySet<string>, now: string): string[] {
  const unmarked = blobs.filter((blob) => !marked.has(blob.key.slice(blob.key.lastIndexOf('/') + 1)));
  return unmarked.filter((blob) => !isYoung(blob.modifiedAt, now)).map((blob) => blob.key);
}

// Сборки — по таблицам раздачи: storefront/routes/<магазин>/<сборка>.json.
async function storedBuilds(store: ObjectStore): Promise<StoredBuild[]> {
  const listed = await store.list(ROUTES_PREFIX);
  return listed.flatMap((object) => {
    const match = ROUTES_KEY.exec(object.key);
    return match === null ? [] : [{ shop: match[1], build: Number(match[2]), writtenAt: object.modifiedAt }];
  });
}

async function pointersByShop(store: ObjectStore): Promise<Map<string, Pointer>> {
  const listed = await store.list(`${STOREFRONT_PREFIX}pointers/`);
  const read = await Promise.all(listed.map((object) => readObject(store, object.key, parsePointer)));
  return new Map(read.flatMap((pointer) => (pointer === null ? [] : [[pointer.value.shop, pointer.value] as const])));
}

// Пары «рендер + тема» — из таблиц раздачи, от новых сборок к старым, пока не набралось KEEP_VERSION_PAIRS разных.
async function readPairs(store: ObjectStore, shop: string, builds: readonly number[]): Promise<Map<number, string>> {
  const pairs = new Map<number, string>();
  for (const build of builds) {
    if (new Set(pairs.values()).size >= KEEP_VERSION_PAIRS) break;
    const table = await readObject(store, routesKey(shop, build), parseRoutesTable);
    if (table !== null) pairs.set(build, `${table.value.versions.render} ${table.value.versions.theme}`);
  }
  return pairs;
}

async function keptOfShop(store: ObjectStore, builds: StoredBuild[], pointer: Pointer | undefined, now: string) {
  const descending = builds.map((build) => build.build).sort((left, right) => right - left);
  const pairs = await readPairs(store, builds[0].shop, descending);
  const kept = buildsToKeep(builds, pairs, pointer, now);
  return builds.filter((build) => kept.has(build.build));
}

// Пометить: отпечатки из таблиц раздачи и списков дорисовок хранимых сборок.
async function markedHashes(store: ObjectStore, kept: readonly StoredBuild[]): Promise<Set<string>> {
  const marked = new Set<string>();
  for (const { shop, build } of kept) {
    const table = await readObject(store, routesKey(shop, build), parseRoutesTable);
    const drawn = await readObject(store, drawnKey(shop, build), parseDrawnList);
    const rows = [...Object.values(table?.value.files ?? {}), ...Object.values(drawn?.value.rows ?? {})];
    rows.forEach((row) => marked.add(row.h));
  }
  return marked;
}

export async function planCleanup(store: ObjectStore, now: string): Promise<CleanupPlan> {
  const builds = await storedBuilds(store);
  const pointers = await pointersByShop(store);
  const keptBuilds: StoredBuild[] = [];
  for (const shop of new Set(builds.map((build) => build.shop))) {
    const ofShop = builds.filter((build) => build.shop === shop);
    keptBuilds.push(...(await keptOfShop(store, ofShop, pointers.get(shop), now)));
  }
  const removedBuilds = builds.filter((build) => !keptBuilds.includes(build));
  const marked = await markedHashes(store, keptBuilds);
  const removedBlobs = blobsToRemove(await store.list(`${STOREFRONT_PREFIX}blobs/`), marked, now);
  return { keptBuilds, removedBuilds, removedBlobs };
}

// apply = false — пробный прогон: только план. Сначала уходят сборки, потом файлы.
export async function runCleanup(store: ObjectStore, now: string, apply: boolean): Promise<CleanupPlan> {
  const plan = await planCleanup(store, now);
  if (!apply) return plan;
  const keys = plan.removedBuilds.flatMap(({ shop, build }) => [
    manifestKey(shop, build),
    routesKey(shop, build),
    drawnKey(shop, build),
  ]);
  await store.remove(keys);
  await store.remove(plan.removedBlobs);
  return plan;
}
