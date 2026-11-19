import { isDerivedKey, markerKey } from '@merfy-dropshipping-platform/images';

// Картинки магазина, у которых могут быть копии (модуль картинок, шаг 3): какие адреса из данных считаем «нашими» и под
// каким ключом хранилища лежит оригинал. Копии и маркер строятся от ключа оригинала (`<ключ>.d.webp`, `<ключ>.m.webp`,
// `<ключ>.v.json`), а ключ — это путь адреса без хоста: в dev-данных бывают адреса с хостом прода (minio.merfy.ru), а
// файлы лежат в хранилище контура. Поэтому маркер и копии берутся с хоста контура (images.origin), не с хоста адреса.

// Форматы, из которых делаются копии (SUPPORTED_FORMATS модуля): у gif и svg копий нет, маркер за ними не ходим.
const COPYABLE_PATH = /\.(?:jpe?g|png|webp)$/i;
// Адрес в строке данных: и строка-адрес, и адрес внутри разметки (текст статьи, настройка «текст»).
const URL_IN_TEXT = /https?:\/\/[^\s"'<>\\)]+/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Все строки значения JSON, на любой глубине.
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (isRecord(value)) return Object.values(value).flatMap(stringsOf);
  return [];
}

function parsedUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Ключ оригинала в хранилище — путь адреса без первой косой черты; нет — это не картинка с копиями.
export function imageKeyOf(url: string): string | null {
  const path = parsedUrl(url)?.pathname.slice(1) ?? '';
  if (path === '' || !COPYABLE_PATH.test(path) || isDerivedKey(path)) return null;
  return path;
}

// Адрес нашего хранилища: хост из списка (без учёта регистра) и ключ с копиями.
export function isOurImage(url: string, hosts: readonly string[]): boolean {
  const host = parsedUrl(url)?.host.toLowerCase() ?? '';
  return hosts.includes(host) && imageKeyOf(url) !== null;
}

// Наши картинки в значениях JSON — по одному разу, по алфавиту (порядок не должен менять входы).
export function imageUrlsIn(values: readonly unknown[], hosts: readonly string[]): string[] {
  const found = values.flatMap(stringsOf).flatMap((text) => text.match(URL_IN_TEXT) ?? []);
  return [...new Set(found.filter((url) => isOurImage(url, hosts)))].sort();
}

// Где лежит маркер оригинала: хост контура и ключ. Нет ключа — null.
export function markerUrlOf(origin: string, url: string): string | null {
  const key = imageKeyOf(url);
  return key === null ? null : `${origin}/${markerKey(key)}`;
}
