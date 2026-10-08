import type { PageEntityType, PageRow, StorefrontManifest } from '@merfy/storefront-build';
import { cacheClassOf, contentTypeOf } from './content-types';
import { FORMAT_VERSION, type FileRow, type RoutesTable } from './formats';
import { hexOf } from './layout';

// Таблица раздачи сборки из её манифеста (design.md блока 5, В5-1 Б и раздел 4, «Удалённое, коды ответа и карта
// сайта»): «путь → строка файла», переезды (301) и удалённое (410) — из разницы с прошлой живой сборкой.

// Страница 404 темы — файл 404.html в корне сборки. У nova в этапе её нет: notFound — null, раздача отвечает своей.
export const NOT_FOUND_FILE = '404.html';
// Удалённые товар, коллекция и публикация отвечают 410 полгода, остальные страницы — обычной 404.
export const GONE_ENTITY_TYPES: ReadonlySet<PageEntityType> = new Set(['product', 'collection', 'publication']);
export const GONE_DAYS = 183;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PreviousBuild {
  manifest: StorefrontManifest;
  table: RoutesTable;
}

export interface RoutesTableRequest {
  manifest: StorefrontManifest;
  build: number;
  // Живая сборка до этой: с ней сравниваем адреса. Первая выкладка — null.
  previous: PreviousBuild | null;
  now: string;
}

type Files = Record<string, FileRow>;
type Fate = { kind: 'moved'; to: string } | { kind: 'gone'; until: string } | null;

const entityKeyOf = (page: PageRow): string => `${page.entity.type}:${page.entity.id}`;
const goneUntil = (now: string): string => new Date(Date.parse(now) + GONE_DAYS * DAY_MS).toISOString();

// Каждый файл — по пути от корня; страница — ещё и по своему адресу. У файла страницы — дата правки её данных.
function servedFiles(manifest: StorefrontManifest): Files {
  const pageByFile = new Map(manifest.pages.map((page) => [page.file, page]));
  const rowOf = (filePath: string, hash: string): FileRow => {
    const row: FileRow = { h: hexOf(hash), t: contentTypeOf(filePath), c: cacheClassOf(filePath) };
    const page = pageByFile.get(filePath);
    return page === undefined ? row : { ...row, m: page.dataUpdatedAt };
  };
  const files = Object.entries(manifest.files).map(
    ([filePath, hash]) => [`/${filePath}`, rowOf(filePath, hash)] as const,
  );
  const pages = manifest.pages.map((page) => [page.path, rowOf(page.file, page.hash)] as const);
  return Object.fromEntries([...files, ...pages]);
}

// Сущности с одной страницей: только у них новый адрес однозначен. У сайта страниц много — 301 на главную соврал бы.
function singlePageEntities(pages: readonly PageRow[]): Map<string, string> {
  const counts = new Map<string, number>();
  pages.forEach((page) => counts.set(entityKeyOf(page), (counts.get(entityKeyOf(page)) ?? 0) + 1));
  const single = pages.filter((page) => counts.get(entityKeyOf(page)) === 1);
  return new Map(single.map((page) => [entityKeyOf(page), page.path]));
}

// Адреса прошлой сборки, которых нет в новой: та же сущность живёт по другому адресу — переезд; сущности больше нет,
// а это товар, коллекция или публикация — удалено до даты; остальное — обычная 404.
function departures(previous: StorefrontManifest, next: StorefrontManifest, until: string) {
  const nextPaths = new Set(next.pages.map((page) => page.path));
  const nextEntities = new Set(next.pages.map(entityKeyOf));
  const [before, after] = [singlePageEntities(previous.pages), singlePageEntities(next.pages)];
  const left = previous.pages.filter((page) => !nextPaths.has(page.path));
  const moved = left.flatMap((page) => {
    const to = before.has(entityKeyOf(page)) ? after.get(entityKeyOf(page)) : undefined;
    return to === undefined ? [] : [[page.path, to] as const];
  });
  const removed = left.filter(
    (page) => !nextEntities.has(entityKeyOf(page)) && GONE_ENTITY_TYPES.has(page.entity.type),
  );
  return { moved, gone: removed.map((page) => [page.path, until] as const) };
}

// Куда в итоге ведёт старый адрес: идём по переездам до страницы новой сборки или до удалённого адреса.
function fateOf(path: string, moved: Map<string, string>, gone: Map<string, string>, files: Files): Fate {
  const seen = new Set([path]);
  let target = moved.get(path);
  while (target !== undefined && !seen.has(target)) {
    if (target in files) return { kind: 'moved', to: target };
    const until = gone.get(target);
    if (until !== undefined) return { kind: 'gone', until };
    seen.add(target);
    target = moved.get(target);
  }
  return null;
}

// Переезды — сразу на последний адрес, удалённое — пока не вышел срок; адрес, который снова отдаётся, из обоих уходит.
function settle(moved: Map<string, string>, gone: Map<string, string>, files: Files) {
  const fates = [...moved.keys()].map((path) => [path, fateOf(path, moved, gone, files)] as const);
  const finalMoved = fates.flatMap(([path, fate]) => (fate?.kind === 'moved' ? [[path, fate.to] as const] : []));
  const movedGone = fates.flatMap(([path, fate]) => (fate?.kind === 'gone' ? [[path, fate.until] as const] : []));
  const notServed = ([path]: readonly [string, string]): boolean => !(path in files);
  return {
    moved: Object.fromEntries(finalMoved.filter(notServed)),
    gone: Object.fromEntries([...gone, ...movedGone].filter(notServed)),
  };
}

function redirects(request: RoutesTableRequest, files: Files): Pick<RoutesTable, 'moved' | 'gone'> {
  const { previous, manifest, now } = request;
  if (previous === null) return { moved: {}, gone: {} };
  const departed = departures(previous.manifest, manifest, goneUntil(now));
  const stillGone = Object.entries(previous.table.gone).filter(([, until]) => Date.parse(until) > Date.parse(now));
  const moved = new Map([...Object.entries(previous.table.moved), ...departed.moved]);
  return settle(moved, new Map([...stillGone, ...departed.gone]), files);
}

const notFoundOf = (manifest: StorefrontManifest): string | null =>
  NOT_FOUND_FILE in manifest.files ? hexOf(manifest.files[NOT_FOUND_FILE]) : null;

export function buildRoutesTable(request: RoutesTableRequest): RoutesTable {
  const { manifest, build } = request;
  const files = servedFiles(manifest);
  return {
    v: FORMAT_VERSION,
    shop: manifest.shop.id,
    build,
    versions: { render: manifest.platform.renderHash, theme: `${manifest.theme.id}@${manifest.theme.version}` },
    notFound: notFoundOf(manifest),
    files,
    ...redirects(request, files),
  };
}
