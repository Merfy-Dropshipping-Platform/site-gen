import type { StorefrontManifest } from '@merfy/storefront-build';
import { errorText } from './errors';
import type { Log } from './log';

// IndexNow (design.md блока 6, раздел 4, «Решил сам»): после переключения указателя — Яндексу адреса новых, изменённых
// и удалённых страниц по разнице манифестов, до 10 000 за запрос. Только магазины для поиска (STOREFRONT_INDEXABLE);
// файл ключа отдаёт раздача (блок 5, INDEXNOW_KEY). Сбой — строка журнала, сборка не падает: витрина уже переключена.

export const INDEXNOW_LIMIT = 10_000;
export const INDEXNOW_URL = 'https://yandex.com/indexnow';

export type Pages = StorefrontManifest['pages'];
export type Announce = (publicUrl: string, previous: Pages, next: Pages) => Promise<void>;

// Отправка JSON-тела POST-запросом; в тестах — подставная.
export type PostJson = (url: string, body: string) => Promise<{ status: number }>;

export interface IndexNowOptions {
  endpoint: string;
  key: string;
  log: Log;
  post?: PostJson;
}

const postJson: PostJson = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });

const hashes = (pages: Pages): Map<string, string> => new Map(pages.map((page) => [page.path, page.hash]));

// Пути страниц, которые поисковику надо перечитать: новые, с другим отпечатком и удалённые.
export function changedPaths(previous: Pages, next: Pages): string[] {
  const before = hashes(previous);
  const after = hashes(next);
  const changed = [...after].filter(([path, hash]) => before.get(path) !== hash).map(([path]) => path);
  const removed = [...before.keys()].filter((path) => !after.has(path));
  return [...changed, ...removed].sort();
}

async function post(options: IndexNowOptions, host: string, urlList: string[]): Promise<void> {
  const send = options.post ?? postJson;
  const body = JSON.stringify({ host, key: options.key, urlList });
  try {
    const response = await send(options.endpoint, body);
    options.log('indexnow', { host, urls: urlList.length, status: response.status });
  } catch (error) {
    options.log('indexnow-failed', { host, urls: urlList.length, error: errorText(error) });
  }
}

export function createIndexNow(options: IndexNowOptions): Announce {
  return async (publicUrl, previous, next) => {
    const urls = changedPaths(previous, next).map((path) => new URL(path, publicUrl).href);
    const host = new URL(publicUrl).host;
    for (let start = 0; start < urls.length; start += INDEXNOW_LIMIT) {
      await post(options, host, urls.slice(start, start + INDEXNOW_LIMIT));
    }
  };
}
