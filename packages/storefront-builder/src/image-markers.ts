import { parseMarker, type Marker } from '@merfy-dropshipping-platform/images';
import { imageUrlsIn, markerUrlOf, type BuildInputs } from '@merfy/storefront-build';
import type { Log } from './log';

// Маркеры копий картинок во входы сборки (модуль картинок Merfy, шаг 3). Сервисы product и sites кладут рядом с
// оригиналом копии и маркер `<ключ>.v.json` (последним); сборщик находит в данных магазина адреса наших картинок
// (ревизия, секции на страницах, сущности), читает по ним маркеры GET-ом и кладёт найденные во вход images. Нет маркера
// (404), сбой сети или битый маркер — картинки без копий: страница рисует оригинал, битой картинки не бывает. Имя
// маркера строится от пути адреса, читается он с хоста хранилища контура (image-urls.ts в storefront-build).
//
// Кеш в памяти процесса: найденный маркер — навсегда (оригинал не меняется, копию пережимают редко — тогда
// перезапуск), ненайденный — MISS_MS: копии делают сервисы позже загрузки, и часовая сверка (reconcile) увидит
// появившийся маркер как смену ключа сборки. Сборки магазинов берут одни и те же картинки (витрина — десятки
// запросов), без кеша каждая сборка ходила бы в хранилище за каждой.
export const MARKER_PARALLEL = 16;
export const MARKER_MISS_MS = 5 * 60_000;
const MARKER_TIMEOUT_MS = 5_000;

export type ImagesInput = BuildInputs['images'];

export interface ImageMarkers {
  // Входы images по значениям JSON (ревизия, код страниц, сущности); нет ни одной картинки с копиями — undefined.
  read: (values: readonly unknown[]) => Promise<ImagesInput>;
}

export interface ImageMarkerDeps {
  // Хранилище контура: origin без косой черты в конце и хосты, адреса которых считаем нашими.
  origin: string;
  hosts: readonly string[];
  // GET по адресу: глобальный fetch подходит; в тестах — подставная функция.
  fetch: (address: string, init: { signal: AbortSignal }) => Promise<Response>;
  clock: () => Date;
  log: Log;
}

// Ответ по одному маркеру: сам маркер (null — его нет) и признак «сбой» для журнала.
interface Reply {
  marker: Marker | null;
  failed: boolean;
}

interface CacheEntry {
  marker: Marker | null;
  // До какого времени (мс) запись годна; найденный маркер — всегда.
  until: number;
}

const FOUND_FOREVER = Number.POSITIVE_INFINITY;
const NOT_FOUND: Reply = { marker: null, failed: false };

// Маркер, у которого есть копии, — только такой нужен странице: без копий srcset не строится.
const hasCopies = (marker: Marker | null): marker is Marker =>
  marker !== null && marker.status === 'ok' && marker.variants.length > 0;

async function replyOf(deps: ImageMarkerDeps, address: string): Promise<Reply> {
  try {
    const response = await deps.fetch(address, { signal: AbortSignal.timeout(MARKER_TIMEOUT_MS) });
    if (response.status === 404) return NOT_FOUND;
    if (!response.ok) return { marker: null, failed: true };
    return { marker: parseMarker(await response.text()), failed: false };
  } catch {
    return { marker: null, failed: true };
  }
}

// Порциями по MARKER_PARALLEL: в хранилище за раз не больше запросов, чем порция.
async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < items.length; at += size)
    out.push(...(await Promise.all(items.slice(at, at + size).map(work))));
  return out;
}

interface MarkerCache {
  has: (address: string) => boolean;
  markerAt: (address: string) => Marker | null;
  keep: (address: string, marker: Marker | null) => void;
  dropExpired: () => void;
}

function markerCache(clock: () => Date): MarkerCache {
  const entries = new Map<string, CacheEntry>();
  const now = (): number => clock().getTime();
  return {
    has: (address) => entries.has(address),
    markerAt: (address) => entries.get(address)?.marker ?? null,
    keep: (address, marker) =>
      entries.set(address, { marker, until: marker === null ? now() + MARKER_MISS_MS : FOUND_FOREVER }),
    // Истёкшие «нет маркера» уходят из памяти при чтении: кеш не растёт от картинок, которых давно нет в данных.
    dropExpired: () => {
      for (const [address, entry] of entries) if (entry.until <= now()) entries.delete(address);
    },
  };
}

// Входы images: найденные маркеры с копиями по адресам картинок; ни одного — undefined.
function imagesInput(origin: string, urls: readonly string[], markers: readonly (Marker | null)[]): ImagesInput {
  const found = urls.flatMap((url, index): [string, Marker][] => {
    const marker = markers[index] ?? null;
    return hasCopies(marker) ? [[url, marker]] : [];
  });
  return found.length === 0 ? undefined : { origin, markers: Object.fromEntries(found) };
}

export function createImageMarkers(deps: ImageMarkerDeps): ImageMarkers {
  const cache = markerCache(deps.clock);

  async function load(address: string): Promise<Reply> {
    const reply = await replyOf(deps, address);
    cache.keep(address, reply.marker);
    return reply;
  }

  // Маркеры адресов картинок: из кеша или из хранилища; null — маркера нет. Сбои — одной строкой журнала на чтение.
  async function markersOf(urls: readonly string[]): Promise<(Marker | null)[]> {
    cache.dropExpired();
    const addresses = urls.map((url) => markerUrlOf(deps.origin, url) ?? '');
    const missing = [...new Set(addresses.filter((address) => address !== '' && !cache.has(address)))];
    const replies = await inBatches(missing, MARKER_PARALLEL, load);
    const failed = replies.filter((reply) => reply.failed).length;
    if (failed > 0) deps.log('image-markers-failed', { failed, asked: missing.length });
    return addresses.map(cache.markerAt);
  }

  return {
    read: async (values) => {
      const urls = imageUrlsIn(values, deps.hosts);
      return imagesInput(deps.origin, urls, await markersOf(urls));
    },
  };
}
